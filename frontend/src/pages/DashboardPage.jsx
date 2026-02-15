import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "/hackersvoca/api";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [detailStatsByLevel, setDetailStatsByLevel] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [activeTab, setActiveTab] = useState("dayProgress");
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

  const loadDetailStats = async (level) => {
    setDetailLoading(true);
    try {
      const userId = user?.id;
      if (!userId) throw new Error("not logged in");

      const qs = new URLSearchParams({ user_id: String(userId) });
      const r = await fetch(`${API_BASE}/stats/levels?${qs.toString()}`);

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || "failed to load detail stats");
      }

      const data = await r.json();
      const levelData = data.levels?.find((l) => String(l.difficulty_level) === String(level)) || null;
      setDetailStatsByLevel((prev) => ({ ...prev, [String(level)]: levelData }));
    } catch (error) {
      console.error("Failed to load detail stats:", error);
      setDetailStatsByLevel((prev) => ({ ...prev, [String(level)]: null }));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleLevelDetail = (level) => {
    if (expandedLevel === level) {
      setExpandedLevel(null);
    } else {
      setExpandedLevel(level);
      loadDetailStats(level);
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
            {levels.map((l) => {
              const levelData = stats?.levels?.find((lvl) => lvl.difficulty_level === l.value);
              const label = l.label;
              const dayProgress = levelData?.progress ?? 0;
              const memoPct = levelData?.memorization_pct ?? 0;
              const isExpanded = expandedLevel === l.value;
              const detail = isExpanded ? detailStatsByLevel[String(l.value)] : null;
              return (
                <div key={l.value} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <div style={{ fontWeight: 700, color: "#333" }}>{label}</div>
                    <button
                      onClick={() => toggleLevelDetail(l.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: isExpanded ? "#eef2ff" : "white",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#667eea"
                      }}
                    >
                      {isExpanded ? "닫기" : "상세보기"}
                    </button>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Day 진행률</div>
                    <div style={{ height: 16, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${dayProgress}%`, background: "#667eea" }} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 16 }}>
                      {detailLoading ? (
                        <div style={{ fontSize: 13, color: "#666" }}>불러오는 중...</div>
                      ) : detail ? (
                        <div>
                          {/* 탭 버튼 */}
                          <div className="flex border-b border-gray-300 mb-3">
                            <button
                              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === "dayProgress"
                                  ? "border-blue-500 text-blue-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700"
                              }`}
                              onClick={() => setActiveTab("dayProgress")}
                            >
                              진행한 Day별 현황
                            </button>
                            <button
                              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === "recentStudy"
                                  ? "border-blue-500 text-blue-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700"
                              }`}
                              onClick={() => setActiveTab("recentStudy")}
                            >
                              최근 학습
                            </button>
                          </div>

                          {/* 탭 내용 */}
                          {activeTab === "dayProgress" && (
                            <div className="border border-gray-300 rounded-xl shadow-sm overflow-hidden">
                              <div className="bg-blue-50 px-3 py-2 border-b border-gray-300">
                                <div className="font-bold text-gray-800 text-sm">진행한 Day별 현황</div>
                              </div>
                              <div className="p-3">
                                {detail.day_word_counts?.length ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                    {detail.day_word_counts
                                      .slice()
                                      .sort((a, b) => b.day - a.day)
                                      .map((d) => (
                                        <div
                                          key={d.day}
                                          className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                        >
                                          <div className="text-xs font-semibold text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                            Day {d.day}
                                            {d.topic && (
                                              <span className="text-[10px] text-gray-500 font-normal ml-1">
                                                - {d.topic}
                                              </span>
                                            )}
                                            <span className="text-[10px] text-blue-600 font-normal ml-1">
                                              ({d.cycle_no}회독)
                                            </span>
                                            <span className="text-[10px] text-gray-600 ml-2">
                                              모름 {d.unknown_count} / 애매 {d.unsure_count} / 완료 {d.perfect_count} (총 {d.total_count})
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500">아직 진행한 Day가 없습니다.</div>
                                )}
                              </div>
                            </div>
                          )}

                          {activeTab === "recentStudy" && (
                            <div className="border border-gray-300 rounded-xl shadow-sm overflow-hidden">
                              <div className="bg-green-50 px-3 py-2 border-b border-gray-300">
                                <div className="font-bold text-gray-800 text-sm">최근 학습</div>
                              </div>
                              <div className="p-3">
                                {detail.recent_study?.length ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {detail.recent_study.map((r, idx) => (
                                      <div
                                        key={`${r.studied_at}-${idx}`}
                                        className="border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      >
                                        <div className="text-xs text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                                          {new Date(r.studied_at).toLocaleString()}
                                          <span className="font-semibold text-gray-800 ml-2">
                                            {r.word || `Day ${r.day || "?"}`}
                                            {r.day && (
                                              <span className="text-[10px] text-gray-500 font-normal ml-1">
                                                Day {r.day}
                                              </span>
                                            )}
                                            {r.topic && (
                                              <span className="text-[10px] text-gray-400 font-normal ml-1">
                                                - {r.topic}
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-[10px] text-gray-600 ml-2">{r.result}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500">학습 기록이 없습니다.</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
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
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>학습하기</div>
            <div style={{ fontSize: 14, color: "#666" }}>
              {levels.find((l) => l.value === selectedLevel)?.label || "-"} 단어 학습
            </div>
          </Link>

          <Link
            to={`/remind?difficulty_level=${encodeURIComponent(selectedLevel)}`}
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
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>리마인드</div>
            <div style={{ fontSize: 14, color: "#666" }}>
              최근 7일간 학습한 단어 복습
            </div>
          </Link>

          <button
            onClick={async () => {
              try {
                const qs = new URLSearchParams({ user_id: "1" });
                const r = await fetch(`${API_BASE}/levels/status?${qs.toString()}`);
                if (!r.ok) {
                  const data = await r.json().catch(() => ({}));
                  throw new Error(data.detail || "failed to load level status");
                }
                const data = await r.json();
                const level = data.levels?.find((l) => String(l.difficulty_level) === String(selectedLevel));
                if (!level) {
                  alert("레벨 상태를 불러올 수 없습니다.");
                  return;
                }
                // 다음 Day 계산 (open_day가 있으면 +1, 없으면 next_day)
                const nextDay = level.open_day ? level.open_day + 1 : level.next_day;
                
                // 사이클 완료 확인
                if (!nextDay && !level.open_day && level.cycle_status === "completed_pending_confirm") {
                  const ok = window.confirm("🎉 30일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?");
                  if (!ok) return;
                  
                  // Day 30 완료 처리 API 호출
                  const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: 1, difficulty_level: selectedLevel, day: 30 }),
                  });
                  
                  if (!completeR.ok) {
                    const data = await completeR.json().catch(() => ({}));
                    if (data.detail && data.detail.includes("이미")) {
                      alert(data.detail);
                      // 이미 회독이 진행 중이면 상태 새로고침
                      loadStats();
                      loadDetailStats(selectedLevel);
                      return;
                    }
                    throw new Error(data.detail || "failed to complete day 30");
                  }
                  
                  const completeData = await completeR.json();
                  if (completeData.message) {
                    alert(completeData.message);
                  }
                  
                  // 새로운 사이클이 시작되면 페이지 리로드
                  if (completeData.cycle_no > 1) {
                    window.location.reload();
                    return;
                  }
                }
                
                if (!nextDay) {
                  alert("학습을 진행할 수 없는 상태입니다. 대시보드를 확인해주세요.");
                  return;
                }
                const ok = window.confirm(`다음 Day ${nextDay} 학습을 시작할까요?\n${level.open_day ? `현재 Day ${level.open_day}를 완료하고 다음 Day로 진행합니다.` : ''}`);
                if (!ok) return;
                const openR = await fetch(`${API_BASE}/levels/day/open`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user_id: 1, difficulty_level: selectedLevel, day: nextDay }),
                });
                if (!openR.ok) {
                  const data = await openR.json().catch(() => ({}));
                  throw new Error(data.detail || "failed to open day");
                }
                const openData = await openR.json();
                if (openData.message) {
                  alert(openData.message);
                  // 새로운 사이클이 시작되면 대시보드 새로고침
                  if (openData.cycle_no > 1) {
                    loadStats();
                    loadDetailStats(selectedLevel);
                  }
                } else {
                  alert(`Day ${nextDay}를 열었습니다. 학습하기로 이동합니다.`);
                }
                navigate(`/study?difficulty_level=${encodeURIComponent(selectedLevel)}`);
              } catch (e) {
                alert(e.message);
              }
            }}
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              border: "none",
              color: "inherit",
              textAlign: "center",
              transition: "transform 0.2s, box-shadow 0.2s",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>다음 학습 시작</div>
            <div style={{ fontSize: 14, color: "#666" }}>
              현재 레벨의 다음 Day를 바로 시작
            </div>
          </button>
        </div>
      </main>
    </div>
  );
}
