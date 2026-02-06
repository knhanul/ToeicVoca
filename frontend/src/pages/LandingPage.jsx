import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div style={{
      fontFamily: "system-ui",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      color: "white"
    }}>
      <div style={{
        textAlign: "center",
        maxWidth: 600,
        marginBottom: 48
      }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 700,
          marginBottom: 16,
          textShadow: "0 2px 4px rgba(0,0,0,0.3)"
        }}>
          TOEIC VOCA
        </h1>
        <p style={{
          fontSize: 20,
          marginBottom: 24,
          opacity: 0.9,
          lineHeight: 1.6
        }}>
          효율적인 TOEIC 어휘 학습 시스템<br />
          Flashcard + Leitner Scheduling
        </p>
        <div style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap"
        }}>
          <div style={{
            background: "rgba(255,255,255,0.1)",
            padding: "12px 20px",
            borderRadius: 8,
            backdropFilter: "blur(10px)"
          }}>
            📚 레벨별 학습
          </div>
          <div style={{
            background: "rgba(255,255,255,0.1)",
            padding: "12px 20px",
            borderRadius: 8,
            backdropFilter: "blur(10px)"
          }}>
            📊 학습 통계
          </div>
          <div style={{
            background: "rgba(255,255,255,0.1)",
            padding: "12px 20px",
            borderRadius: 8,
            backdropFilter: "blur(10px)"
          }}>
            🔄 반복 학습
          </div>
        </div>
      </div>

      <div style={{
        display: "flex",
        gap: 16,
        flexDirection: "column",
        alignItems: "center"
      }}>
        <Link
          to="/login"
          style={{
            background: "white",
            color: "#667eea",
            padding: "16px 32px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 18,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            transition: "transform 0.2s"
          }}
          onMouseEnter={(e) => e.target.style.transform = "translateY(-2px)"}
          onMouseLeave={(e) => e.target.style.transform = "translateY(0)"}
        >
          시작하기
        </Link>
        <p style={{ opacity: 0.7, fontSize: 14 }}>
          이미 계정이 있으신가요? <Link to="/login" style={{ color: "white", textDecoration: "underline" }}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
