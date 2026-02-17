import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, RefreshCw, ChevronRight, User, Bell, Award, ArrowLeft, Home, History } from "lucide-react";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = "http://localhost:4000/api"; // Force direct connection

export default function RemindPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
  const [revealExample, setRevealExample] = useState(false);
  const [user, setUser] = useState(null);
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

    const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });

    fetch(`${API_BASE}/cards/remind?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (r.status === 404) {
            throw new Error(data.detail || "리마인드할 단어가 없습니다. (최근 7일간 학습한 단어만 대상입니다)");
          }
          throw new Error(data.detail || "failed to load remind card");
        }
        return r.json();
      })
      .then((newCard) => {
        setCard(newCard);
      })
      .catch((e) => {
        console.error("Load remind card error:", e);
        setCard(null);
        setError(e.message);
        if (!e.message.includes("리마인드할 단어가 없습니다")) {
          setTimeout(() => {
            loadNext();
          }, 1000);
        }
      })
      .finally(() => setLoading(false));
  }, [userId, selectedLevel]);

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
  };

  const submit = (grade) => {
    if (!card?.vocab?.id) return;

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/review/remind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, vocab_id: card.vocab.id, grade }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "remind review failed");
        }
        return r.json();
      })
      .then(() => {
        loadNext();
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
      {/* 1. 상단 헤더: 사용자 정보와 알림 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToDashboard}
            className="p-2 bg-white rounded-xl shadow-sm border border-gray-100"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <RefreshCw size={18} className="text-white" />
            </div>
            <div>
              <div className="text-xs text-gray-500">복습 시간!</div>
              <div className="text-lg font-bold text-gray-900">{user.username || '학습자'} 님</div>
            </div>
          </div>
        </div>
        <button className="p-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <Bell size={20} className="text-gray-700" />
        </button>
      </div>

      <div className="px-6 mt-6">
        {/* 2. 메인 액션 섹션: 학습하기 & 리마인드 (가장 크게 강조) */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={handleStudyPage}
            className="flex-1 bg-white p-6 rounded-3xl shadow-md border border-gray-100"
          >
            <BookOpen size={32} className="text-indigo-500" />
            <div className="mt-4">
              <div className="text-xl font-bold text-gray-900">학습하기</div>
              <div className="text-sm text-gray-500 mt-1">새로운 단어</div>
            </div>
          </button>

          <button 
            onClick={() => {/* 현재 페이지 */}}
            className="flex-1 bg-gradient-to-br from-orange-500 to-red-600 p-6 rounded-3xl shadow-lg shadow-orange-500/25 text-white"
          >
            <RefreshCw size={32} />
            <div className="mt-4">
              <div className="text-xl font-bold">리마인드</div>
              <div className="text-sm text-orange-100 mt-1">복습하기</div>
            </div>
          </button>
        </div>

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
              {!error.includes("리마인드할 단어가 없습니다") && (
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
              {error.includes("리마인드할 단어가 없습니다") && (
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
                  애매해요
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
                  알아요
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

      {/* 7. iOS 스타일 하단 네비게이션 바 */}
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
