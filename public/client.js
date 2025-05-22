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

// move & render helper
function updateMyPosition() {
  if (!myPosition) return;
  myBlob.style.left = `${myPosition.x}px`;
  myBlob.style.top  = `${myPosition.y}px`;
}

// on socket open, announce ourselves
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'move', position: myPosition }));
});

// handle server updates
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'init') {
    playerId = data.id;
    return;
  }
  if (data.type !== 'update') return;

  Object.entries(data.players).forEach(([id, info]) => {
    const {
      position: srvPos,
      size:     srvSize,
      speed:    srvSpeed,
      alive:    srvAlive,
      colour:   srvColour
    } = info;

    if (id === playerId) {
      // me
      alive = srvAlive;
      myBlob.style.display    = alive ? 'block' : 'none';
      myBlob.style.background = srvColour;
      if (!alive) return;

      myPosition = srvPos;
      mySpeed    = srvSpeed;
      myBlob.style.width  = `${srvSize*2}px`;
      myBlob.style.height = `${srvSize*2}px`;
      updateMyPosition();
    } else {
      // others
      if (!blobs[id]) {
        const b = document.createElement('div');
        b.className = 'blob';
        gameArea.appendChild(b);
        blobs[id] = b;
      }
      const b = blobs[id];
      b.style.display    = srvAlive ? 'block' : 'none';
      b.style.background = srvColour;
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

// touch D-pad handlers (unchanged)
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
    e.preventDefault(); moveDir(dir);
    repeatTimers[dir] = setInterval(() => moveDir(dir), 100);
  });
  ['touchend','touchcancel'].forEach(evt =>
    btn.addEventListener(evt, e => {
      e.preventDefault();
      clearInterval(repeatTimers[dir]);
    })
  );
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
