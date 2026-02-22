import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, RefreshCw, ChevronRight, User, Bell, Award, ArrowLeft, Home, History } from "lucide-react";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = "/api"; // Force direct connection

const levels = [
  { value: "600", label: "600점대", color: "blue", badge: "BEGINNER" },
  { value: "800", label: "800점대", color: "green", badge: "INTERMEDIATE" },
  { value: "900", label: "900점대", color: "purple", badge: "ADVANCED" },
];

export default function StudyPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
  const [user, setUser] = useState(null);
  const [dayInfo, setDayInfo] = useState(null);
  const [dayProgress, setDayProgress] = useState(null);
  const [syncingDayProgress, setSyncingDayProgress] = useState(false);
  const [excludePerfectWords, setExcludePerfectWords] = useState({});
  const [excludePerfect, setExcludePerfect] = useState(
    () => localStorage.getItem("excludePerfect") === "true"
  );
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedLevel, setSelectedLevel] = useState(() => {
    const fromQuery = searchParams.get("difficulty_level");
    const fromStorage = localStorage.getItem("selectedDifficultyLevel");
    return fromQuery || fromStorage || "800";
  });

  const userId = user?.id || 1;

  // Load exclude perfect words settings from DB
  useEffect(() => {
    if (user) {
      const loadSettings = async () => {
        try {
          const qs = new URLSearchParams({ user_id: String(userId) });
          const r = await fetch(`${API_BASE}/user/exclude-perfect-settings?${qs.toString()}`);
          if (r.ok) {
            const data = await r.json();
            setExcludePerfectWords(data.exclude_perfect_settings || {});
            const globalSetting = data.exclude_perfect_settings?.global || false;
            setExcludePerfect(globalSetting);
            localStorage.setItem("excludePerfect", String(globalSetting));
          }
        } catch (e) {
          console.warn("Failed to load exclude perfect settings:", e);
        }
      };
      loadSettings();
    }
  }, [user, userId]);

  // Debug logging for dayProgress
  useEffect(() => {
    if (dayProgress) {
      console.log("DayProgress data:", dayProgress);
      console.log("Perfect words count:", dayProgress.perfect_words);
      console.log("Total words:", dayProgress.total_words);
      console.log("Progressed words:", dayProgress.progressed_words);
      console.log("Studied words:", dayProgress.studied_words);
      console.log("Progress pct:", dayProgress.progress_pct);
      
      // Test calculation
      if (excludePerfect) {
        const totalWords = dayProgress.total_words || 0;
        const perfectWords = dayProgress.perfect_words || 0;
        const studiedWords = dayProgress.studied_words || dayProgress.progressed_words || 0; // Use progressed_words as fallback
        const adjustedTotal = Math.max(1, totalWords - perfectWords);
        const progress = Math.round((studiedWords / adjustedTotal) * 100);
        console.log("Progress calculation:", {
          totalWords,
          perfectWords,
          studiedWords,
          adjustedTotal,
          progress
        });
      }
    }
  }, [dayProgress, excludePerfect]);

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
  }, [searchParams, selectedLevel]); // Remove setSelectedLevel

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
        const totalDays = level.total_days || 30;
        const ok = window.confirm(`🎉 ${totalDays}일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?`);
        if (!ok) {
          throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
        }
        
        const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: totalDays }),
        });
        
        if (!completeR.ok) {
          const data = await completeR.json().catch(() => ({}));
          throw new Error(data.detail || `failed to complete day ${totalDays}`);
        }
        
        const completeData = await completeR.json();
        if (completeData.message) {
          alert(completeData.message);
        }
        
        // Navigate to dashboard instead of reload
        navigate("/dashboard");
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
  }, [fetchLevelStatus, selectedLevel, userId, navigate]);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    setCard(null);

    (async () => {
      let isMounted = true;
      
      try {
        const level = await ensureOpenDay();  
        if (!isMounted || !level) return;  
        
        if (!level.open_day) {
          if (!level.next_day && level.cycle_status === "completed_pending_confirm") {
            const totalDays = level.total_days || 30;
            const ok = window.confirm(`🎉 ${totalDays}일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?`);
            if (!ok) {
              throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
            }
            
            const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: totalDays }),
            });
            
            if (!completeR.ok) {
              const data = await completeR.json().catch(() => ({}));
              throw new Error(data.detail || `failed to complete day ${totalDays}`);
            }
            
            const completeData = await completeR.json();
            if (completeData.message) {
              alert(completeData.message);
            }
            
            // Navigate to dashboard instead of reload
            navigate("/dashboard");
            return;
          }
          
          if (isMounted) setCard(null);
          return;
        }
        
        const qs = new URLSearchParams({ 
          user_id: String(userId), 
          difficulty_level: selectedLevel,
          exclude_perfect: excludePerfect ? "true" : "false"
        });

        const r = await fetch(`${API_BASE}/cards/today?${qs.toString()}`);
        if (!isMounted) return;
        
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (r.status === 404) {
            if (level.cycle_status === "completed_pending_confirm") {
              const totalDays = level.total_days || 30;
              const ok = window.confirm(`🎉 ${totalDays}일 학습을 모두 완료했습니다! 다음 회독을 시작하시겠습니까?`);
              if (!ok) {
                throw new Error("회독 완료를 나중에 확인할 수 있습니다. 대시보드로 돌아가세요.");
              }
              
              const completeR = await fetch(`${API_BASE}/levels/day/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, difficulty_level: selectedLevel, day: totalDays }),
              });
              
              if (!completeR.ok) {
                const data = await completeR.json().catch(() => ({}));
                throw new Error(data.detail || `failed to complete day ${totalDays}`);
              }
              
              const completeData = await completeR.json();
              if (completeData.message) {
                alert(completeData.message);
              }
              
              // Navigate to dashboard instead of reload
              navigate("/dashboard");
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
        if (isMounted) setCard(data);
      } catch (e) {
        if (!isMounted) return;
        console.log("Load next card error:", e);
        
        // Don't retry if user explicitly cancelled
        if (e.message.includes("회독 완료를 나중에 확인할 수 있습니다") || 
            e.message.includes("오늘 학습을 시작하지 않았습니다")) {
          // User cancelled, don't retry
          setError(e.message);
          setLoading(false);
          return;
        }
        
        setCard(null);
        setError(null);
        setTimeout(() => {
          if (isMounted) loadNext();
        }, 1000);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
  }, [userId, selectedLevel, excludePerfect, ensureOpenDay, navigate]);

  useEffect(() => {
    if (user) {
      loadNext();
    }
  }, [user]); // loadNext 제거

  useEffect(() => {
    const cardDay = card?.vocab?.day;
    if (!cardDay) return;
    if (!dayProgress?.day) return;

    if (dayProgress.day === cardDay) return;

    setSyncingDayProgress(true);
    const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });
    fetch(`${API_BASE}/stats/current-day?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "failed to load current day progress");
        }
        return r.json();
      })
      .then((data) => {
        setDayProgress(data);
      })
      .catch((e) => {
        console.warn("Failed to sync day progress:", e);
      })
      .finally(() => {
        setSyncingDayProgress(false);
      });
  }, [card?.vocab?.day, dayProgress?.day, selectedLevel, userId]);

  // Cleanup on unmount to prevent background requests
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    
    return () => {
      isMounted = false;
      abortController.abort();  // Cancel all ongoing requests
      setLoading(false);
      setError(null);
    };
  }, []);

  // Global mounted state for confirm dialogs
  const [isComponentMounted, setIsComponentMounted] = useState(true);
  const [abortController, setAbortController] = useState(null);

  useEffect(() => {
    setIsComponentMounted(true);
    const controller = new AbortController();
    setAbortController(controller);
    
    return () => {
      setIsComponentMounted(false);
      controller.abort();  // Cancel all ongoing requests
    };
  }, []);

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
        // 다음 카드 로드 (/cards/today 내부에서 Day 완료/전환이 일어나므로 먼저 카드를 갱신)
        loadNext();
      })
      .catch((e) => {
        console.error("Study review error:", e);
        setError(null);
        loadNext();
      });
  };

  const handleBackToDashboard = () => {
    // Navigate to dashboard
    navigate("/dashboard");
  };

  const handleRemindPage = () => {
    navigate("/remind");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      {/* 1. 상단 헤더: 사용자 정보와 현재 상태 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 backdrop-blur-md px-4 sm:px-6 py-4 sm:py-6 border-b border-blue-500/20 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={handleBackToDashboard}
              className="p-3 bg-white/20 rounded-xl shadow-sm border border-white/30 backdrop-blur-sm hover:bg-white/30 transition-all"
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-white to-blue-50 flex items-center justify-center shadow-lg border-2 border-white/30 shrink-0">
                <User size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-white truncate">
                  {user.username || '학습자'} 님
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right max-w-[45vw] sm:max-w-none">
              <div className="text-base sm:text-lg font-bold text-white whitespace-nowrap">학습하기</div>
              <div className="text-xs sm:text-sm text-blue-100 font-medium truncate">
                {selectedLevel}점대 • {dayInfo?.open_day ? `Day ${dayInfo.open_day} 학습중` : '학습 준비중'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6">
        {/* 5. Day Topic */}
        {card?.vocab?.topic ? (
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-3xl p-6 mb-6 border border-orange-100">
            <div className="text-center">
              <div className="text-sm font-bold text-orange-800">
                Day {card.vocab.day} 주제: {card.vocab.topic}
              </div>
            </div>
          </div>
        ) : null}

        {/* 6. 메인 카드 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="text-gray-500">로딩 중...</div>
            </div>
          ) : !dayInfo?.open_day && dayInfo?.next_day ? (
            <div className="p-8 text-center">
              <div className="text-xl font-bold text-gray-900 mb-3">
                다음 학습 Day는 Day {dayInfo.next_day} 입니다.
              </div>
              <div className="text-gray-500 text-sm mb-6">
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
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg shadow-indigo-500/25"
              >
                Day {dayInfo.next_day} 학습 시작
              </button>
            </div>
          ) : card?.vocab ? (
            <div className="p-6">
              {/* Word Header */}
              <div className="flex justify-between items-start gap-4 mb-6">
                <div className="flex-1">
                  {card.is_review && (
                    <div className="inline-block bg-purple-100 text-purple-700 text-xs px-3 py-1 rounded-full font-medium mb-3">
                      이전 Day 복습
                    </div>
                  )}
                  <div className="text-3xl font-bold text-gray-900 leading-tight">
                    {card.vocab.word}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                  <div>Day {card.vocab.day ?? "-"}</div>
                  <div>{card.vocab.difficulty_level ?? "-"}</div>
                </div>
              </div>

              {/* Example Sentence */}
              {card.vocab.example_en ? (
                <div className="mb-6 p-4 bg-gray-50 rounded-2xl leading-relaxed text-gray-700">
                  <BoldMarkup text={card.vocab.example_en} />
                </div>
              ) : null}

              {/* Meaning Card */}
              <div
                onClick={() => setRevealMeaning(true)}
                className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                  revealMeaning 
                    ? "bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200" 
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
                title="클릭하여 뜻 보기"
              >
                {revealMeaning ? (
                  <div className="text-lg">
                    {card.vocab.meaning}
                    {card.vocab.example_kr ? (
                      <div className="mt-3 text-gray-600">
                        <BoldMarkup text={card.vocab.example_kr} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    뜻 보기 (클릭)
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => submit("again")}
                  disabled={loading}
                  className={`flex-1 py-4 rounded-2xl font-semibold transition-all ${
                    loading 
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98] shadow-md"
                  }`}
                >
                  몰라요
                </button>
                <button
                  onClick={() => submit("good")}
                  disabled={loading}
                  className={`flex-1 py-4 rounded-2xl font-semibold transition-all ${
                    loading 
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98] shadow-md"
                  }`}
                >
                  헷갈려요
                </button>
                <button
                  onClick={() => submit("perfect")}
                  disabled={loading}
                  className={`flex-1 py-4 rounded-2xl font-semibold transition-all ${
                    loading 
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-green-500 text-white hover:bg-green-600 active:scale-[0.98] shadow-md"
                  }`}
                >
                  완벽히 알아요
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-gray-500 mb-4">
                학습할 단어가 없습니다
              </div>
              <button
                onClick={handleBackToDashboard}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg shadow-indigo-500/25"
              >
                대시보드로 돌아가기
              </button>
            </div>
          )}
        </div>

              </div>

      {/* 7. Day Progress - 하단 고정 */}
      {dayProgress && dayProgress.day && !syncingDayProgress && card?.vocab?.day === dayProgress.day ? (
        <div className="fixed bottom-20 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-blue-100/50 px-6 py-2">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold text-gray-900">
              Day {dayProgress.day} 진행률
              {excludePerfect && (
                <span className="text-xs text-gray-500 ml-2">(완벽 단어 제외)</span>
              )}
            </div>
            <div className="text-sm font-semibold text-indigo-600">
              {excludePerfect 
                ? (() => {
                    const totalWords = dayProgress.total_words || 0;
                    const perfectWords = dayProgress.perfect_words || 0;
                    const studiedWords = (dayProgress.studied_words || dayProgress.progressed_words || 0) + (card ? 1 : 0);
                    const adjustedTotal = Math.max(1, totalWords - perfectWords);
                    const progress = Math.round((studiedWords / adjustedTotal) * 100);
                    return `${studiedWords}/${adjustedTotal} (${progress}%)`;
                  })()
                : (() => {
                    const totalWords = dayProgress.total_words || 0;
                    const studiedWords = (dayProgress.progressed_words || 0) + (card ? 1 : 0);
                    const progress = Math.round((studiedWords / totalWords) * 100);
                    return `${studiedWords}/${totalWords} (${progress}%)`;
                  })()
              }
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" 
              style={{
                width: excludePerfect 
                  ? (() => {
                      const totalWords = dayProgress.total_words || 0;
                      const perfectWords = dayProgress.perfect_words || 0;
                      const studiedWords = (dayProgress.studied_words || dayProgress.progressed_words || 0) + (card ? 1 : 0);
                      const adjustedTotal = Math.max(1, totalWords - perfectWords);
                      const progress = Math.round((studiedWords / adjustedTotal) * 100);
                      return `${progress}%`;
                    })()
                  : (() => {
                      const totalWords = dayProgress.total_words || 0;
                      const studiedWords = (dayProgress.progressed_words || 0) + (card ? 1 : 0);
                      const progress = Math.round((studiedWords / totalWords) * 100);
                      return `${progress}%`;
                    })()
              }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="text-xs text-gray-500">
              {dayProgress.progressed_words}개 완료
              {excludePerfect && (
                <span className="text-xs text-gray-400 ml-1">
                  (완벽 {dayProgress.perfect_words || 0}개 제외)
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              총 {excludePerfect 
                ? `${dayProgress.total_words - (dayProgress.perfect_words || 0)}개`
                : `${dayProgress.total_words}개`
              }
            </div>
          </div>
        </div>
      ) : null}

      {/* 8. iOS 스타일 하단 네비게이션 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-6 py-4">
        <div className="flex justify-around">
          <button 
            onClick={handleBackToDashboard}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <Home size={20} />
            <span className="text-xs font-medium">홈</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-indigo-600">
            <BookOpen size={20} />
            <span className="text-xs font-bold">학습</span>
          </button>
          <button 
            onClick={handleRemindPage}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <History size={20} />
            <span className="text-xs font-medium">리마인드</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400">
            <User size={20} />
            <span className="text-xs font-medium">프로필</span>
          </button>
        </div>
      </div>
    </div>
  );
}
