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
const RESPAWN_POSITION  = { x: 1500, y: 1500 };
const RESPAWN_DELAY_MS  = 3000;

app.use(express.static('public'));

const players = new Map(); 
// id → { ws, position, size, speed, alive }

wss.on('connection', (ws) => {
  const id = Date.now().toString();
  players.set(id, {
    ws,
    position: { ...RESPAWN_POSITION },
    size:     INITIAL_SIZE,
    speed:    INITIAL_SPEED,
    alive:    true
  });

  ws.send(JSON.stringify({ type: 'init', id }));
  broadcastState();

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }
    if (data.type === 'move' && data.position) {
      const p = players.get(id);
      // only allow moves when alive
      if (!p.alive) return;

      p.position = data.position;
      doCollisions(id);
      broadcastState();
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcastState();
  });
});

function doCollisions(attackerId) {
  const attacker = players.get(attackerId);
  if (!attacker || !attacker.alive) return;

  for (const [otherId, other] of players.entries()) {
    if (otherId === attackerId || !other.alive) continue;

    const dx   = attacker.position.x - other.position.x;
    const dy   = attacker.position.y - other.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist < (attacker.size + other.size) / 2) {
      // attacker wins
      attacker.size  += SIZE_INCREMENT;
      attacker.speed  = Math.max(attacker.speed - SPEED_DECREMENT, MIN_SPEED);

      // mark victim dead
      other.alive = false;
      // broadcast immediate death
      broadcastState();

      // schedule respawn
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
      alive:    p.alive
    };
  }
  const msg = JSON.stringify({ type: 'update', players: snapshot });
  for (const { ws } of players.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
