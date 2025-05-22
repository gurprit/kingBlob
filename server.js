const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// game constants
const INITIAL_SIZE      = 40;
const INITIAL_SPEED     = 50;
const SIZE_INCREMENT    = 10;
const SPEED_DECREMENT   = 5;
const MIN_SPEED         = 10;
// spawn near top-left so blobs stay visible
const RESPAWN_POSITION  = { x: 15, y: 15 };
const RESPAWN_DELAY_MS  = 3000;

// ten eye-catching colours
const COLORS = [
  '#e6194b', // vivid red
  '#3cb44b', // bright green
  '#ffe119', // bold yellow
  '#4363d8', // strong blue
  '#f58231', // vibrant orange
  '#911eb4', // deep purple
  '#42d4f4', // electric cyan
  '#f032e6', // hot magenta
  '#bfef45', // neon lime
  '#fabebe'  // punchy pink
];

app.use(express.static('public'));

// Map: id -> { ws, position, size, speed, alive, colour }
const players = new Map();

wss.on('connection', (ws) => {
  const id = Date.now().toString();
  const colour = COLORS[Math.floor(Math.random() * COLORS.length)];

  players.set(id, {
    ws,
    position: { ...RESPAWN_POSITION },
    size:     INITIAL_SIZE,
    speed:    INITIAL_SPEED,
    alive:    true,
    colour
  });

  // inform client of its id
  ws.send(JSON.stringify({ type: 'init', id }));
  broadcastState();

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'move' && data.position) {
      const p = players.get(id);
      if (!p.alive) return;

      p.position = data.position;
      handleCollisions(id);
      broadcastState();
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcastState();
  });
});

function handleCollisions(attackerId) {
  const attacker = players.get(attackerId);
  if (!attacker || !attacker.alive) return;

  for (const [otherId, other] of players.entries()) {
    if (otherId === attackerId || !other.alive) continue;

    const dx   = attacker.position.x - other.position.x;
    const dy   = attacker.position.y - other.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist < (attacker.size + other.size) / 2) {
      // attacker always wins
      attacker.size  += SIZE_INCREMENT;
      attacker.speed  = Math.max(attacker.speed - SPEED_DECREMENT, MIN_SPEED);

      // victim dies
      other.alive = false;
      broadcastState();

      setTimeout(() => {
        other.alive    = true;
        other.position = { ...RESPAWN_POSITION };
        other.size     = INITIAL_SIZE;
        other.speed    = INITIAL_SPEED;
        broadcastState();
      }, RESPAWN_DELAY_MS);
    }
  }
}

function broadcastState() {
  const snapshot = {};
  for (const [pid, p] of players.entries()) {
    snapshot[pid] = {
      position: p.position,
      size:     p.size,
      speed:    p.speed,
      alive:    p.alive,
      colour:   p.colour
    };
  }
  const msg = JSON.stringify({ type: 'update', players: snapshot });
  for (const { ws } of players.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
