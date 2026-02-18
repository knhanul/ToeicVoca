import { Link } from "react-router-dom";
import toeicVocaImage from "../assets/Toeic_Voca.png";

export default function LandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      color: "white"
    }}>
      {/* TOEIC VOCO 이미지 - 정중앙 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        width: "100%",
        maxWidth: "600px"
      }}>
        <img 
          src={toeicVocaImage}
          alt="TOEIC VOCO" 
          style={{
            width: "100%",
            maxWidth: "500px",
            height: "auto",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
          }}
        />
      </div>

      {/* 시작하기 버튼 - 하단 */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginTop: "auto",
        marginBottom: 40
      }}>
        <Link
          to="/login"
          style={{
            background: "white",
            color: "#667eea",
            padding: "16px 40px",
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
      </div>
    </div>
  );
}
