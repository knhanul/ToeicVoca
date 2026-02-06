import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [formData, setFormData] = useState({
    username: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // TODO: 실제 API 연동
      // 임시 로그인 처리
      if (formData.username && formData.password) {
        localStorage.setItem("user", JSON.stringify({
          id: 1,
          username: formData.username
        }));
        navigate("/dashboard");
      } else {
        setError("아이디와 비밀번호를 입력해주세요.");
      }
    } catch (err) {
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
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#333",
            marginBottom: 8
          }}>
            로그인
          </h1>
          <p style={{ color: "#666" }}>
            TOEIC VOCA에 오신 것을 환영합니다
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

        <form onSubmit={handleSubmit}>
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
