const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.static('public'));

// ——————— WORLD DIMENSIONS ———————
// Will be set once, by the first client that connects:
let worldWidth  = null;
let worldHeight = null;
const SPAWN_PADDING = 50;  // don’t spawn right on the edge

// ——————— GAME CONSTANTS ———————
const INITIAL_SIZE      = 40;
const INITIAL_SPEED     = 50;
const SIZE_INCREMENT    = 10;
const SPEED_DECREMENT   = 5;
const MIN_SPEED         = 10;
const RESPAWN_DELAY_MS  = 3000;

// ——————— BULLET CONSTANTS ———————
const BULLET_SPEED       = 500;   // px/sec
const BULLET_LIFETIME_MS = 4000;  // ms before a bullet disappears

// ——————— COLOURS ———————
const COLORS = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231',
  '#911eb4','#42d4f4','#f032e6','#bfef45','#fabebe'
];

// ——————— PLAYER & BULLET STORAGE ———————
const players       = new Map();  // id → { ws, position, size, speed, alive, colour }
const pendingClients = new Map(); // ws → id, while we wait for their dims
let bullets         = [];         // { id, shooterId, x, y, dx, dy, createdAt }
let nextBulletId    = 1;

// Helper to pick a random point in the world (with padding)
function randomSpawn() {
  return {
    x: SPAWN_PADDING + Math.random() * (worldWidth  - 2 * SPAWN_PADDING),
    y: SPAWN_PADDING + Math.random() * (worldHeight - 2 * SPAWN_PADDING)
  };
}

// Broadcast the full game state to every client
function broadcastState() {
  const playerSnap = {};
  for (const [pid, p] of players.entries()) {
    playerSnap[pid] = {
      position: p.position,
      size:     p.size,
      speed:    p.speed,
      alive:    p.alive,
      colour:   p.colour
    };
  }
  const bulletSnap = bullets.map(b => ({
    id: b.id,
    x:  b.x,
    y:  b.y
  }));

  const msg = JSON.stringify({
    type:    'update',
    players: playerSnap,
    bullets: bulletSnap
  });

  for (const { ws } of players.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Handle melee collisions: mover always wins
function handleMelee(attackerId) {
  const attacker = players.get(attackerId);
  if (!attacker || !attacker.alive) return;

  for (const [otherId, other] of players.entries()) {
    if (otherId === attackerId || !other.alive) continue;
    const dx   = attacker.position.x - other.position.x;
    const dy   = attacker.position.y - other.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist < (attacker.size + other.size) / 2) {
      attacker.size  += SIZE_INCREMENT;
      attacker.speed  = Math.max(attacker.speed - SPEED_DECREMENT, MIN_SPEED);
      killAndRespawn(otherId);
    }
  }
}

// Kill a player, then respawn them randomly after a delay
function killAndRespawn(pid) {
  const p = players.get(pid);
  if (!p || !p.alive) return;
  p.alive = false;
  broadcastState(); // hide them immediately

  setTimeout(() => {
    p.alive    = true;
    p.position = randomSpawn();
    p.size     = INITIAL_SIZE;
    p.speed    = INITIAL_SPEED;
    broadcastState();
  }, RESPAWN_DELAY_MS);
}

// ——————— CONNECTION LOGIC ———————
wss.on('connection', (ws) => {
  // Assign a temporary ID and wait for the client to send its window size
  const id = Date.now().toString();
  pendingClients.set(ws, id);

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); }
    catch { return; }

    // ————— Handshake: receive window dimensions —————
    if (data.type === 'set_dimensions' && pendingClients.has(ws)) {
      const pid = pendingClients.get(ws);
      pendingClients.delete(ws);

      // First client sets the world size
      if (worldWidth === null) {
        worldWidth  = data.width;
        worldHeight = data.height;
        console.log(`World set to ${worldWidth} × ${worldHeight}`);
      }

      // Now fully register the player
      const spawn = randomSpawn();
      const colour = COLORS[Math.floor(Math.random() * COLORS.length)];

      players.set(pid, {
        ws,
        position: spawn,
        size:     INITIAL_SIZE,
        speed:    INITIAL_SPEED,
        alive:    true,
        colour
      });

      // Tell them their assigned ID
      ws.send(JSON.stringify({ type: 'init', id: pid }));
      // And broadcast everyone the new state
      broadcastState();
      return;
    }

    // ————— Other messages (move / fire) —————
    const pid = pendingClients.get(ws) || [...players].find(([k,v])=>v.ws===ws)?.[0];
    if (!pid || !players.has(pid)) return;

    const me = players.get(pid);
    if (!me.alive) return;

    if (data.type === 'move' && data.position) {
      me.position = data.position;
      handleMelee(pid);
      broadcastState();
    }
    else if (data.type === 'fire' && data.direction) {
      const { x: dx, y: dy } = data.direction;
      const mag = Math.hypot(dx, dy);
      if (mag > 0) {
        const ux = dx / mag, uy = dy / mag;
        bullets.push({
          id:        nextBulletId++,
          shooterId: pid,
          x:         me.position.x,
          y:         me.position.y,
          dx:        ux,
          dy:        uy,
          createdAt: Date.now()
        });
      }
    }
  });

  ws.on('close', () => {
    pendingClients.delete(ws);
    if (players.has(id)) {
      players.delete(id);
      broadcastState();
    }
  });
});

// ——————— BULLET TICK (runs every 50ms) ———————
let lastTick = Date.now();
setInterval(() => {
  // Don’t run until we know the world size
  if (worldWidth === null || worldHeight === null) return;

  const now = Date.now();
  const dt  = (now - lastTick) / 1000;
  lastTick  = now;

  // Move each bullet
  bullets.forEach(b => {
    b.x += b.dx * BULLET_SPEED * dt;
    b.y += b.dy * BULLET_SPEED * dt;
  });

  // Collision & expiry
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b   = bullets[i];
    const age = now - b.createdAt;

    // Remove if too old or out of bounds
    if (age > BULLET_LIFETIME_MS ||
        b.x < 0 || b.x > worldWidth ||
        b.y < 0 || b.y > worldHeight) {
      bullets.splice(i, 1);
      continue;
    }

    // Check hit against every alive player except the shooter
    for (const [pid, p] of players.entries()) {
      if (pid === b.shooterId || !p.alive) continue;
      const dx   = p.position.x - b.x;
      const dy   = p.position.y - b.y;
      if (Math.hypot(dx, dy) < p.size / 2) {
        killAndRespawn(pid);
        bullets.splice(i, 1);
        break;
      }
    }
  }

  broadcastState();
}, 50);

// ——————— START SERVER ———————
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
