import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "/hackersvoca/api";

export default function RemindPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
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
  }, [searchParams, selectedLevel]);

  const userId = useMemo(() => user?.id || 1, [user]);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    // setCard(null)을 여기서 바로 호출하지 않음 (깜빡임 방지)

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
        // 에러 발생 시에만 카드를 null로 설정
        setCard(null);
        setError(e.message);
        // 404 에러(리마인드할 단어 없음)는 재시도하지 않음
        if (!e.message.includes("리마인드할 단어가 없습니다")) {
          // 다른 에러만 1초 후 다시 시도
          setTimeout(() => {
            loadNext();
          }, 1000);
        }
      })
      .finally(() => setLoading(false));
  }, [userId, selectedLevel]);

  useEffect(() => {
    if (user) {
      // 초기 로드 시에만 카드를 null로 설정하지 않고 로딩 상태만 설정
      setLoading(true);
      loadNext();
    }
  }, [user]); // loadNext 의존성 제거

  const handleChangeLevel = (levelValue) => {
    setSelectedLevel(levelValue);
    localStorage.setItem("selectedDifficultyLevel", levelValue);
    setSearchParams({ difficulty_level: levelValue });
    // 레벨 변경 시에만 카드 초기화
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
        // 성공 시 다음 카드 로드
        loadNext();
      })
      .catch((e) => {
        console.error("Remind review error:", e);
        // 에러 발생 시 에러 메시지만 설정
        setError(e.message);
        setCard(null);
        // 제출 에러는 자동 재시도하지 않음 (사용자가 직접 새로고침하도록)
      })
      .finally(() => setLoading(false));
  };

  const handleBackToDashboard = () => {
    // 대시보드 데이터 새로고침을 위해 localStorage에 타임스탬프 저장
    localStorage.setItem('dashboard_refresh', Date.now().toString());
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
          <h1 className="text-lg font-bold text-gray-900">리마인드 학습</h1>
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
            {user.username}님
          </div>
        </div>
      </header>

      <div className="px-5 mt-4 max-w-md mx-auto">
        <div className="bg-white rounded-[24px] p-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05),0_8px_10px_-6px_rgba(0,0,0,0.05)] border border-gray-100/50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">리마인드 학습</h2>
            <div className="text-sm text-gray-500">
              최근 7일간 학습한 단어 복습
            </div>
          </div>

          {/* Error Display */}
          {error ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6">
              <div className="text-red-700 text-sm mb-3">{error}</div>
              {!error.includes("리마인드할 단어가 없습니다") && (
                <button
                  onClick={() => {
                    setError(null);
                    loadNext();
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  다시 시도
                </button>
              )}
            </div>
          ) : null}

          {/* Main Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] relative">
            {loading && !card ? (
              <div className="text-center py-10">
                <div className="text-gray-500">로딩 중...</div>
              </div>
            ) : !card ? (
              <div className="text-center py-8">
                <div className="text-lg font-bold text-gray-900 mb-2">
                  리마인드할 단어가 없습니다.
                </div>
                <div className="text-gray-500 text-sm mb-4">
                  최근 7일간 학습한 단어만 대상입니다.
                </div>
                <button
                  onClick={handleBackToDashboard}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  대시보드로 돌아가기
                </button>
              </div>
            ) : (
              <div>
                {/* Loading overlay */}
                {loading && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-xl">
                    <div className="text-gray-500">처리 중...</div>
                  </div>
                )}
                {/* Day Topic */}
                {card.vocab.topic ? (
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6">
                    <div className="text-center">
                      <div className="text-sm font-bold text-orange-800">
                        Day {card.vocab.day} 주제: {card.vocab.topic}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Word */}
                <div className="text-3xl font-bold text-gray-900 text-center mb-6">
                  {card.vocab.word}
                </div>

                {/* Meaning */}
                <div className="text-lg text-gray-700 text-center mb-5">
                  {revealMeaning ? (
                    <BoldMarkup>{card.vocab.meaning}</BoldMarkup>
                  ) : (
                    <button
                      onClick={() => setRevealMeaning(true)}
                      className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                    >
                      의미 보기
                    </button>
                  )}
                </div>

                {/* Example */}
                {revealMeaning && (card.vocab.example_en || card.vocab.example_kr) ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                    {card.vocab.example_en ? (
                      <div className="mb-2 italic text-gray-800">
                        <BoldMarkup text={card.vocab.example_en} />
                      </div>
                    ) : null}
                    {card.vocab.example_kr ? (
                      <div className="text-gray-600">
                        <BoldMarkup text={card.vocab.example_kr} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => submit("again")}
                    disabled={loading}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]"
                    }`}
                  >
                    모름 (Again)
                  </button>
                  <button
                    onClick={() => submit("good")}
                    disabled={loading}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98]"
                    }`}
                  >
                    애매 (Good)
                  </button>
                  <button
                    onClick={() => submit("perfect")}
                    disabled={loading}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      loading 
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-green-500 text-white hover:bg-green-600 active:scale-[0.98]"
                    }`}
                  >
                    완벽함 (Perfect)
                  </button>
                </div>
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
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">menu_book</span>
          <span className="text-[10px] font-medium">학습</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-blue-600">
          <span className="material-symbols-outlined">history</span>
          <span className="text-[10px] font-bold">리마인드</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <span className="material-symbols-outlined">person</span>
          <span className="text-[10px] font-medium">프로필</span>
        </button>
      </nav>
    </div>
  );
}
