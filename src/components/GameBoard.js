import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "../css/GameBoard.css";
const socketUrl = "http://localhost:4000";

function GameBoard({ roomId, user, onLeaveRoom }) {
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [ready, setReady] = useState(false);
  const [bothReady, setBothReady] = useState(false);
  const [board, setBoard] = useState(Array(20).fill().map(() => Array(20).fill("")));
  const [mySymbol, setMySymbol] = useState("X");
  const [turnUid, setTurnUid] = useState(null);
  const [turnStartTime, setTurnStartTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [winInfo, setWinInfo] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(socketUrl);
    socketRef.current = socket;
    socket.emit("joinRoom", { roomId, user });

    socket.on("playerJoined", ({ user }) => {
      setMessages(msgs => [...msgs, `${user.displayName} đã vào phòng`]);
    });

    socket.on("players", (playersList) => {
      setPlayers(playersList);
      if (playersList.length === 2) {
        const idx = playersList.findIndex(p => p.uid === user.uid);
        setMySymbol(idx === 0 ? "X" : "O");
      }
      // Cập nhật trạng thái bothReady
      if (playersList.length === 2 && playersList.every(p => p.ready)) {
        setBothReady(true);
      } else {
        setBothReady(false);
        setTurnStartTime(null);
      }
    });

    socket.on("ready", ({ displayName }) => {
      setMessages(msgs => [...msgs, `${displayName} đã sẵn sàng`]);
    });

    socket.on("noneReady", ({ displayName }) => {
      setMessages(msgs => [...msgs, `${displayName} không sẵn sàng`]);
    });

    socket.on("move", move => {
      setMessages(msgs => [...msgs, `Nước đi: (${move.x},${move.y}) - ${move.symbol}`]);
    });

    socket.on("board", boardData => {
      setBoard(boardData);
    });

    // Luôn cập nhật turnUid và turnStartTime khi server gửi "turn"
    socket.on("turn", ({ uid, startTime }) => {
      setTurnUid(uid);
      setTurnStartTime(startTime);
      setTimeLeft(30);
    });

    socket.on("win", (info) => {
      setWinInfo(info);
    });

    socket.on("reset", () => {
      setWinInfo(null);
      setReady(false);
      setBothReady(false);
      setTurnStartTime(null);
    });

    socket.on("lose", ({ uid, reason }) => {
      setMessages(msgs => [...msgs, `Người chơi ${players.find(p => p.uid === uid)?.displayName || uid} xử thua vì hết thời gian!`]);
      setWinInfo({ uid, reason });
    });
    socket.on("playerLeft", ({ uid, displayName }) => {
      setMessages(msgs => [...msgs, `${displayName || uid} đã rời phòng.`]);
    });
    socket.emit("getPlayers", { roomId });

    return () => {
      socket.disconnect();
    };
  }, [roomId, user]);

  // Đếm thời gian chỉ khi bothReady và có turnStartTime
  useEffect(() => {
    if (!bothReady || !turnStartTime || winInfo) return;
    setTimeLeft(30);
    const timer = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, 30 - Math.floor((now - turnStartTime) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(timer);
    }, 300);
    return () => clearInterval(timer);
  }, [bothReady, turnStartTime, winInfo]);

  const sendReady = () => {
    socketRef.current.emit("ready", { roomId, uid: user.uid });
    setReady(true);
  };

  const sendNoneReady = () => {
    socketRef.current.emit("noneReady", { roomId, uid: user.uid });
    setReady(false);
  };

  const handleCellClick = (x, y) => {
    if (!bothReady) return;
    if (board[x][y] !== "") return;
    if (winInfo) return;
    if (user.uid !== turnUid) return;
    socketRef.current.emit("move", {
      roomId,
      move: {
        x, y,
        player: user.displayName,
        symbol: mySymbol,
        uid: user.uid
      }
    });
  };

  const handleReset = () => {
    socketRef.current.emit("reset", { roomId });
    setWinInfo(null);
    setReady(false);
    setBothReady(false);
    setTurnStartTime(null);
  };

  // Xử lý rời phòng
  const handleLeaveRoom = async () => {
    try {
      await fetch("https://hacnguyet.com:4000/api/leave-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, user }),
      });
      if (onLeaveRoom) onLeaveRoom();
    } catch (e) {
      alert("Lỗi khi rời phòng!");
    }
  };

  return (
    <div className="gb-root">
      <header className="gb-header">
        <div className="gb-user">
          {/* Xin chào: <strong>{user.displayName}</strong> */}
          </div>
        <div className="gb-actions">
          <button className="gb-leave-btn" onClick={handleLeaveRoom}>Rời phòng</button>
        </div>
      </header>

      <main className="gb-main">
        <h2 className="gb-room-title">Phòng số: {roomId}</h2>

        <div className="gb-controls">
          {!ready && !bothReady && (
            <button className="gb-ready-btn" onClick={sendReady}>Sẵn sàng</button>
          )}
          {ready && !bothReady && 
          <button className="gb-none-ready-btn" onClick={sendNoneReady}>Không sẵn sàng</button>
          }
          {bothReady && !winInfo && (
            <div className="gb-status">
              <span>Bắt đầu chơi! &nbsp;</span>
              <b>Lượt của: {players.find(p => p.uid === turnUid)?.displayName || ""}</b>
              <span className="gb-timer">Thời gian còn lại: <b>{timeLeft}s</b></span>
            </div>
          )}
        </div>

        <div className="gb-board-container">
          <div
            className="gb-grid"
            style={{ gridTemplateColumns: `repeat(20, 28px)` }}
          >
            {board.map((row, i) =>
              row.map((cell, j) => {
                const disabled = !bothReady || cell !== "" || winInfo || user.uid !== turnUid;
                return (
                  <button
                    key={`${i}_${j}`}
                    className={`gb-cell ${cell ? 'gb-cell-filled' : ''}`}
                    onClick={() => handleCellClick(i, j)}
                    disabled={disabled}
                    aria-label={`cell-${i}-${j}`}
                  >
                    {cell}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {winInfo && (
          <div className="gb-win">
            <b>
              {winInfo.reason === "timeout" || winInfo.reason === "left"
                ? `${players.find(p => p.uid === winInfo.uid)?.displayName || "Người chơi"} xử thua!`
                : `${players.find(p => p.uid === winInfo.uid)?.displayName || "Người chơi"} thắng với quân ${winInfo.symbol}!`}
            </b>
            <div className="gb-reset">
              <button className="gb-reset-btn" onClick={handleReset}>Chơi lại</button>
            </div>
          </div>
        )}

        <aside className="gb-side">
          <div className="gb-players">
            <h4>Người chơi</h4>
            <ul>
              {players.map(p => (
                <li key={p.uid} className={p.ready ? 'ready' : ''}>
                  {p.displayName} {p.uid === user.uid ? '(Bạn)' : ''} {p.ready ? ' - Sẵn sàng' : ''}
                </li>
              ))}
            </ul>
          </div>

          <div className="gb-messages">
            <h4>Hoạt động</h4>
            <div className="gb-messages-list">
              {messages.map((msg, idx) => <div key={idx} className="gb-msg">{msg}</div>)}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default GameBoard;