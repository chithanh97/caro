import React, { useEffect, useState } from "react";
import "../css/RoomList.css";
import { API_URL } from "../config";

// Sử dụng props: user, onJoin (hàm setRoomId ở App.js), currentRoomId, onLeaveRoom
function RoomList({ user, onJoin, currentRoomId, onLeaveRoom }) {
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [autoJoinDone, setAutoJoinDone] = useState(false);

  // Lấy danh sách phòng từ API backend
  useEffect(() => {
    console.log(API_URL);
    fetch(API_URL + "/api/rooms")
      .then(res => res.json())
      .then(data => setRooms(data.rooms || []))
      .catch(() => setRooms([]));
  }, [currentRoomId]);

  // Hàm tìm phòng trống hoặc tạo phòng mới
  const findOrCreateRoom = async () => {
    setLoading(true);
    setError("");
    try {
      // Tìm phòng có <2 người
      let room = rooms.find(r => r.players.length < 2);
      if (room) {
        // Vào phòng đó
        const res = await fetch(API_URL + "/api/join-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.roomId, user })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        onJoin(room.roomId);
      } else {
        // Nếu không có phòng trống, tạo phòng mới
        const res = await fetch(API_URL + "/api/create-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // Vào phòng vừa tạo
        await fetch(API_URL + "/api/join-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: data.roomId, user })
        });
        onJoin(data.roomId);
      }
    } catch (e) {
      setError("Lỗi: " + e.message);
    }
    setLoading(false);
  };

  // Hàm rời phòng
  const leaveRoom = async () => {
    if (!currentRoomId) return;
    setLoading(true);
    setError("");
    try {
      await fetch(API_URL + "/api/leave-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: currentRoomId, user })
      });
      onLeaveRoom();
      setAutoJoinDone(false); // Cho phép tự động vào lại phòng khi reload
    } catch (e) {
      setError("Lỗi khi rời phòng!");
    }
    setLoading(false);
  };

  return (
    <div className="roomlist-root">
      {!currentRoomId && (
        <button className="action-room-button" onClick={findOrCreateRoom} disabled={loading}>
          {loading ? "Đang tìm phòng..." : "Tìm phòng"}
        </button>
      )}
      {currentRoomId && (
        <button className="action-room-button" onClick={leaveRoom} disabled={loading}>
          Rời phòng
        </button>
      )}
      {error && <div style={{ color: "red" }}>{error}</div>}
      <h3>Danh sách phòng</h3>
      <ul>
        {rooms.map(r => (
          <li key={r.roomId}>
            Phòng số: {r.roomId} ({r.players.length}/2)
            {r.players.length === 2 ? " - Phòng kín" : " - Phòng trống"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RoomList;
