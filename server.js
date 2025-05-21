const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// game constants
const INITIAL_SIZE     = 40;
const INITIAL_SPEED    = 50;
const SIZE_INCREMENT   = 10;
const SPEED_DECREMENT  = 5;
const MIN_SPEED        = 10;
const RESPAWN_POSITION = { x: 1500, y: 1500 };

app.use(express.static('public'));

const players = new Map(); // id → { ws, position, size, speed }

wss.on('connection', (ws) => {
  const id = Date.now().toString();
  players.set(id, {
    ws,
    position: { ...RESPAWN_POSITION },
    size:     INITIAL_SIZE,
    speed:    INITIAL_SPEED
  });

  // tell the new client its id
  ws.send(JSON.stringify({ type: 'init', id }));
  // broadcast so everyone sees the newcomer
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
      // update the mover’s position
      p.position = data.position;

      // attacker-based collision
      doCollisions(id);

      // send updated snapshot to all
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
  if (!attacker) return;

  for (const [otherId, other] of players.entries()) {
    if (otherId === attackerId) continue;

    const dx = attacker.position.x - other.position.x;
    const dy = attacker.position.y - other.position.y;
    const dist = Math.hypot(dx, dy);

    // if their circles overlap
    if (dist < (attacker.size + other.size) / 2) {
      // attacker always wins
      attacker.size  += SIZE_INCREMENT;
      attacker.speed  = Math.max(attacker.speed - SPEED_DECREMENT, MIN_SPEED);

      // reset the victim
      other.position = { ...RESPAWN_POSITION };
      other.size     = INITIAL_SIZE;
      other.speed    = INITIAL_SPEED;
    }
  }
}

function broadcastState() {
  const snapshot = {};
  for (const [pid, p] of players.entries()) {
    snapshot[pid] = {
      position: p.position,
      size:     p.size,
      speed:    p.speed
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
