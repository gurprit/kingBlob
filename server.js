const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const players = new Map();

wss.on('connection', (ws) => {
  const id = Date.now().toString();
  const startPosition = { x: 1500, y: 1500 };
  players.set(id, { ws, position: startPosition });

  ws.send(JSON.stringify({ type: 'init', id }));

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'move') {
      players.get(id).position = data.position;
    }

    const state = {};
    for (const [pid, p] of players.entries()) {
      state[pid] = p.position;
    }

    const updateMessage = JSON.stringify({ type: 'update', players: state });
    for (const [, p] of players.entries()) {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(updateMessage);
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
