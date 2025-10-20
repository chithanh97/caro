import React, { useState, useEffect } from "react";
import GameBoard from "./components/GameBoard";
import Login from "./components/Login";
import RoomList from "./components/RoomList";
import "./css/App.css";

function App() {
  const [roomId, setRoomId] = useState(null);
  const [user, setUser] = useState(null);

  // Đọc user từ localStorage khi load app
  useEffect(() => {
    const savedUser = localStorage.getItem("caro_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Khi setUser, lưu vào localStorage nếu có user
  useEffect(() => {
    if (user) {
      localStorage.setItem("caro_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("caro_user");
    }
  }, [user]);

  const handleLogout = () => {
    setUser(null);
    setRoomId(null);
    localStorage.removeItem("caro_user");
    // Nếu muốn signOut firebase thì gọi thêm
    // import { auth } from "../firebase";
    // import { signOut } from "firebase/auth";
    // signOut(auth);
  };

  const handleJoinRoom = (id) => {
    setRoomId(id);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <div className="logout-bar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 8 }}>
        {user && (
          <>
            {user.photoURL || user.avatar ? (
              <img
                src={user.photoURL || user.avatar}
                alt="avatar"
                style={{ width: 32, height: 32, borderRadius: "50%", marginRight: 8 }}
              />
            ) : null}
            <span className="name-label" style={{ marginRight: 16 }}>
              Xin chào: <b>{user.displayName}</b>
            </span>
            <button className="logout-button" onClick={() => { if (window.confirm("Đăng xuất khỏi hệ thống?")) handleLogout(); }}>
              Đăng xuất
            </button>
          </>
        )}
      </div>
      {!user ? (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <Login setUser={setUser} />
        </div>
      ) : roomId ? (
        <GameBoard
          roomId={roomId}
          user={user}
          onLeaveRoom={() => setRoomId(null)}
        />
      ) : (
        <RoomList
          user={user}
          onJoin={setRoomId}
          currentRoomId={roomId}
          onLeaveRoom={() => setRoomId(null)}
        />
      )}
    </div>
  );
}

export default App;