const socket = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

let playerId = null;
const blobs = {}; // key: playerId, value: blob div

let position = { x: 1500, y: 1500 };
const speed = 5;

function updateMyPosition() {
  myBlob.style.left = `${position.x}px`;
  myBlob.style.top = `${position.y}px`;
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
      position.y -= speed;
      break;
    case 'ArrowDown':
    case 's':
      position.y += speed;
      break;
    case 'ArrowLeft':
    case 'a':
      position.x -= speed;
      break;
    case 'ArrowRight':
    case 'd':
      position.x += speed;
      break;
  }
  updateMyPosition();
  socket.send(JSON.stringify({ type: 'move', position }));
});

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'init') {
    playerId = data.id;
  } else if (data.type === 'update') {
    Object.entries(data.players).forEach(([id, pos]) => {
      if (id === playerId) return;
      if (!blobs[id]) {
        const blob = document.createElement('div');
        blob.className = 'blob';
        blob.style.background = 'blue';
        gameArea.appendChild(blob);
        blobs[id] = blob;
      }
      blobs[id].style.left = `${pos.x}px`;
      blobs[id].style.top = `${pos.y}px`;
    });
  }
});

updateMyPosition();
