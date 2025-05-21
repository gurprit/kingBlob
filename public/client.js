const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

let playerId = null;
const blobs = {}; // other players’ divs

// our state
let position = { x: 15, y: 15 };
let speed    = 50;

function updateMyPosition() {
  myBlob.style.left = `${position.x}px`;
  myBlob.style.top  = `${position.y}px`;
}

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'init') {
    playerId = data.id;
    return;
  }

  if (data.type === 'update') {
    Object.entries(data.players).forEach(([id, info]) => {
      const { position: pos, size, speed: srvSpeed } = info;

      if (id === playerId) {
        // update myself
        speed = srvSpeed;
        myBlob.style.width  = `${size}px`;
        myBlob.style.height = `${size}px`;
        position = pos;
        updateMyPosition();
      } else {
        // update or create other blobs
        if (!blobs[id]) {
          const b = document.createElement('div');
          b.className = 'blob';
          b.style.background = 'blue';
          gameArea.appendChild(b);
          blobs[id] = b;
        }
        blobs[id].style.width  = `${size}px`;
        blobs[id].style.height = `${size}px`;
        blobs[id].style.left   = `${pos.x}px`;
        blobs[id].style.top    = `${pos.y}px`;
      }
    });
  }
});

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp':    case 'w': position.y -= speed; break;
    case 'ArrowDown':  case 's': position.y += speed; break;
    case 'ArrowLeft':  case 'a': position.x -= speed; break;
    case 'ArrowRight': case 'd': position.x += speed; break;
    default: return;
  }
  updateMyPosition();
  socket.send(JSON.stringify({ type: 'move', position }));
});

// initial render
updateMyPosition();
