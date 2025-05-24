// 1. Socket setup
const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

// 2. Tell server our container size
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({
    type:   'set_dimensions',
    width:  gameArea.clientWidth,
    height: gameArea.clientHeight
  }));
});

// --- Blob & Pointer ---
const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

myBlob.scoreElement = document.createElement('div'); // <<< ADD THIS
myBlob.scoreElement.className = 'score-display';    // <<< ADD THIS
myBlob.appendChild(myBlob.scoreElement);            // <<< ADD THIS

const pointer = document.createElement('div');
pointer.className = 'pointer';
myBlob.appendChild(pointer);

// State
let playerId           = null;
let myPosition         = { x: 100, y: 100 };
let mySpeed            = 40;
let mySize             = 40;
let alive              = true;
let skipNextSelfUpdate = true;

// Pointer animation
let pointerAngle    = 0;
const POINTER_SPEED = 120;
let lastP           = performance.now();

function animatePointer(now = performance.now()) {
  const dt = (now - lastP) / 1000;
  lastP = now;
  pointerAngle = (pointerAngle + POINTER_SPEED * dt) % 360;
  pointer.style.transform = `rotate(${pointerAngle}deg)`;

  updateParticles(); // Update and render all active particles

  requestAnimationFrame(animatePointer);
}
requestAnimationFrame(animatePointer);

// Render helpers
function updatePointer() {
  pointer.style.width = `${mySize/2 + 12}px`;
}
function renderMe() {
  myBlob.style.width  = `${mySize}px`;
  myBlob.style.height = `${mySize}px`;
  updatePointer();
  myBlob.style.left   = `${myPosition.x - mySize/2}px`;
  myBlob.style.top    = `${myPosition.y - mySize/2}px`;
}
renderMe();

// Track bullets by ID
const bullets = {};
// Track previous player states for effects like death explosions
const previousPlayerInfo = new Map();

// Handle server messages
socket.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'init') {
    playerId = msg.id;
    return;
  }
  if (msg.type !== 'update') return;

  // Players
  const currentPlayerIds = new Set();
  Object.entries(msg.players).forEach(([id, info]) => {
    currentPlayerIds.add(id);
    const isMe = id === playerId;
    let el = isMe
      ? myBlob
      : document.querySelector(`.blob[data-id="${id}"]`);

    // Death explosion logic
    const prevInfo = previousPlayerInfo.get(id);
    if (prevInfo && prevInfo.alive && !info.alive) {
      console.log(`Player ${id} died. Spawning pixel explosion.`);
      // Use prevInfo for position and color if info might be reset
      const explosionX = prevInfo.position ? prevInfo.position.x : info.position.x;
      const explosionY = prevInfo.position ? prevInfo.position.y : info.position.y;
      const explosionColor = prevInfo.colour || info.colour || 'grey';

      // Updated parameters for "pixel" look death explosion
      spawnParticles(15, explosionX, explosionY, explosionColor, {
        baseSpeed: 2.5,
        // spread: Math.PI * 2, // Default for spawnParticles if no direction
        drag: 0.96,
        size: 10, // Larger size for pixel effect
        lifetime: 700
      });
    }

    if (!el && !isMe) {
      el = document.createElement('div');
      el.className = 'blob';
      el.dataset.id = id;
      gameArea.appendChild(el);
    }
    if (!el) { // If element still not found (e.g. for 'me' if myBlob issue), store state and skip DOM
      previousPlayerInfo.set(id, { ...info });
      return;
    }

    el.style.background = info.colour;
    el.style.display    = info.alive ? 'block' : 'none';

    // Store the current state for the next update BEFORE returning if not alive
    // This ensures we have the 'dead' state recorded.
    previousPlayerInfo.set(id, { ...info });

    if (!info.alive) {
        // If it's the local player and they died, update their 'alive' state
        if (isMe) {
            alive = false;
        }
        return; // Skip further processing for dead players
    }

    el.style.width  = `${info.size}px`;
    el.style.height = `${info.size}px`;
    el.style.left   = `${info.position.x - info.size/2}px`;
    el.style.top    = `${info.position.y - info.size/2}px`;

    if (!el.scoreElement) {
      el.scoreElement = document.createElement('div');
      el.scoreElement.className = 'score-display';
      el.appendChild(el.scoreElement);
    }
    el.scoreElement.textContent = info.score;

    if (isMe) {
      // Update local player's 'alive' state based on server info
      alive = info.alive; 

      if (skipNextSelfUpdate) {
        skipNextSelfUpdate = false;
        // Ensure myPosition is initialized from the first server update if skipped
        myPosition = info.position; 
        mySpeed    = info.speed;
        mySize     = info.size;
        renderMe(); // Render once with initial server state
      } else {
        myPosition = info.position;
        mySpeed    = info.speed;
        mySize     = info.size;
        renderMe();
      }
    }
  });

  // Clean up players that are no longer sent by the server
  for (const id of previousPlayerInfo.keys()) {
    if (!currentPlayerIds.has(id)) {
      previousPlayerInfo.delete(id);
      console.log(`Removed player ${id} from previousPlayerInfo`);
    }
  }

  // Bullets
  const seen = new Set();
  msg.bullets.forEach(b => {
    seen.add(b.id);
    let el = bullets[b.id];
    if (!el) {
      el = document.createElement('div');
      el.className = 'bullet';
      gameArea.appendChild(el);
      bullets[b.id] = el;
    }
    el.style.left = `${b.x - 5}px`;
    el.style.top  = `${b.y - 5}px`;
  });
  // remove old bullets
  Object.keys(bullets).forEach(id => {
    if (!seen.has(Number(id))) {
      bullets[id].remove();
      delete bullets[id];
    }
  });
});

// Particle System
class Particle {
  constructor(x, y, vx, vy, size, color, lifetime, element) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size; // This is the spawned size
    this.initialSize = size; // Store initial size for effects like shrinking
    this.color = color;
    this.lifetime = lifetime;
    this.element = element;
    this.createdAt = Date.now();
  }
}

let particles = [];

function spawnParticles(count, x, y, color, options = {}) {
  const baseSpeed = options.baseSpeed || 20; // pixels per second
  const spread = options.spread !== undefined ? options.spread : Math.PI * 2; // Full circle spread by default
  const drag = options.drag || 0.98;
  const particleSize = options.size || 5; // Use options.size directly
  const baseLifetime = options.lifetime || 1000; // milliseconds
  // Removed isFlameEffect

  let baseAngle = 0;
  if (options.direction && options.direction.x !== undefined && options.direction.y !== undefined) {
    baseAngle = Math.atan2(options.direction.y, options.direction.x);
  } else {
    // If no direction, pick a random base angle for full spread
    baseAngle = Math.random() * Math.PI * 2;
  }

  for (let i = 0; i < count; i++) {
    // Apply spread relative to baseAngle
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const speed = baseSpeed * (0.5 + Math.random() * 0.5); // Vary speed a bit

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Removed particle size variation for this revert
    // Removed particle color variation for flame

    const element = document.createElement('div');
    element.className = 'particle';
    element.style.position = 'absolute'; // Important for positioning
    element.style.width = `${particleSize}px`; // Use direct particleSize
    element.style.height = `${particleSize}px`; // Use direct particleSize
    element.style.backgroundColor = color; // Use direct color
    element.style.left = `${x - particleSize / 2}px`;
    element.style.top = `${y - particleSize / 2}px`;
    gameArea.appendChild(element);

    const particle = new Particle(
      x, y,
      vx, vy,
      particleSize, // Use direct particleSize
      color,        // Use direct color
      baseLifetime,
      element
    );
    particle.drag = drag;

    // Removed isFlame and specific initialSize setting here (done in constructor)
    particles.push(particle);
  }
}

function updateParticles() {
  const now = Date.now();
  const dt = 16 / 1000; // Approximate delta time, assuming 60fps. Better to pass actual dt.

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    // Update position
    p.x += p.vx * dt * 10; // Scale velocity for visible movement
    p.y += p.vy * dt * 10; // Scale velocity for visible movement


    // Apply drag if it exists
    if (p.drag) {
      p.vx *= p.drag;
      p.vy *= p.drag;
    }

    // Update lifetime
    // If lifetime is stored as initial lifetime and we use createdAt:
    const age = now - p.createdAt;
    if (age >= p.lifetime) {
      p.element.remove();
      particles.splice(i, 1);
    } else {
      const lifetimeProgress = Math.min(age / p.lifetime, 1.0);

      // Generic Opacity Fade
      p.element.style.opacity = Math.max(0, 1 - lifetimeProgress);

      // Generic Shrinking
      const currentSize = p.initialSize * Math.max(0, 1 - lifetimeProgress);
      p.element.style.width = `${currentSize}px`;
      p.element.style.height = `${currentSize}px`;
      p.element.style.left = `${p.x - currentSize / 2}px`;
      p.element.style.top = `${p.y - currentSize / 2}px`;

      // Ensure p.element.style.backgroundColor is set if it wasn't, or reset if needed
      // (though particles are created with a color, so this might not be strictly necessary unless colors were changed)
      // For this revert, we assume particles retain their spawned color.
      // No flame-specific color transitions.
    }
  }
}

// Controls
const moveBtn = document.getElementById('moveBtn');
const fireBtn = document.getElementById('fireBtn');

function getDir() {
  const rad = pointerAngle * Math.PI/180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function doMove() {
  if (!alive) return;
  const moveDir = getDir();
  myPosition.x += moveDir.x * mySpeed;
  myPosition.y += moveDir.y * mySpeed;
  renderMe();
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));

  // Spawn movement particles - Updated for "pixel" look
  const particleColor = myBlob.style.background || 'grey'; // Fallback color
  spawnParticles(3, myPosition.x, myPosition.y, particleColor, { // count adjusted
    direction: { x: -moveDir.x, y: -moveDir.y },
    baseSpeed: 1.5,       // baseSpeed adjusted
    spread: Math.PI / 7,  // spread adjusted
    drag: 0.92,           // drag adjusted
    size: 8,              // Larger size for pixel effect
    lifetime: 350         // lifetime adjusted
  });
}

function doFire() {
  if (!alive) return;
  socket.send(JSON.stringify({ type: 'fire', direction: getDir() }));
}

['click','touchstart'].forEach(evt => {
  moveBtn.addEventListener(evt, e => { e.preventDefault(); doMove(); });
  fireBtn.addEventListener(evt, e => { e.preventDefault(); doFire(); });
});

// desktop fallback
document.addEventListener('keydown', e => {
  if (e.key === 'm') doMove();
  if (e.key === 'f') doFire();
});
