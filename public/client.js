const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

let playerId   = null;
const blobs    = {};            
let myPosition = { x: 15, y: 15 };
let mySpeed    = 50;
let alive      = true;

function updateMyPosition() {
  if (!myPosition) return;
  myBlob.style.left = `${myPosition.x}px`;
  myBlob.style.top  = `${myPosition.y}px`;
}

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
});

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'init') {
    playerId = data.id;
    return;
  }
  if (data.type !== 'update') return;

  Object.entries(data.players).forEach(([id, info]) => {
    const { position: srvPos, size: srvSize, speed: srvSpeed, alive: srvAlive } = info;

    if (id === playerId) {
      // self
      alive = srvAlive;
      myBlob.style.display = alive ? 'block' : 'none';
      if (!alive) return;
      
      myPosition = srvPos;
      mySpeed    = srvSpeed;
      myBlob.style.width  = `${srvSize}px`;
      myBlob.style.height = `${srvSize}px`;
      updateMyPosition();
    } else {
      // others
      if (!blobs[id]) {
        const b = document.createElement('div');
        b.className = 'blob';
        b.style.background = 'blue';
        gameArea.appendChild(b);
        blobs[id] = b;
      }
      const b = blobs[id];
      b.style.display = srvAlive ? 'block' : 'none';
      if (!srvAlive) return;

      b.style.width  = `${srvSize}px`;
      b.style.height = `${srvSize}px`;
      b.style.left   = `${srvPos.x}px`;
      b.style.top    = `${srvPos.y}px`;
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (!alive) return;   // can't move when dead

  switch (e.key) {
    case 'ArrowUp':    case 'w': myPosition.y -= mySpeed; break;
    case 'ArrowDown':  case 's': myPosition.y += mySpeed; break;
    case 'ArrowLeft':  case 'a': myPosition.x -= mySpeed; break;
    case 'ArrowRight': case 'd': myPosition.x += mySpeed; break;
    default: return;
  }
  updateMyPosition();
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
});

// initial draw
updateMyPosition();
