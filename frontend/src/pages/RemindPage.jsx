import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, RefreshCw, ChevronRight, User, Bell, Award, ArrowLeft, Home, History } from "lucide-react";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = "/api"; // Force direct connection

export default function RemindPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
  const [revealExample, setRevealExample] = useState(false);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
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
  }, [searchParams, selectedLevel, setSelectedLevel]);

  const userId = useMemo(() => user?.id || 1, [user]);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    setRevealExample(false);

    if (session) {
      // 세션에서 다음 카드 가져오기
      fetch(`${API_BASE}/remind/session/${session.session_id}/next`)
        .then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            if (r.status === 404) {
              throw new Error(data.detail || "세션이 완료되었습니다.");
            }
            throw new Error(data.detail || "failed to load next card");
          }
          return r.json();
        })
        .then((newCard) => {
          setCard(newCard);
        })
        .catch((e) => {
          console.error("Load next card error:", e);
          setCard(null);
          setError(e.message);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // 새 세션 시작
      fetch(`${API_BASE}/remind/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          user_id: userId, 
          difficulty_level: selectedLevel 
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            if (r.status === 404) {
              throw new Error(data.detail || "리마인드할 단어가 없습니다. (최근 7일간 학습한 단어만 대상입니다)");
            }
            throw new Error(data.detail || "failed to start session");
          }
          return r.json();
        })
        .then((sessionData) => {
          setSession(sessionData);
          if (sessionData.total_words > 0) {
            // 첫 번째 카드 가져오기
            return fetch(`${API_BASE}/remind/session/${sessionData.session_id}/next`);
          } else {
            throw new Error("리마인드할 단어가 없습니다.");
          }
        })
        .then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.detail || "failed to load first card");
          }
          return r.json();
        })
        .then((firstCard) => {
          setCard(firstCard);
          setSession(prev => ({
            ...prev,
            current_index: firstCard.current_index,
            completed_count: firstCard.completed_count
          }));
        })
        .catch((e) => {
          console.error("Start session error:", e);
          setCard(null);
          if (e.message.includes("모든 단어를 완벽하게 마쳤습니다")) {
            setError("모든 단어를 완벽하게 마쳤습니다! 🎉\n나중에 다시 리마인드해주세요.");
          } else if (e.message.includes("리마인드할 단어가 없습니다")) {
            setError(e.message);
          } else {
            setError(e.message);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [userId, selectedLevel, session]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadNext();
    }
  }, [user]); // loadNext 제거

  const handleChangeLevel = (levelValue) => {
    setSelectedLevel(levelValue);
    localStorage.setItem("selectedDifficultyLevel", levelValue);
    setSearchParams({ difficulty_level: levelValue });
    setCard(null);
    setSession(null); // 세션 초기화
  };

  const submit = (grade) => {
    if (!card?.vocab?.id || !session) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/remind/session/${session.session_id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "remind review failed");
        }
        return r.json();
      })
      .then((result) => {
        // 성공적으로 제출 후에만 세션 업데이트
        if (result.next_index >= session.total_words) {
          // 세션 완료
          if (window.confirm("리마인드 세션이 완료되었습니다! 다시 리마인드 학습을 시작하시겠습니까?")) {
            // 세션 초기화하고 다시 시작
            setSession(null);
            setCard(null);
            setError(null);
            setLoading(true);
            
            // 새 세션 시작 시도
            fetch(`${API_BASE}/remind/session/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                user_id: userId, 
                difficulty_level: selectedLevel 
              }),
            })
              .then(async (r) => {
                if (!r.ok) {
                  const data = await r.json().catch(() => ({}));
                  if (r.status === 404) {
                    // 단어가 없는 경우
                    setCard(null);
                    if (data.detail.includes("모든 단어를 완벽하게 마쳤습니다")) {
                      setError("모든 단어를 완벽하게 마쳤습니다! 🎉\n나중에 다시 리마인드해주세요.");
                    } else {
                      setError(data.detail || "리마인드할 단어가 없습니다.");
                    }
                  } else {
                    throw new Error(data.detail || "failed to start session");
                  }
                } else {
                  return r.json();
                }
              })
              .then((sessionData) => {
                if (sessionData) {
                  setSession(sessionData);
                  // 첫 번째 카드 가져오기
                  return fetch(`${API_BASE}/remind/session/${sessionData.session_id}/next`);
                }
              })
              .then(async (r) => {
                if (r && !r.ok) {
                  const data = await r.json().catch(() => ({}));
                  throw new Error(data.detail || "failed to load first card");
                }
                return r ? r.json() : null;
              })
              .then((firstCard) => {
                if (firstCard) {
                  setCard(firstCard);
                  setSession(prev => ({
                    ...prev,
                    current_index: firstCard.current_index,
                    completed_count: firstCard.completed_count
                  }));
                }
              })
              .catch((e) => {
                console.error("Restart session error:", e);
                setCard(null);
                setError(e.message);
              })
              .finally(() => {
                setLoading(false);
              });
          } else {
            // 대시보드로 이동
            handleBackToDashboard();
          }
        } else {
          // 다음 카드 로드
          fetch(`${API_BASE}/remind/session/${session.session_id}/next`)
            .then(async (r) => {
              if (!r.ok) {
                const data = await r.json().catch(() => ({}));
                if (r.status === 404) {
                  throw new Error(data.detail || "세션이 완료되었습니다.");
                }
                throw new Error(data.detail || "failed to load next card");
              }
              return r.json();
            })
            .then((newCard) => {
              setCard(newCard);
              // 세션 정보 업데이트
              setSession(prev => ({
                ...prev,
                current_index: newCard.current_index,
                completed_count: newCard.completed_count
              }));
            })
            .catch((e) => {
              console.error("Load next card error:", e);
              setCard(null);
              setError(e.message);
            })
            .finally(() => {
              setLoading(false);
            });
        }
      })
      .catch((e) => {
        console.error("Remind review error:", e);
        setError(e.message);
        setCard(null);
      })
      .finally(() => setLoading(false));
  };

  const handleBackToDashboard = () => {
    localStorage.setItem('dashboard_refresh', Date.now().toString());
    navigate("/dashboard");
  };

  const handleStudyPage = () => {
    navigate("/study");
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
      <div className="sticky top-0 z-50 bg-gradient-to-r from-orange-600 to-red-600 backdrop-blur-md px-4 sm:px-6 py-4 sm:py-6 border-b border-orange-500/20 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={handleBackToDashboard}
              className="p-3 bg-white/20 rounded-xl shadow-sm border border-white/30 backdrop-blur-sm hover:bg-white/30 transition-all"
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="min-w-0">
              <div className="text-base sm:text-xl font-bold text-white truncate">
                {user.username || '학습자'} 님
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right max-w-[45vw] sm:max-w-none">
              <div className="text-base sm:text-lg font-bold text-white whitespace-nowrap">리마인드</div>
              <div className="text-xs sm:text-sm text-orange-100 font-medium truncate">
                {selectedLevel}점대 • {session ? `${session.completed_count + 1}/${session.total_words} 진행중` : '복습 준비중'}
              </div>
            </div>
            <div className="h-10 sm:h-12 w-auto flex items-center justify-center shrink-0">
              <img src="/nuni_logo.png" alt="누니보카학습" className="h-full w-auto object-contain" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6">
        {/* 4. Day Topic */}
        {card?.vocab?.topic ? (
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-3xl p-6 mb-6 border border-orange-100">
            <div className="text-center">
              <div className="text-sm font-bold text-orange-800">
                Day {card.vocab.day} 주제: {card.vocab.topic}
              </div>
            </div>
          </div>
        ) : null}

        {/* 5. 메인 카드 */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && !card ? (
            <div className="p-8 text-center">
              <div className="text-gray-500">로딩 중...</div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-4">{error}</div>
              {!error.includes("리마인드할 단어가 없습니다") && !error.includes("모든 단어를 완벽하게 마쳤습니다") && !error.includes("나중에 다시 리마인드해주세요") && (
                <button
                  onClick={() => {
                    setError(null);
                    loadNext();
                  }}
                  className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-semibold shadow-md"
                >
                  다시 시도
                </button>
              )}
              {(error.includes("리마인드할 단어가 없습니다") || error.includes("모든 단어를 완벽하게 마쳤습니다") || error.includes("나중에 다시 리마인드해주세요")) && (
                <button
                  onClick={handleBackToDashboard}
                  className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg shadow-orange-500/25"
                >
                  대시보드로 돌아가기
                </button>
              )}
            </div>
          ) : !card && !error ? (
            <div className="p-8 text-center">
              <div className="text-xl font-bold text-gray-900 mb-3">
                리마인드할 단어가 없습니다.
              </div>
              <div className="text-gray-500 text-sm mb-6">
                최근 7일간 학습한 단어만 대상입니다.
              </div>
              <button
                onClick={handleBackToDashboard}
                className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-4 rounded-2xl font-semibold shadow-lg shadow-orange-500/25"
              >
                대시보드로 돌아가기
              </button>
            </div>
          ) : card?.vocab ? (
            <div className="p-6">
              {/* Word Header */}
              <div className="flex justify-between items-start gap-4 mb-6">
                <div className="flex-1">
                  <div className="text-3xl font-bold text-gray-900 leading-tight">
                    {card.vocab.word}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-xl">
                  <div>Day {card.vocab.day ?? "-"}</div>
                  <div>{card.vocab.difficulty_level ?? "-"}</div>
                </div>
              </div>

              {/* Pronunciation */}
              {card.vocab.pronunciation && (
                <div className="mb-6 text-center text-gray-500 italic">
                  [{card.vocab.pronunciation}]
                </div>
              )}

              {/* Example Sentence (toggleable) */}
              {card.vocab.example_en ? (
                <div
                  onClick={() => setRevealExample(true)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 mb-6 ${
                    revealExample 
                      ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200" 
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                  title="클릭하여 예문 보기"
                >
                  {revealExample ? (
                    <div className="leading-relaxed text-gray-700 italic">
                      <BoldMarkup text={card.vocab.example_en} />
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-4">
                      예문 보기 (클릭)
                    </div>
                  )}
                </div>
              ) : null}

              {/* Meaning Card */}
              <div
                onClick={() => setRevealMeaning(true)}
                className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                  revealMeaning 
                    ? "bg-gradient-to-br from-orange-50 to-red-50 border-orange-200" 
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

              {/* Loading overlay */}
              {loading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-3xl">
                  <div className="text-gray-500">처리 중...</div>
                </div>
              )}
            </div>
          ) : null}
        </div>

              </div>

      {/* 7. Remind Progress - 하단 고정 */}
      {session && (
        <div className="fixed bottom-20 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-orange-100/50 px-6 py-2">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold text-gray-900">
              리마인드 진행률
            </div>
            <div className="text-sm font-semibold text-orange-600">
              {session.completed_count + 1}/{session.total_words} ({Math.round(((session.completed_count + 1) / session.total_words) * 100)}%)
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500" 
              style={{ width: `${Math.round(((session.completed_count + 1) / session.total_words) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="text-xs text-gray-500">
              {session.completed_count}개 완료
            </div>
            <div className="text-xs text-gray-500">
              총 {session.total_words}개 단어
            </div>
          </div>
        </div>
      )}

      {/* 8. 하단 네비게이션 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-6 py-4">
        <div className="flex justify-around">
          <button 
            onClick={handleBackToDashboard}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <Home size={20} />
            <span className="text-xs font-medium">홈</span>
          </button>
          <button 
            onClick={handleStudyPage}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <BookOpen size={20} />
            <span className="text-xs font-medium">학습</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-orange-600">
            <RefreshCw size={20} />
            <span className="text-xs font-bold">리마인드</span>
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
