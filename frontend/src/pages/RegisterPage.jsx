import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 비밀번호 확인
    if (formData.password !== formData.confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    try {
      // TODO: 실제 API 연동
      // 임시 회원가입 처리
      if (formData.username && formData.email && formData.password) {
        // 성공 메시지 표시
        setSuccess(true);
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      } else {
        setError("모든 필드를 입력해주세요.");
      }
    } catch (err) {
      setError("회원가입에 실패했습니다.");
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

  if (success) {
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
          maxWidth: 400,
          textAlign: "center"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#333",
            marginBottom: 16
          }}>
            회원가입 완료!
          </h2>
          <p style={{ color: "#666", marginBottom: 24 }}>
            로그인 페이지로 이동합니다...
          </p>
        </div>
      </div>
    );
  }

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
            회원가입
          </h1>
          <p style={{ color: "#666" }}>
            TOEIC VOCA에 가입하고 학습을 시작하세요
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
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 500,
              color: "#333"
            }}>
              이메일
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 16,
                boxSizing: "border-box"
              }}
              placeholder="이메일을 입력하세요"
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
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
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 500,
              color: "#333"
            }}>
              비밀번호 확인
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #ddd",
                borderRadius: 8,
                fontSize: 16,
                boxSizing: "border-box"
              }}
              placeholder="비밀번호를 다시 입력하세요"
              required
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
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <div style={{ textAlign: "center", color: "#666" }}>
          이미 계정이 있으신가요?{" "}
          <Link to="/login" style={{ color: "#667eea", textDecoration: "none" }}>
            로그인
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
