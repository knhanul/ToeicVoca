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
      { value: "600", label: "600점대", color: "blue", badge: "BEGINNER" },
      { value: "800", label: "800점대", color: "green", badge: "INTERMEDIATE" },
      { value: "900", label: "900점대", color: "purple", badge: "ADVANCED" },
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
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  // 페이지가 다시 보일 때 데이터 새로고침 (학습 후 돌아올 때)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        loadStats();
      }
    };

    // 다른 페이지에서 새로고침 요청 확인
    const checkRefreshTrigger = () => {
      const refreshTime = localStorage.getItem('dashboard_refresh');
      if (refreshTime && user) {
        localStorage.removeItem('dashboard_refresh');
        loadStats();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    checkRefreshTrigger(); // 페이지 로드 시 확인
    
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const loadStats = async () => {
    try {
      const userId = user?.id;
      if (!userId) throw new Error("User not logged in");

      // 실제 API 호출로 통계 데이터 가져오기
      const qs = new URLSearchParams({ user_id: String(userId) });
      const r = await fetch(`${API_BASE}/stats/levels?${qs.toString()}`);
      
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.detail || "failed to load stats");
      }
      
      const data = await r.json();
      
      // API 데이터로 stats 상태 설정
      const levelsData = data.levels || [];
      const totalWords = levelsData.reduce((sum, level) => sum + (level.total_vocab || 0), 0);
      const perfectWords = levelsData.reduce((sum, level) => sum + (level.perfect_vocab || 0), 0);
      
      // 레벨별 데이터 변환 - 전체 학습 건수 기반으로 계산
      const levelsStats = levelsData.map(level => {
        // recent_study에서 고유 단어 ID만 추출 (학습한 단어 수)
        const studiedWords = level.recent_study ? [...new Set(level.recent_study.map(s => s.vocab_id))].length : 0;
        const studiedDays = level.recent_study ? [...new Set(level.recent_study.map(s => s.day))].length : 0;
        
        return {
          level: levels.find(l => l.value === String(level.difficulty_level))?.label || `${level.difficulty_level}점대`,
          total: level.total_vocab || 0, // 총 단어 수
          studied: studiedWords, // 학습한 단어 수 (good + again + perfect)
          progress: level.total_vocab > 0 ? Math.round((studiedWords / level.total_vocab) * 100) : 0, // 학습률
          cycles: level.cycle_no || 0, // 현재 학습 회차
          totalDays: level.total_days || 30, // Day 정보
          completedDays: level.completed_days || 0, // 완료된 Day 수
          studiedDays: studiedDays, // 학습한 Day 수
          perfectWords: level.perfect_vocab || 0 // 완벽 마스터 단어 수
        };
      });
      
      const totalStudiedWords = levelsStats.reduce((sum, level) => sum + level.studied, 0);
      
      setStats({
        totalWords,
        learnedWords: totalStudiedWords, // 실제 학습한 단어 수
        perfectWords,
        currentLevel: levels.find((l) => l.value === selectedLevel)?.label || "-",
        studyDays: levelsStats.reduce((sum, level) => sum + level.studiedDays, 0), // 학습한 Day 수
        streakDays: 0, // API에서 필요 시 추가
        completionRate: totalWords > 0 ? Math.round((perfectWords / totalWords) * 100) : 0, // Perfect 기반 완성도
        levels: levelsStats
      });
    } catch (error) {
      console.error("Failed to load stats:", error);
      // 에러 시 기본값 설정
      setStats({
        totalWords: 0,
        learnedWords: 0,
        perfectWords: 0,
        currentLevel: "-",
        studyDays: 0,
        streakDays: 0,
        completionRate: 0,
        levels: []
      });
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
      
      // API의 day_word_counts를 그대로 사용 (최신 결과 기반으로 이미 계산됨)
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

  const handleNextStudy = async () => {
    try {
      const qs = new URLSearchParams({ user_id: String(user?.id || 1) });
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
      const nextDay = level.open_day ? level.open_day + 1 : level.next_day;
      
      if (!nextDay && !level.open_day && level.cycle_status === "completed_pending_confirm") {
        const ok = window.confirm("🎉 30일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?");
        if (!ok) return;
        
        const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user?.id || 1, difficulty_level: selectedLevel, day: 30 }),
        });
        
        if (!completeR.ok) {
          const data = await completeR.json().catch(() => ({}));
          if (data.detail && data.detail.includes("이미")) {
            alert(data.detail);
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
        body: JSON.stringify({ user_id: user?.id || 1, difficulty_level: selectedLevel, day: nextDay }),
      });
      if (!openR.ok) {
        const data = await openR.json().catch(() => ({}));
        throw new Error(data.detail || "failed to open day");
      }
      const openData = await openR.json();
      if (openData.message) {
        alert(openData.message);
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>로딩 중...</div>
      </div>
    );
  }

  const getLevelColor = (levelValue) => {
    const level = levels.find(l => l.value === levelValue);
    return level ? level.color : "blue";
  };

  const getLevelBadge = (levelValue) => {
    const level = levels.find(l => l.value === levelValue);
    return level ? level.badge : "BEGINNER";
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-white font-bold shadow-sm">
            {user?.username?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Welcome back</p>
            <h2 className="text-sm font-bold text-gray-900">{user?.username}님</h2>
          </div>
        </div>
        <div className="flex items-center gap-4 text-gray-500">
          <button className="relative bg-gray-100 p-2 rounded-full">
            <span className="material-symbols-outlined text-[22px] block">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
        </div>
      </header>

      {/* Score Display */}
      <section className="px-5 mt-4 max-w-md mx-auto">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-[24px] p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] text-white">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm opacity-90 mb-1">완벽하게 마스터한 단어</p>
              <div className="text-3xl font-bold">{stats?.perfectWords || 0}</div>
              <p className="text-sm opacity-75 mt-1">전체 {stats?.totalWords || 0}단어 중</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">
                {Math.round(((stats?.perfectWords || 0) / (stats?.totalWords || 1)) * 100)}%
              </div>
              <p className="text-sm opacity-75">완성도</p>
            </div>
          </div>
        </div>
      </section>

      <main className="px-5 mt-6 max-w-md mx-auto space-y-8">
        {/* Quick Actions */}
        <section className="grid grid-cols-1 gap-4">
          <Link
            to={`/study?difficulty_level=${encodeURIComponent(selectedLevel)}`}
            className="group relative overflow-hidden bg-white rounded-[32px] p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-gray-100/50 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-blue-50 rounded-[22px] flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 text-3xl">school</span>
              </div>
              <div>
                <h4 className="font-bold text-xl text-gray-900">학습하기</h4>
                <p className="text-sm text-gray-500">선택한 레벨 집중 학습</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-300">chevron_right</span>
          </Link>

          <Link
            to={`/remind?difficulty_level=${encodeURIComponent(selectedLevel)}`}
            className="group relative overflow-hidden bg-white rounded-[32px] p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-gray-100/50 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-orange-50 rounded-[22px] flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-500 text-3xl">history</span>
              </div>
              <div>
                <h4 className="font-bold text-xl text-gray-900">리마인드</h4>
                <p className="text-sm text-gray-500">틀린 단어 7일 복습</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-300">chevron_right</span>
          </Link>
        </section>

        {/* Next Study Button */}
        <section>
          <button
            onClick={handleNextStudy}
            className="w-full flex items-center justify-between bg-blue-50/50 border border-blue-100/50 rounded-2xl px-5 py-3 text-blue-700 active:bg-blue-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-600 text-lg">play_circle</span>
              <span className="text-sm font-semibold">다음 학습 시작</span>
            </div>
            <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
          </button>
        </section>

        {/* Level Selection */}
        <section>
          <div className="flex items-baseline justify-between mb-4 px-1">
            <h3 className="text-lg font-bold text-gray-900">목표 점수</h3>
            <span className="text-xs text-blue-500 font-medium">난이도 설정</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
            {levels.map((l) => (
              <button
                key={l.value}
                onClick={() => handleLevelSelect(l.value)}
                className={`flex-shrink-0 px-6 py-2.5 rounded-2xl bg-white border shadow-sm font-medium text-sm transition-colors ${
                  selectedLevel === l.value
                    ? `border-${l.color}-500 text-${l.color}-600 font-bold`
                    : "border-gray-100 text-gray-500"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        {/* Level Progress */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 mb-4 px-1">레벨별 학습 현황</h3>
          <div className="space-y-4">
            {levels.map((l) => {
              const levelData = stats?.levels?.find((lvl) => lvl.level === l.label);
              const progress = levelData?.progress ?? 0;
              const studied = levelData?.studied ?? 0;
              const total = levelData?.total ?? 500;
              const cycles = levelData?.cycles ?? 0;
              const isExpanded = expandedLevel === l.value;
              const detail = isExpanded ? detailStatsByLevel[String(l.value)] : null;
              
              return (
                <div key={l.value} className="bg-white rounded-[24px] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-gray-100/50">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className={`text-[10px] font-bold bg-${l.color}-50 text-${l.color}-600 px-2 py-1 rounded-md mr-2`}>
                        {l.badge}
                      </span>
                      <span className="text-base font-bold text-gray-900">{l.label}</span>
                      <span className="text-xs text-gray-500 ml-2">회차 {cycles}</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">{progress}%</div>
                  </div>
                  
                  <div className="relative h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div 
                      className={`absolute top-0 left-0 h-full bg-${l.color}-500 rounded-full`} 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center text-[11px] text-gray-500 font-medium">
                    <div className="flex gap-3">
                      <span>현재 Day {levelData?.completedDays + 1 || 1}</span>
                      <span>학습 {studied}</span>
                      <span>전체 {total}</span>
                    </div>
                    <button
                      onClick={() => toggleLevelDetail(l.value)}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      상세보기
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {detailLoading ? (
                        <div className="text-xs text-gray-500">불러오는 중...</div>
                      ) : detail ? (
                        <div>
                          {/* Tabs */}
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

                          {/* Tab Content */}
                          {activeTab === "dayProgress" && (
                            <div className="border border-gray-300 rounded-xl shadow-sm overflow-hidden">
                              <div className="bg-blue-50 px-3 py-2 border-b border-gray-300">
                                <div className="font-bold text-gray-800 text-sm">진행한 Day별 현황</div>
                              </div>
                              <div className="p-3">
                                {detail.day_word_counts?.length ? (
                                  <div className="max-h-60 overflow-y-auto">
                                    <div className="space-y-2">
                                      {detail.day_word_counts
                                        .slice()  // API에서 이미 정렬된 순서 유지
                                        .map((d) => (
                                        <div
                                          key={d.day}
                                          className="border border-gray-200 rounded-lg px-4 py-3 bg-white flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex-1">
                                            <div className="text-sm font-semibold text-gray-800">
                                              Day {d.day}
                                              {d.topic && (
                                                <span className="text-xs text-gray-500 font-normal ml-2">
                                                  - {d.topic}
                                                </span>
                                              )}
                                              <span className="text-xs text-blue-600 font-normal ml-2">
                                                ({d.cycle_no}회독)
                                              </span>
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                              모름 {d.unknown_count} / 애매 {d.unsure_count} / 완료 {d.perfect_count} (총 {d.total_count})
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
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
                                  <div className="max-h-60 overflow-y-auto">
                                    <div className="space-y-2">
                                      {detail.recent_study.map((r, idx) => (
                                      <div
                                        key={`${r.studied_at}-${idx}`}
                                        className="border border-gray-200 rounded-lg px-4 py-3 bg-white flex items-center justify-between hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-1">
                                          <div className="text-sm font-semibold text-gray-800">
                                            {r.word || `Day ${r.day || "?"}`}
                                            <span className="text-xs text-blue-600 font-normal ml-2">
                                              Day {r.day} ({r.cycle_no}회독)
                                            </span>
                                            {r.topic && (
                                              <span className="text-xs text-gray-500 font-normal ml-2">
                                                - {r.topic}
                                              </span>
                                            )}
                                            <span className="text-xs text-gray-600 ml-2">{r.result}</span>
                                          </div>
                                          <div className="text-xs text-gray-400 mt-1">
                                            {new Date(r.studied_at).toLocaleString()}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    </div>
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
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl shadow-[0_-0.5px_0_0_rgba(0,0,0,0.1)] px-6 pb-8 pt-3 flex justify-between items-center z-50">
        <button className="flex flex-col items-center gap-1 text-blue-600">
          <span className="material-symbols-outlined fill-1">home</span>
          <span className="text-[10px] font-bold">홈</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">menu_book</span>
          <span className="text-[10px] font-medium">학습</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">history</span>
          <span className="text-[10px] font-medium">리마인드</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">person</span>
          <span className="text-[10px] font-medium">프로필</span>
        </button>
      </nav>
    </div>
  );
}
