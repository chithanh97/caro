// server.js
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure allowed origins via env or fallback list
const DEFAULT_ORIGINS = [
  'http://localhost:3000',       // dev
  'http://127.0.0.1:3000',
  'https://hacnguyet.com',       // production domain
  'https://www.hacnguyet.com'
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS);

// Socket.IO CORS config (reuse same origins)
const io = socketio(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Express CORS middleware
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true
}));

// Enable preflight for all routes
app.options('*', cors());

// ----- Game logic (unchanged, copied from your original) -----
const rooms = {};

function getNextRoomNumber() {
  for (let i = 1; i <= 100; i++) {
    if (!rooms[i]) return i;
  }
  return null;
}

function checkWin(board, x, y, symbol) {
  const directions = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
  ];
  for (const {dx, dy} of directions) {
    let count = 1;
    let blockedStart = false, blockedEnd = false;
    let i = 1;
    while (true) {
      const val = board[x + dx * i]?.[y + dy * i];
      if (val === symbol) {
        count++;
      } else {
        if (val && val !== "") blockedEnd = true;
        break;
      }
      i++;
    }
    i = 1;
    while (true) {
      const val = board[x - dx * i]?.[y - dy * i];
      if (val === symbol) {
        count++;
      } else {
        if (val && val !== "") blockedStart = true;
        break;
      }
      i++;
    }
    if (count >= 5 && !(blockedStart && blockedEnd)) return true;
  }
  return false;
}

// APIs
app.get('/api/rooms', (req, res) => {
  const list = Object.entries(rooms).map(([roomId, room]) => ({
    roomId: Number(roomId),
    players: room.players,
  }));
  res.json({ rooms: list });
});

app.post('/api/create-room', (req, res) => {
  const nextNumber = getNextRoomNumber();
  if (!nextNumber) return res.status(400).json({ error: "Đã đủ 100 phòng!" });
  rooms[nextNumber] = {
    players: [],
    board: Array(20).fill().map(() => Array(20).fill("")),
    status: 'waiting',
    turn: null,
    timeout: null,
    turnStartTime: null
  };
  res.json({ roomId: nextNumber });
});

app.post('/api/join-room', (req, res) => {
  const roomId = Number(req.body.roomId);
  const user = req.body.user;
  if (!rooms[roomId]) return res.status(404).json({ error: 'Not found' });
  if (rooms[roomId].players.length >= 2) return res.status(400).json({ error: 'Room full' });
  if (!rooms[roomId].players.find(p => p.uid === user.uid)) {
    rooms[roomId].players.push({ ...user, ready: false, score: 0 });
  }
  if (rooms[roomId].players.length === 2 && !rooms[roomId].turn) {
    rooms[roomId].turn = rooms[roomId].players[0].uid;
    rooms[roomId].turnStartTime = Date.now();
  }
  res.json({
    room: {
      roomId,
      players: rooms[roomId].players,
    }
  });
});

app.post('/api/leave-room', (req, res) => {
  const { roomId, user } = req.body;
  const id = Number(roomId);
  const room = rooms[id];
  if (!room) return res.status(404).json({ error: "Room not found" });
  room.players = room.players.filter(p => p.uid !== user.uid);
  if (room.players.length === 0) {
    clearTimeout(room.timeout);
    delete rooms[id];
  } else {
    if (room.turn === user.uid && room.players.length === 1) {
      room.turn = room.players[0].uid;
      room.turnStartTime = Date.now();
    }
    if (room.players.length === 1) {
      room.players[0].ready = false;
      room.turn = null;
      room.turnStartTime = null;
      room.status = "waiting";
      io.to(roomId).emit('players', room.players);
    }
  }
  res.json({ success: true });
});

// Turn timeout
function handleLoseByTimeout(roomId, loserUid) {
  const room = rooms[roomId];
  if (!room) return;
  clearTimeout(room.timeout);
  room.turn = null;
  room.turnStartTime = null;
  io.to(roomId).emit('lose', { uid: loserUid, reason: 'timeout' });
}

function startTurnTimer(roomId, turnUid) {
  const room = rooms[roomId];
  if (!room) return;
  clearTimeout(room.timeout);
  room.turnStartTime = Date.now();
  room.timeout = setTimeout(() => {
    handleLoseByTimeout(roomId, turnUid);
  }, 30 * 1000);
  io.to(roomId).emit('turn', { uid: turnUid, startTime: room.turnStartTime });
}

// Socket handlers
io.on('connection', socket => {
  socket._user = null;
  socket._roomId = null;

  socket.on('joinRoom', ({ roomId, user }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (!room) return;
    socket.join(roomId);
    socket._user = user;
    socket._roomId = id;
    io.to(roomId).emit('playerJoined', { user });
    io.to(roomId).emit('players', room.players);
    io.to(roomId).emit('board', room.board);
    io.to(roomId).emit('turn', { uid: room.turn, startTime: room.turnStartTime });
  });

  socket.on('getPlayers', ({ roomId }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (!room) return;
    io.to(roomId).emit('players', room.players);
  });

  socket.on('ready', ({ roomId, uid }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (!room) return;
    const player = room.players.find(p => p.uid === uid);
    if (player) player.ready = true;
    io.to(roomId).emit('ready', { displayName: player.displayName });
    io.to(roomId).emit('players', room.players);
    if (
      room.players.length === 2 &&
      room.players.every(p => p.ready) &&
      !room.turn
    ) {
      room.turn = room.players[0].uid;
      startTurnTimer(id, room.turn);
    }
  });

  socket.on('noneReady', ({ roomId, uid }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (!room) return;
    const player = room.players.find(p => p.uid === uid);
    if (player) player.ready = false;
    io.to(roomId).emit('noneReady', { displayName: player.displayName });
    io.to(roomId).emit('players', room.players);
  });

  socket.on('move', ({ roomId, move }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (!room || !room.board) return;
    if (!room.players || room.players.length !== 2) return;
    if (!room.players.every(p => p.ready)) return;
    if (move.uid !== room.turn) return;
    if (room.board[move.x][move.y] !== "") return;
    room.board[move.x][move.y] = move.symbol;
    const isWin = checkWin(room.board, move.x, move.y, move.symbol);
    const nextPlayer = room.players.find(p => p.uid !== move.uid);
    room.turn = nextPlayer ? nextPlayer.uid : null;
    room.turnStartTime = room.turn ? Date.now() : null;
    io.to(roomId).emit('move', move);
    io.to(roomId).emit('board', room.board);
    io.to(roomId).emit('turn', { uid: room.turn, startTime: room.turnStartTime });
    clearTimeout(room.timeout);
    if (isWin) {
      room.turn = null;
      room.turnStartTime = null;
      io.to(roomId).emit('win', { uid: move.uid, symbol: move.symbol, x: move.x, y: move.y });
    } else if (room.turn) {
      startTurnTimer(id, room.turn);
    }
  });

  socket.on('reset', ({ roomId }) => {
    const id = Number(roomId);
    const room = rooms[id];
    if (room) {
      clearTimeout(room.timeout);
      room.board = Array(20).fill().map(() => Array(20).fill(""));
      room.players.forEach(p => p.ready = false);
      room.status = "waiting";
      room.turn = room.players[0]?.uid || null;
      room.turnStartTime = room.turn ? Date.now() : null;
      io.to(roomId).emit('board', room.board);
      io.to(roomId).emit('players', room.players);
      io.to(roomId).emit('turn', { uid: room.turn, startTime: room.turnStartTime });
      io.to(roomId).emit('reset');
      if (room.turn) startTurnTimer(id, room.turn);
    }
  });

  socket.on('disconnect', () => {
    const user = socket._user;
    const roomId = socket._roomId;
    if (!user || !roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    room.players = room.players.filter(p => p.uid !== user.uid);
    io.to(roomId).emit('playerLeft', { uid: user.uid, displayName: user.displayName });
    if (room.players.length === 1) {
      io.to(roomId).emit('lose', { uid: user.uid, reason: 'left' });
      room.players[0].ready = false;
      room.turn = null;
      room.turnStartTime = null;
      room.status = "waiting";
    }
    if (room.players.length === 0) {
      clearTimeout(room.timeout);
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('players', room.players);
    }
  });
});

server.listen(process.env.PORT || 4000, '0.0.0.0', () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});