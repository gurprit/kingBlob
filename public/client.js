// public/client.js

// 1. Create the socket
const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

// 2. Send our window size on open for proper spawning
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({
    type:  'set_dimensions',
    width: window.innerWidth,
    height: window.innerHeight
  }));
});

// --- Blob + Pointer setup ---
const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

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

// Pointer rotation
let pointerAngle    = 0;
const POINTER_SPEED = 120; // deg/sec
let lastPointerTime = performance.now();

function animatePointer(now = performance.now()) {
  const dt = (now - lastPointerTime) / 1000;
  lastPointerTime = now;
  pointerAngle = (pointerAngle + POINTER_SPEED * dt) % 360;
  pointer.style.transform = `rotate(${pointerAngle}deg)`;
  requestAnimationFrame(animatePointer);
}
requestAnimationFrame(animatePointer);

// Render helpers
function updatePointer() {
  const length = mySize / 2 + 12;
  pointer.style.width = `${length}px`;
}

function renderMe() {
  myBlob.style.width  = `${mySize}px`;
  myBlob.style.height = `${mySize}px`;
  updatePointer();
  myBlob.style.left   = `${myPosition.x - mySize/2}px`;
  myBlob.style.top    = `${myPosition.y - mySize/2}px`;
}
renderMe();

// Keep DOM elements for bullets
const bullets = {}; // id → element

// --- Socket Handlers ---
socket.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'init') {
    playerId = msg.id;
    return;
  }

  if (msg.type === 'update') {
    // 1) Update all players
    Object.entries(msg.players).forEach(([id, info]) => {
      const isMe = id === playerId;
      let el = isMe
        ? myBlob
        : document.querySelector(`.blob[data-id="${id}"]`);

      if (!el && !isMe) {
        el = document.createElement('div');
        el.className = 'blob';
        el.dataset.id = id;
        gameArea.appendChild(el);
      }

      if (!el) return;

      el.style.background = info.colour;
      el.style.display    = info.alive ? 'block' : 'none';
      if (!info.alive) return;

      el.style.width  = `${info.size}px`;
      el.style.height = `${info.size}px`;
      el.style.left   = `${info.position.x - info.size/2}px`;
      el.style.top    = `${info.position.y - info.size/2}px`;

      if (isMe) {
        if (skipNextSelfUpdate) {
          skipNextSelfUpdate = false;
        } else {
          myPosition = info.position;
          mySpeed    = info.speed;
          mySize     = info.size;
          renderMe();
        }
      }
    });

    // 2) Update bullets
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
    // remove bullets that disappeared server-side
    Object.keys(bullets).forEach(id => {
      if (!seen.has(Number(id))) {
        bullets[id].remove();
        delete bullets[id];
      }
    });
  }
});

// --- Controls & Actions ---
const moveBtn = document.getElementById('moveBtn');
const fireBtn = document.getElementById('fireBtn');

function getDirectionVector() {
  const rad = pointerAngle * Math.PI/180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function doMove() {
  if (!alive) return;
  const dir = getDirectionVector();
  myPosition.x += dir.x * mySpeed;
  myPosition.y += dir.y * mySpeed;
  renderMe();
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
}

function doFire() {
  if (!alive) return;
  const dir = getDirectionVector();
  socket.send(JSON.stringify({ type: 'fire', direction: dir }));
}

['click','touchstart'].forEach(evt => {
  moveBtn.addEventListener(evt, e => { e.preventDefault(); doMove(); });
  fireBtn.addEventListener(evt, e => { e.preventDefault(); doFire(); });
});

// Desktop fallback
document.addEventListener('keydown', e => {
  if (e.key === 'm') doMove();
  if (e.key === 'f') doFire();
});
