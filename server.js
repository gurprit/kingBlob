const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.static('public'));

// ——————— WORLD DIMENSIONS ———————
// Will be set by the first client’s container size
let worldWidth  = null;
let worldHeight = null;
const SPAWN_PADDING = 50;

// ——————— GAME CONSTANTS ———————
const INITIAL_SIZE      = 40;
const INITIAL_SPEED     = 50;
const SIZE_INCREMENT    = 10;
const SPEED_DECREMENT   = 5;
const MIN_SPEED         = 10;
const RESPAWN_DELAY_MS  = 3000;

// ——————— BULLET CONSTANTS ———————
const BULLET_SPEED       = 500;   // px/sec
const BULLET_LIFETIME_MS = 4000;  // ms before disappearing

// ——————— COLOURS ———————
const COLORS = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231',
  '#911eb4','#42d4f4','#f032e6','#bfef45','#fabebe'
];

// ——————— STORAGE ———————
const players        = new Map();  // id → { ws, position, size, speed, alive, colour }
const pendingClients = new Map();  // ws → id
let bullets          = [];         // { id, shooterId, x, y, dx, dy, createdAt }
let nextBulletId     = 1;

// Clamp a position so a blob of given size stays fully within the world
function clampPosition(pos, size) {
  const half = size / 2;
  return {
    x: Math.min(Math.max(pos.x, half), worldWidth - half),
    y: Math.min(Math.max(pos.y, half), worldHeight - half),
  };
}

// Random spawn **around center** within padding
function randomSpawn() {
  const cx = worldWidth  / 2;
  const cy = worldHeight / 2;
  const rx = worldWidth  / 4;
  const ry = worldHeight / 4;
  let x = cx + (Math.random()*2 -1)*rx;
  let y = cy + (Math.random()*2 -1)*ry;
  x = Math.min(Math.max(x, SPAWN_PADDING), worldWidth  - SPAWN_PADDING);
  y = Math.min(Math.max(y, SPAWN_PADDING), worldHeight - SPAWN_PADDING);
  return { x, y };
}

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
  const bulletSnap = bullets.map(b => ({ id: b.id, x: b.x, y: b.y }));

  const msg = JSON.stringify({
    type:    'update',
    players: playerSnap,
    bullets: bulletSnap
  });

  for (const { ws } of players.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function handleMelee(attackerId) {
  const att = players.get(attackerId);
  if (!att || !att.alive) return;
  for (const [oid, other] of players.entries()) {
    if (oid === attackerId || !other.alive) continue;
    const dx = att.position.x - other.position.x;
    const dy = att.position.y - other.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < (att.size + other.size)/2) {
      att.size  += SIZE_INCREMENT;
      att.speed  = Math.max(att.speed - SPEED_DECREMENT, MIN_SPEED);
      killAndRespawn(oid);
    }
  }
}

function killAndRespawn(pid) {
  const p = players.get(pid);
  if (!p || !p.alive) return;
  p.alive = false;
  broadcastState();
  setTimeout(() => {
    p.alive    = true;
    p.position = randomSpawn();
    p.size     = INITIAL_SIZE;
    p.speed    = INITIAL_SPEED;
    broadcastState();
  }, RESPAWN_DELAY_MS);
}

// ——————— NEW CONNECTION ———————
wss.on('connection', ws => {
  const id = Date.now().toString();
  pendingClients.set(ws, id);

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); }
    catch { return; }

    // First handshake: get container size from client
    if (data.type === 'set_dimensions' && pendingClients.has(ws)) {
      const pid = pendingClients.get(ws);
      pendingClients.delete(ws);

      if (worldWidth === null) {
        worldWidth  = data.width;
        worldHeight = data.height;
        console.log(`World: ${worldWidth}×${worldHeight}`);
      }

      const spawn  = randomSpawn();
      const colour = COLORS[Math.floor(Math.random()*COLORS.length)];
      players.set(pid, {
        ws,
        position: spawn,
        size:     INITIAL_SIZE,
        speed:    INITIAL_SPEED,
        alive:    true,
        colour
      });

      ws.send(JSON.stringify({ type: 'init', id: pid }));
      broadcastState();
      return;
    }

    // After handshake: movement or fire
    const pid = pendingClients.get(ws) || [...players].find(([k,v])=>v.ws===ws)?.[0];
    if (!pid) return;
    const me = players.get(pid);
    if (!me.alive) return;

    if (data.type === 'move' && data.position) {
      me.position = clampPosition(data.position, me.size);
      handleMelee(pid);
      broadcastState();
    }
    else if (data.type === 'fire' && data.direction) {
      const { x: dx, y: dy } = data.direction;
      const mag = Math.hypot(dx, dy);
      if (mag > 0) {
        bullets.push({
          id:        nextBulletId++,
          shooterId: pid,
          x:         me.position.x,
          y:         me.position.y,
          dx:        dx/mag,
          dy:        dy/mag,
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

// ——————— BULLET TICK ———————
let last = Date.now();
setInterval(() => {
  if (worldWidth === null) return;
  const now = Date.now();
  const dt  = (now - last)/1000;
  last = now;

  // Move & bounce
  bullets.forEach(b => {
    b.x += b.dx * BULLET_SPEED * dt;
    b.y += b.dy * BULLET_SPEED * dt;
    // bounce X
    if (b.x <= 0)  { b.x = 0;  b.dx *= -1; }
    if (b.x >= worldWidth) { b.x = worldWidth; b.dx *= -1; }
    // bounce Y
    if (b.y <= 0)  { b.y = 0;  b.dy *= -1; }
    if (b.y >= worldHeight){ b.y = worldHeight; b.dy *= -1; }
  });

  // Expire by time & check hits
  for (let i = bullets.length-1; i >= 0; i--) {
    const b = bullets[i];
    if (now - b.createdAt > BULLET_LIFETIME_MS) {
      bullets.splice(i,1);
      continue;
    }
    for (const [pid, p] of players.entries()) {
      if (pid === b.shooterId || !p.alive) continue;
      const dx = p.position.x - b.x;
      const dy = p.position.y - b.y;
      if (Math.hypot(dx, dy) < p.size/2) {
        killAndRespawn(pid);
        bullets.splice(i,1);
        break;
      }
    }
  }

  broadcastState();
}, 50);

const PORT = process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Listening on ${PORT}`));
