import React from "react";
import { auth, provider } from "../firebase";
import { signInWithPopup } from "firebase/auth";
import "../css/Login.css";

function Login({ setUser }) {
  const handleLogin = async () => {
    const res = await signInWithPopup(auth, provider);
    setUser({ uid: res.user.uid, displayName: res.user.displayName });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card-mini">
        <h3 className="login-card-title">Đăng nhập</h3>
        <button className="google-login-btn" onClick={handleLogin} aria-label="Đăng nhập bằng Google">
          <span className="google-icon" aria-hidden="true">G</span>
          <span className="google-text">Đăng nhập bằng Google</span>
        </button>
      </div>
    </div>
  );
}

export default Login;