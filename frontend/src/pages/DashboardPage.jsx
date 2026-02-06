import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "/voca/api";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const levels = useMemo(
    () => [
      { value: "600", label: "600점대" },
      { value: "800", label: "800점대" },
      { value: "900", label: "900점대" },
    ],
    []
  );

  const [selectedLevel, setSelectedLevel] = useState(
    () => localStorage.getItem("selectedDifficultyLevel") || "800"
  );

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    loadStats();
  }, [navigate]);

  const loadStats = async () => {
    try {
      // TODO: 실제 API 연동
      // 임시 데이터
      setStats({
        totalWords: 1500,
        learnedWords: 856,
        currentLevel: levels.find((l) => l.value === selectedLevel)?.label || "-",
        studyDays: 45,
        streakDays: 12,
        completionRate: 57,
        levels: [
          { level: "600점대", total: 500, completed: 120, progress: 24, cycles: 0 },
          { level: "800점대", total: 500, completed: 356, progress: 71, cycles: 1 },
          { level: "900점대", total: 500, completed: 380, progress: 76, cycles: 2 },
        ]
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLevelSelect = (levelValue) => {
    setSelectedLevel(levelValue);
    localStorage.setItem("selectedDifficultyLevel", levelValue);
    setStats((prev) =>
      prev
        ? {
            ...prev,
            currentLevel: levels.find((l) => l.value === levelValue)?.label || "-",
          }
        : prev
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  if (loading) {
    return (
      <div style={{
        fontFamily: "system-ui",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5"
      }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "system-ui",
      minHeight: "100vh",
      background: "#f5f5f5"
    }}>
      {/* Header */}
      <header style={{
        background: "white",
        padding: "16px 24px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, color: "#333" }}>TOEIC VOCA</h1>
          <span style={{ color: "#666" }}>|</span>
          <span style={{ color: "#666" }}>대시보드</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#666" }}>안녕하세요, {user?.username}님!</span>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              background: "#667eea",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer"
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            background: "white",
            padding: 20,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#333" }}>
              학습 레벨 선택
            </div>
            <div style={{ color: "#666", fontSize: 14 }}>
              difficulty_level 기준으로 단어를 필터링해서 학습합니다.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {levels.map((l) => (
              <button
                key={l.value}
                onClick={() => handleLevelSelect(l.value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: selectedLevel === l.value ? "2px solid #667eea" : "1px solid #ddd",
                  background: selectedLevel === l.value ? "#eef2ff" : "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "#333",
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* 요약 통계 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 20,
          marginBottom: 32
        }}>
          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#667eea" }}>
              {stats?.learnedWords}
            </div>
            <div style={{ color: "#666", marginTop: 4 }}>학습한 단어</div>
            <div style={{ fontSize: 14, color: "#999", marginTop: 4 }}>
              / {stats?.totalWords}개
            </div>
          </div>

          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#48bb78" }}>
              {stats?.completionRate}%
            </div>
            <div style={{ color: "#666", marginTop: 4 }}>전체 진행률</div>
          </div>

          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#ed8936" }}>
              {stats?.streakDays}
            </div>
            <div style={{ color: "#666", marginTop: 4 }}>연속 학습일</div>
          </div>

          <div style={{
            background: "white",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#9f7aea" }}>
              {stats?.currentLevel}
            </div>
            <div style={{ color: "#666", marginTop: 4 }}>현재 레벨</div>
          </div>
        </div>

        {/* 레벨별 진행률 */}
        <div style={{
          background: "white",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginBottom: 32
        }}>
          <h2 style={{ margin: "0 0 20px 0", color: "#333" }}>레벨별 학습 진행률</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {stats?.levels.map((level) => (
              <div key={level.level} style={{
                display: "flex",
                alignItems: "center",
                gap: 16
              }}>
                <div style={{ width: 100, fontWeight: 500 }}>{level.level}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    height: 24,
                    background: "#e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    position: "relative"
                  }}>
                    <div style={{
                      height: "100%",
                      background: level.progress === 100 ? "#48bb78" : "#667eea",
                      width: `${level.progress}%`,
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                </div>
                <div style={{ width: 120, textAlign: "right", fontSize: 14 }}>
                  <div>{level.completed}/{level.total} ({level.progress}%)</div>
                  {level.cycles > 0 && (
                    <div style={{ color: "#666" }}>
                      {level.cycles > 1 ? `${level.cycles}번째 반복` : "1회 완료"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 기능 메뉴 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 20
        }}>
          <Link
            to={`/study?difficulty_level=${encodeURIComponent(selectedLevel)}`}
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              textAlign: "center",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-4px)";
              e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <h3 style={{ margin: "0 0 8px 0", color: "#333" }}>학습 시작</h3>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              오늘의 단어 학습하기
            </p>
          </Link>

          <Link
            to="/review"
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              textAlign: "center",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-4px)";
              e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <h3 style={{ margin: "0 0 8px 0", color: "#333" }}>복습</h3>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              배운 단어 복습하기
            </p>
          </Link>

          <Link
            to="/statistics"
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              textAlign: "center",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-4px)";
              e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3 style={{ margin: "0 0 8px 0", color: "#333" }}>통계</h3>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              학습 통계 보기
            </p>
          </Link>

          <Link
            to="/settings"
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              textDecoration: "none",
              color: "inherit",
              textAlign: "center",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-4px)";
              e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <h3 style={{ margin: "0 0 8px 0", color: "#333" }}>설정</h3>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              학습 설정 관리
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
