import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const NUNI_LOGO_SRC = "/nuni_logo.png";

const API_BASE = "/api"; // Force direct connection
console.log("API_BASE:", API_BASE);

export default function LoginPage() {
  const [formData, setFormData] = useState({
    username: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log("Attempting login to:", `${API_BASE}/login`);
      console.log("Login data:", { username: formData.username, password: "***" });
      
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log("Error response:", errorData);
        
        if (response.status === 404) {
          setError("사용자가 존재하지 않습니다. 먼저 회원가입을 해주세요.");
          return;
        }
        if (response.status === 401) {
          setError("아이디 또는 비밀번호가 올바르지 않습니다.");
          return;
        }
        setError("로그인에 실패했습니다.");
        return;
      }

      const user = await response.json();
      console.log("Login successful:", user);
      console.log("User data keys:", Object.keys(user));
      // 전체 사용자 데이터 저장
      localStorage.setItem("user", JSON.stringify(user));
      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      setError("로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div style={{
      fontFamily: "system-ui",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    }}>
      <div style={{
        background: "white",
        padding: 48,
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
        width: "100%",
        maxWidth: 400
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src={NUNI_LOGO_SRC}
            alt="누니보카학습"
            style={{ width: "auto", height: 88, objectFit: "contain", marginBottom: 12 }}
          />
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#333",
            marginBottom: 8
          }}>
            로그인
          </h1>
          <p style={{ color: "#666" }}>
            누니보카학습에 오신 것을 환영합니다
          </p>
        </div>

        {error && (
          <div style={{
            background: "#fee",
            border: "1px solid #fbb",
            color: "#c33",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 500,
              color: "#333"
            }}>
              아이디
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              autoComplete="username"
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 16,
                boxSizing: "border-box"
              }}
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 500,
              color: "#333"
            }}>
              비밀번호
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 16,
                boxSizing: "border-box"
              }}
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#667eea",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginBottom: 16
            }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={{ textAlign: "center", color: "#666" }}>
          계정이 없으신가요?{" "}
          <Link to="/register" style={{ color: "#667eea", textDecoration: "none" }}>
            회원가입
          </Link>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/" style={{ color: "#666", textDecoration: "none", fontSize: 14 }}>
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
