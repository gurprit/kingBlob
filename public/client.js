const socket   = new WebSocket(`wss://${location.host}`);
const gameArea = document.getElementById('gameArea');

// my blob
const myBlob = document.createElement('div');
myBlob.className = 'blob';
gameArea.appendChild(myBlob);

let playerId   = null;
const blobs    = {};             // other players’ divs
let myPosition = { x: 15, y: 15 };
let mySpeed    = 50;
let alive      = true;

// movement helper
function updateMyPosition() {
  if (!myPosition) return;
  myBlob.style.left = `${myPosition.x}px`;
  myBlob.style.top  = `${myPosition.y}px`;
}

// send initial pos on open
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
});

// handle server messages
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

// keyboard controls
document.addEventListener('keydown', (e) => {
  if (!alive) return;
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

// simple touch-and-hold D-pad
const directions = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};
const repeatTimers = {};

Object.keys(directions).forEach(dir => {
  const btn = document.getElementById(dir);
  btn.addEventListener('touchstart', e => {
    e.preventDefault();
    moveDir(dir);
    repeatTimers[dir] = setInterval(() => moveDir(dir), 100);
  });
  btn.addEventListener('touchend', e => {
    e.preventDefault();
    clearInterval(repeatTimers[dir]);
  });
  btn.addEventListener('touchcancel', e => {
    e.preventDefault();
    clearInterval(repeatTimers[dir]);
  });
});

function moveDir(dir) {
  if (!alive) return;
  const { dx, dy } = directions[dir];
  myPosition.x += dx * mySpeed;
  myPosition.y += dy * mySpeed;
  updateMyPosition();
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
}

// initial draw
updateMyPosition();
