const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

let playerId    = null;
const blobs     = {};             // other players
let myPosition  = { x: 15, y: 15 };
let mySpeed     = 50;

function updateMyPosition() {
  if (!myPosition) return;
  myBlob.style.left = `${myPosition.x}px`;
  myBlob.style.top  = `${myPosition.y}px`;
}

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'init') {
    playerId = data.id;
    return;
  }
  if (data.type !== 'update') return;

  Object.entries(data.players).forEach(([id, info]) => {
    const serverPos   = info.position;   // explicit rename
    const serverSize  = info.size;
    const serverSpeed = info.speed;

    if (id === playerId) {
      if (serverPos && typeof serverPos.x === 'number') {
        myPosition = serverPos;          // only overwrite when valid
        mySpeed    = serverSpeed;
        myBlob.style.width  = `${serverSize}px`;
        myBlob.style.height = `${serverSize}px`;
        updateMyPosition();
      }
    } else {
      if (!blobs[id]) {
        const b = document.createElement('div');
        b.className = 'blob';
        b.style.background = 'blue';
        gameArea.appendChild(b);
        blobs[id] = b;
      }
      if (serverPos) {
        const b = blobs[id];
        b.style.width  = `${serverSize}px`;
        b.style.height = `${serverSize}px`;
        b.style.left   = `${serverPos.x}px`;
        b.style.top    = `${serverPos.y}px`;
      }
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (!myPosition) return;
  switch (e.key) {
    case 'ArrowUp':    case 'w': myPosition.y -= mySpeed; break;
    case 'ArrowDown':  case 's': myPosition.y += mySpeed; break;
    case 'ArrowLeft':  case 'a': myPosition.x -= mySpeed; break;
    case 'ArrowRight': case 'd': myPosition.x += mySpeed; break;
    default: return;
  }
  updateMyPosition();
  socket.send(JSON.stringify({
    type: 'move',
    position: myPosition
  }));
});

// initial render
updateMyPosition();
