import React, { useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, updateDoc, addDoc, query, limit } from "firebase/firestore";

function FindRoomButton({ user, onJoin }) {
  const [loading, setLoading] = useState(false);

  const findRoom = async () => {
    setLoading(true);
    try {
      if (!user || !user.uid) throw new Error("Bạn chưa đăng nhập!");
      const roomsQuery = query(collection(db, "rooms"), limit(500));
      const roomsSnapshot = await getDocs(roomsQuery);
      const rooms = roomsSnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      console.log("Danh sách phòng:", rooms);

      const waitingRoom = rooms.find(
        room => Object.keys(room.players).length === 1 && room.status === "waiting"
      );
      if (waitingRoom) {
        console.log("Vào phòng:", waitingRoom.id);
        await updateDoc(doc(db, "rooms", waitingRoom.id), {
          [`players.${user.uid}`]: {
            displayName: user.displayName,
            ready: false,
            symbol: "O"
          }
        });
        setLoading(false);
        onJoin(waitingRoom.id);
        return;
      }

      if (rooms.length >= 500) {
        alert("Số lượng phòng đã đầy, vui lòng đợi hoặc xóa bớt phòng cũ!");
        setLoading(false);
        return;
      }

      const emptyBoard = {};
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 20; j++) {
          emptyBoard[`${i}_${j}`] = "";
        }
      }
      const docRef = await addDoc(collection(db, "rooms"), {
        players: {
          [user.uid]: {
            displayName: user.displayName,
            ready: false,
            symbol: "X"
          }
        },
        status: "waiting",
        board: emptyBoard,
        turn: user.uid,
        winner: null
      });
      console.log("Đã tạo phòng mới:", docRef.id);
      setLoading(false);
      onJoin(docRef.id);
    } catch (e) {
      alert("Lỗi khi tìm phòng: " + e.message);
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={findRoom} disabled={loading}>
        Tìm phòng
      </button>
      {loading && <div style={{marginTop:8}}>⏳ Đang tìm phòng, vui lòng chờ...</div>}
    </>
  );
}

export default FindRoomButton;