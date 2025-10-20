// Import các hàm Firebase cần dùng
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAXLP5FSMjcNdyuG2B1LcE9y8VvCU3pjVs",
  authDomain: "lotogame-5e95b.firebaseapp.com",
  projectId: "lotogame-5e95b",
  storageBucket: "lotogame-5e95b.appspot.com", // <-- Sửa lại dòng này
  messagingSenderId: "946622302181",
  appId: "1:946622302181:web:51028b6cd8787b8a68910c",
  measurementId: "G-FW59F55SD9"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Khởi tạo Auth và Firestore (dùng cho login và lưu trữ dữ liệu realtime)
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Nếu cần analytics, giữ lại dòng dưới
// import { getAnalytics } from "firebase/analytics";
// const analytics = getAnalytics(app);