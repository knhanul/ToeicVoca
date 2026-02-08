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
      const userData = localStorage.getItem("user");
      const u = userData ? JSON.parse(userData) : null;
      const userId = u?.id || 1;

      const qs = new URLSearchParams({ user_id: String(userId) });
      const r = await fetch(`${API_BASE}/stats/levels?${qs.toString()}`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to load stats");
      }
      const data = await r.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLevelSelect = (levelValue) => {
    setSelectedLevel(levelValue);
    localStorage.setItem("selectedDifficultyLevel", levelValue);
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

        {/* 레벨별 진행률 + 암기율(Perfect 기반) */}
        <div style={{
          background: "white",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginBottom: 32
        }}>
          <h2 style={{ margin: "0 0 20px 0", color: "#333" }}>레벨별 통계</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {stats?.levels?.map((level) => {
              const label = levels.find((l) => l.value === level.difficulty_level)?.label || level.difficulty_level;
              const dayProgress = level.day_progress_pct ?? 0;
              const memoPct = level.memorization_pct ?? 0;
              return (
                <div key={level.difficulty_level} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <div style={{ fontWeight: 700, color: "#333" }}>{label} (Cycle {level.cycle_no})</div>
                    <div style={{ color: "#666", fontSize: 13 }}>
                      Day 완료: {level.completed_days}/{level.total_days} ({dayProgress}%)
                      {" · "}
                      암기율(Perfect): {level.perfect_vocab}/{level.total_vocab} ({memoPct}%)
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Day 진행률</div>
                    <div style={{ height: 16, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${dayProgress}%`, background: "#667eea" }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>암기율(Perfect)</div>
                    <div style={{ height: 16, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${memoPct}%`, background: "#48bb78" }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: "#333" }}>진행한 Day별 현황</div>
                      {level.day_word_counts?.length ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#444" }}>
                          {level.day_word_counts.map((d) => (
                            <div key={d.day} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontWeight: 600 }}>Day {d.day}</div>
                              <div style={{ color: "#666" }}>
                                모름 {d.unknown_count} / 애매 {d.unsure_count} / 완료 {d.perfect_count} (총 {d.total_count})
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#666" }}>아직 진행한 Day가 없습니다.</div>
                      )}
                    </div>

                    <div style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: "#333" }}>최근 학습</div>
                      {level.recent_study?.length ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#444" }}>
                          {level.recent_study.slice(0, 8).map((r, idx) => (
                            <div key={`${r.studied_at}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ color: "#666" }}>{new Date(r.studied_at).toLocaleString()}</div>
                              <div style={{ fontWeight: 600 }}>
                                Day {r.day ?? "-"} · {r.result}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#666" }}>학습 기록이 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>�</div>
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
        </div>
      </main>
    </div>
  );
}
