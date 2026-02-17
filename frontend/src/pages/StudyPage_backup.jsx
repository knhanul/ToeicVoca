import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "/hackersvoca/api";

export default function StudyPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
  const [user, setUser] = useState(null);
  const [dayInfo, setDayInfo] = useState(null);
  const [dayProgress, setDayProgress] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const levels = useMemo(
    () => [
      { value: "600", label: "600점대", color: "blue", badge: "BEGINNER" },
      { value: "800", label: "800점대", color: "green", badge: "INTERMEDIATE" },
      { value: "900", label: "900점대", color: "purple", badge: "ADVANCED" },
    ],
    []
  );

  const [selectedLevel, setSelectedLevel] = useState(() => {
    const fromQuery = searchParams.get("difficulty_level");
    const fromStorage = localStorage.getItem("selectedDifficultyLevel");
    return fromQuery || fromStorage || "800";
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
  }, [navigate]);

  useEffect(() => {
    const fromQuery = searchParams.get("difficulty_level");
    if (fromQuery && fromQuery !== selectedLevel) {
      setSelectedLevel(fromQuery);
      localStorage.setItem("selectedDifficultyLevel", fromQuery);
    }
  }, [searchParams, selectedLevel]);

  const userId = useMemo(() => user?.id || 1, [user]);

  const fetchLevelStatus = useCallback(async () => {
    const qs = new URLSearchParams({ user_id: String(userId) });
    const r = await fetch(`${API_BASE}/levels/status?${qs.toString()}`);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.detail || "failed to load level status");
    }
    const data = await r.json();
    const level = data.levels?.find((l) => String(l.difficulty_level) === String(selectedLevel));
    if (!level) throw new Error("level status not found");
    return level;
  }, [userId, selectedLevel]);

  const ensureOpenDay = useCallback(async () => {
    const level = await fetchLevelStatus();
    setDayInfo(level);

    if (level.open_day) {
      try {
        const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });
        const r = await fetch(`${API_BASE}/stats/current-day?${qs.toString()}`);
        if (r.ok) {
          const data = await r.json();
          setDayProgress(data);
        }
      } catch (e) {
        console.warn("Failed to load current day progress:", e);
      }
      return { ...level, open_day: level.open_day };
    }

    if (!level.next_day && !level.open_day) {
      if (level.cycle_status === "completed_pending_confirm") {
        const ok = window.confirm("🎉 30일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?");
        if (!ok) {
          throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
        }
        
        const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: 30 }),
        });
        
        if (!completeR.ok) {
          const data = await completeR.json().catch(() => ({}));
          throw new Error(data.detail || "failed to complete day 30");
        }
        
        const completeData = await completeR.json();
        if (completeData.message) {
          alert(completeData.message);
        }
        
        window.location.reload();
        return;
      } else {
        throw new Error("학습을 진행할 수 없는 상태입니다. 대시보드를 확인해주세요.");
      }
    }

    const ok = window.confirm(`오늘은 Day ${level.next_day} 학습을 시작할까요?`);
    if (!ok) {
      throw new Error("오늘 학습을 시작하지 않았습니다. 리마인드를 이용하거나 대시보드로 돌아가세요.");
    }

    const r = await fetch(`${API_BASE}/levels/day/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: level.next_day }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.detail || "failed to open day");
    }

    const opened = await r.json();
    const refreshed = await fetchLevelStatus();
    setDayInfo(refreshed);
    try {
      const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });
      const r2 = await fetch(`${API_BASE}/stats/current-day?${qs.toString()}`);
      if (r2.ok) {
        const data = await r2.json();
        setDayProgress(data);
      }
    } catch (e) {
      console.warn("Failed to load current day progress after open:", e);
    }
    return { ...refreshed, open_day: opened.day };
  }, [fetchLevelStatus, selectedLevel, userId]);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    setCard(null);

    (async () => {
      const level = await ensureOpenDay();
      if (!level.open_day) {
        if (!level.next_day && level.cycle_status === "completed_pending_confirm") {
          const ok = window.confirm("🎉 30일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?");
          if (!ok) {
            throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
          }
          
          const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: 30 }),
          });
          
          if (!completeR.ok) {
            const data = await completeR.json().catch(() => ({}));
            throw new Error(data.detail || "failed to complete day 30");
          }
          
          const completeData = await completeR.json();
          if (completeData.message) {
            alert(completeData.message);
          }
          
          window.location.reload();
          return;
        }
        
        setCard(null);
        return;
      }
      
      const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });

      const r = await fetch(`${API_BASE}/cards/today?${qs.toString()}`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (r.status === 404) {
          if (level.cycle_status === "completed_pending_confirm") {
            const ok = window.confirm("🎉 30일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?");
            if (!ok) {
              throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
            }
            
            const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: 30 }),
            });
            
            if (!completeR.ok) {
              const data = await completeR.json().catch(() => ({}));
              throw new Error(data.detail || "failed to complete day 30");
            }
            
            const completeData = await completeR.json();
            if (completeData.message) {
              alert(completeData.message);
            }
            
            window.location.reload();
            return;
          }
          
          throw new Error(
            data.detail ||
              `Day ${level.open_day ?? "-"}에 해당하는 단어가 없습니다. (difficulty_level/day 데이터를 확인하세요)`
          );
        }
        throw new Error(data.detail || "failed to load card");
      }
      const data = await r.json();
      setCard(data);
    })()
      .catch((e) => {
        console.error("Load next card error:", e);
        // 에러 발생 시 카드를 초기화하고 잠시 후 다시 시도
        setCard(null);
        setError(null);
        // 1초 후 다시 시도
        setTimeout(() => {
          loadNext();
        }, 1000);
      })
      .finally(() => setLoading(false));
  }, [userId, selectedLevel]);

  useEffect(() => {
    if (user) {
      loadNext();
    }
  }, [user, loadNext]);

  const handleChangeLevel = (levelValue) => {
    setSelectedLevel(levelValue);
    localStorage.setItem("selectedDifficultyLevel", levelValue);
    setSearchParams({ difficulty_level: levelValue });
  };

  const submit = (grade) => {
    if (!card?.vocab?.id) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, vocab_id: card.vocab.id, grade }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "review failed");
        }
        return r.json();
      })
      .then(() => {
        // 성공 시 다음 카드 로드
        loadNext();
      })
      .catch((e) => {
        console.error("Study review error:", e);
        // 에러 발생 시에도 다음 카드로 진행 (무한 루프 방지)
        setError(null);
        loadNext();
      });
  };

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  if (!user) {
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToDashboard}
            className="bg-none border-none text-[20px] cursor-pointer text-blue-600"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-gray-900">학습하기</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {levels.map((l) => (
              <button
                key={l.value}
                onClick={() => handleChangeLevel(l.value)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  selectedLevel === l.value
                    ? `border-${l.color}-500 bg-${l.color}-50 text-${l.color}-600 font-bold`
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-gray-600">
            {dayInfo?.open_day ? `Day ${dayInfo.open_day}` : dayInfo?.next_day ? `Next Day ${dayInfo.next_day}` : ""}
          </div>
        </div>
      </header>

      <div className="px-5 mt-4 max-w-md mx-auto">
        <div className="bg-white rounded-[24px] p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-gray-100/50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">TOEIC VOCA 학습</h2>
            <div className="text-sm text-gray-500">
              Flashcard + Leitner Scheduling
            </div>
          </div>

          {/* Day Progress */}
          {dayProgress && dayProgress.day ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
              <div className="font-bold text-gray-800 text-sm mb-3">
                Day {dayProgress.day} 진행률
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300" 
                    style={{ width: `${dayProgress.progress_pct}%` }}
                  />
                </div>
                <div className="font-semibold text-sm text-gray-700 min-w-[80px] text-right">
                  {dayProgress.progressed_words}/{dayProgress.total_words} ({dayProgress.progress_pct}%)
                </div>
              </div>
            </div>
          ) : null}

          {/* Day Topic */}
          {card?.vocab?.topic ? (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6">
              <div className="text-center">
                <div className="text-sm font-bold text-orange-800">
                  Day {card.vocab.day} 주제: {card.vocab.topic}
                </div>
              </div>
            </div>
          ) : null}

          {/* Error Display */}
          {error ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
              <div className="text-red-700 text-sm">{error}</div>
            </div>
          ) : null}

          {/* Main Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            {loading ? (
              <div className="text-center py-10">
                <div className="text-gray-500">로딩 중...</div>
              </div>
            ) : !dayInfo?.open_day && dayInfo?.next_day ? (
              <div className="text-center py-8">
                <div className="text-lg font-bold text-gray-900 mb-2">
                  다음 학습 Day는 Day {dayInfo.next_day} 입니다.
                </div>
                <div className="text-gray-500 text-sm mb-4">
                  레벨을 선택하고 학습을 시작하세요.
                </div>
                <button
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    ensureOpenDay()
                      .then(() => loadNext())
                      .catch((e) => {
                        setError(e.message);
                        setLoading(false);
                      });
                  }}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Day {dayInfo.next_day} 학습 시작
                </button>
              </div>
            ) : card?.vocab ? (
              <>
                {/* Word Header */}
                <div className="flex justify-between items-start gap-4 mb-6">
                  <div className="flex-1">
                    {card.is_review && (
                      <div className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-medium mb-2">
                        이전 Day 복습
                      </div>
                    )}
                    <div className="text-3xl font-bold text-gray-900">
                      {card.vocab.word}
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <div>난이도: {card.vocab.difficulty_level ?? "-"}</div>
                    <div>Day: {card.vocab.day ?? "-"}</div>
                    <div>Leitner: {card.leitner_level ?? "new"}</div>
                  </div>
                </div>

                {/* Example Sentence */}
                {card.vocab.example_en ? (
                  <div className="mb-6 leading-relaxed text-gray-700">
                    <BoldMarkup text={card.vocab.example_en} />
                  </div>
                ) : null}

                {/* Meaning Card */}
                <div
                  onClick={() => setRevealMeaning(true)}
                  className={`mt-6 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    revealMeaning 
                      ? "bg-blue-50 border-blue-200" 
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                  title="클릭하여 뜻 보기"
                >
                  {revealMeaning ? (
                    <div className="text-lg">
                      {card.vocab.meaning}
                      {card.vocab.example_kr ? (
                        <div className="mt-2 text-gray-600">
                          <BoldMarkup text={card.vocab.example_kr} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-2">
                      뜻 보기 (클릭)
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => submit("again")}
                    disabled={loading}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]"
                    }`}
                  >
                    몰라요 (Again)
                  </button>
                  <button
                    onClick={() => submit("good")}
                    disabled={loading}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98]"
                    }`}
                  >
                    애매해요 (Good)
                  </button>
                  <button
                    onClick={() => submit("perfect")}
                    disabled={loading}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-green-500 text-white hover:bg-green-600 active:scale-[0.98]"
                    }`}
                  >
                    알아요 (Perfect)
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <div className="text-gray-500 mb-4">
                  학습할 단어가 없습니다
                </div>
                <button
                  onClick={handleBackToDashboard}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  대시보드로 돌아가기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl shadow-[0_-0.5px_0_0_rgba(0,0,0,0.1)] px-6 pb-8 pt-3 flex justify-between items-center z-50">
        <button 
          onClick={handleBackToDashboard}
          className="flex flex-col items-center gap-1 text-gray-400"
        >
          <span className="material-symbols-outlined">home</span>
          <span className="text-[10px] font-medium">홈</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-blue-600">
          <span className="material-symbols-outlined">menu_book</span>
          <span className="text-[10px] font-bold">학습</span>
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
