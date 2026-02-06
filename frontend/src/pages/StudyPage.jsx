import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BoldMarkup from "../components/BoldMarkup.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "/voca/api";

export default function StudyPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);
  const [user, setUser] = useState(null);
  const [dayInfo, setDayInfo] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const levels = useMemo(
    () => [
      { value: "600", label: "600점대" },
      { value: "800", label: "800점대" },
      { value: "900", label: "900점대" },
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
      return { ...level, open_day: level.open_day };
    }

    if (!level.next_day) {
      throw new Error("30일 학습이 모두 완료되었습니다. (회독 완료 확인이 필요합니다)");
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
    return { ...refreshed, open_day: opened.day };
  }, [fetchLevelStatus, selectedLevel, userId]);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    setCard(null);

    (async () => {
      const level = await ensureOpenDay();
      const qs = new URLSearchParams({ user_id: String(userId), difficulty_level: selectedLevel });

      const r = await fetch(`${API_BASE}/cards/today?${qs.toString()}`);
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (r.status === 404) {
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
        setCard(null);
        setError(e.message);
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
      .then(() => loadNext())
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  if (!user) {
    return <div>로딩 중...</div>;
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
          <button
            onClick={handleBackToDashboard}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#667eea"
            }}
          >
            ←
          </button>
          <h1 style={{ margin: 0, color: "#333" }}>학습하기</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {levels.map((l) => (
              <button
                key={l.value}
                onClick={() => handleChangeLevel(l.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: selectedLevel === l.value ? "2px solid #667eea" : "1px solid #ddd",
                  background: selectedLevel === l.value ? "#eef2ff" : "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "#333",
                  fontSize: 12,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div style={{ color: "#666" }}>
            {dayInfo?.open_day ? `Day ${dayInfo.open_day}` : dayInfo?.next_day ? `Next Day ${dayInfo.next_day}` : ""}{" "}
            {user.username}님
          </div>
        </div>
      </header>

      <div style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto"
      }}>
        <div style={{
          background: "white",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginBottom: 16
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: "#333" }}>TOEIC VOCA 학습</h2>
            <div style={{ color: "#666", fontSize: 14 }}>
              Flashcard + Leitner Scheduling
            </div>
          </div>

          {error ? (
            <div style={{ 
              background: "#fee", 
              border: "1px solid #fbb", 
              padding: 12, 
              borderRadius: 8,
              marginBottom: 16
            }}>
              {error}
            </div>
          ) : null}

          <div style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 20,
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
          }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}>로딩 중...</div>
            ) : card?.vocab ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{card.vocab.word}</div>
                  <div style={{ textAlign: "right", color: "#666" }}>
                    <div>난이도: {card.vocab.difficulty_level ?? "-"}</div>
                    <div>Day: {card.vocab.day ?? "-"}</div>
                    <div>Leitner: {card.leitner_level ?? "new"}</div>
                  </div>
                </div>

                {card.vocab.example_en ? (
                  <div style={{ marginTop: 14, lineHeight: 1.6 }}>
                    <BoldMarkup text={card.vocab.example_en} />
                  </div>
                ) : null}

                <div
                  onClick={() => setRevealMeaning(true)}
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 10,
                    border: "1px dashed #bbb",
                    cursor: "pointer",
                    background: revealMeaning ? "#f7fbff" : "#fafafa",
                    transition: "background-color 0.2s"
                  }}
                  title="클릭하여 뜻 보기"
                >
                  {revealMeaning ? (
                    <div style={{ fontSize: 18 }}>
                      {card.vocab.meaning}
                      {card.vocab.example_kr ? (
                        <div style={{ marginTop: 8, color: "#555" }}>
                          <BoldMarkup text={card.vocab.example_kr} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ color: "#666" }}>뜻 보기 (클릭)</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button
                    onClick={() => submit("again")}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "#e53e3e",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 500,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1
                    }}
                    disabled={loading}
                  >
                    몰라요 (Again)
                  </button>
                  <button
                    onClick={() => submit("good")}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "#ed8936",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 500,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1
                    }}
                    disabled={loading}
                  >
                    애매해요 (Good)
                  </button>
                  <button
                    onClick={() => submit("perfect")}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "#48bb78",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 500,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1
                    }}
                    disabled={loading}
                  >
                    알아요 (Perfect)
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 18, color: "#666", marginBottom: 16 }}>
                  학습할 단어가 없습니다
                </div>
                <button
                  onClick={handleBackToDashboard}
                  style={{
                    padding: "10px 20px",
                    background: "#667eea",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer"
                  }}
                >
                  대시보드로 돌아가기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
