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

  // immediately broadcast full state (so new client sees everyone, and everyone sees the newcomer)
  broadcastState();

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }
    if (data.type === 'move' && data.position) {
      const p = players.get(id);
      p.position = data.position;
      // collision logic (optional—remove if you just want movement)
      doCollisions();
      broadcastState();
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcastState();
  });
});

function doCollisions() {
  const list = Array.from(players.values());
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p1 = list[i], p2 = list[j];
      const dx = p1.position.x - p2.position.x;
      const dy = p1.position.y - p2.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (p1.size + p2.size) / 2) {
        // bigger eats smaller
        let winner = p1.size > p2.size ? p1 : p2;
        let loser  = p1.size > p2.size ? p2 : p1;
        winner.size  += SIZE_INCREMENT;
        winner.speed  = Math.max(winner.speed - SPEED_DECREMENT, MIN_SPEED);
        loser.position = { ...RESPAWN_POSITION };
        loser.size     = INITIAL_SIZE;
        loser.speed    = INITIAL_SPEED;
      }
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
