const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*" } });
app.use(cors());
app.use(express.json());

const rooms = {};

function getNextRoomNumber() {
  for (let i = 1; i <= 100; i++) {
    if (!rooms[i]) return i;
  }
  return null;
}

// Hàm kiểm tra thắng 5 liên tiếp không bị chặn 2 đầu (Caro Việt Nam)
function checkWin(board, x, y, symbol) {
  const directions = [
    { dx: 1, dy: 0 },   // ngang
    { dx: 0, dy: 1 },   // dọc
    { dx: 1, dy: 1 },   // chéo xuống phải
    { dx: 1, dy: -1 },  // chéo lên phải
  ];
  for (const {dx, dy} of directions) {
    let count = 1;
    let blockedStart = false, blockedEnd = false;
    // Một phía
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
    // Phía ngược lại
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

// API lấy danh sách phòng (CHỈ TRẢ VỀ THUỘC TÍNH JSON ĐƯỢC)
app.get('/api/rooms', (req, res) => {
  const list = Object.entries(rooms).map(([roomId, room]) => ({
    roomId: Number(roomId),
    players: room.players,
    // KHÔNG trả về board, timeout, turn, turnStartTime
  }));
  res.json({ rooms: list });
});

// API tạo phòng mới
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

// API vào phòng
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
  // CHỈ TRẢ VỀ THUỘC TÍNH JSON ĐƯỢC
  res.json({
    room: {
      roomId,
      players: rooms[roomId].players,
      // KHÔNG trả về board, timeout, turn, turnStartTime
    }
  });
});

// API rời phòng
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
    // Nếu còn 1 người, chuyển trạng thái về chưa sẵn sàng và reset trạng thái phòng
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

// Xử thua khi hết giờ
function handleLoseByTimeout(roomId, loserUid) {
  const room = rooms[roomId];
  if (!room) return;
  clearTimeout(room.timeout);
  room.turn = null;
  room.turnStartTime = null;
  io.to(roomId).emit('lose', { uid: loserUid, reason: 'timeout' });
}

// Bắt đầu đếm thời gian cho lượt chơi
function startTurnTimer(roomId, turnUid) {
  const room = rooms[roomId];
  console.log('ok');
  if (!room) return;
  clearTimeout(room.timeout);
  room.turnStartTime = Date.now();
  room.timeout = setTimeout(() => {
    handleLoseByTimeout(roomId, turnUid);
  }, 30 * 1000);
  io.to(roomId).emit('turn', { uid: turnUid, startTime: room.turnStartTime });
}

// Socket.io realtime
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
    // if (room.turn) startTurnTimer(id, room.turn);
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

  // Khi socket disconnect: XÓA user khỏi phòng nếu còn
  socket.on('disconnect', () => {
    const user = socket._user;
    const roomId = socket._roomId;
    if (!user || !roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    // Xóa user khỏi room.players
    room.players = room.players.filter(p => p.uid !== user.uid);
    io.to(roomId).emit('playerLeft', { uid: user.uid, displayName: user.displayName });
    // Nếu còn một người trong phòng
    if (room.players.length === 1) {
      io.to(roomId).emit('lose', { uid: user.uid, reason: 'left' });

      // Chuyển trạng thái của người còn lại về chưa sẵn sàng
      room.players[0].ready = false;

      // Reset lượt chơi, trạng thái, thời gian
      room.turn = null;
      room.turnStartTime = null;
      room.status = "waiting";
    }

    // Nếu phòng trống thì xóa phòng
    if (room.players.length === 0) {
      clearTimeout(room.timeout);
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('players', room.players);
    }
  });
});

server.listen(4000, () => console.log('Server running on port 4000'));