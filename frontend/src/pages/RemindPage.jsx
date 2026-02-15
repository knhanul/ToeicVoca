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

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);
    setCard(null);

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
      .then(setCard)
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
          <h1 style={{ margin: 0, color: "#333" }}>리마인드 학습</h1>
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
            <h2 style={{ margin: 0, color: "#333" }}>리마인드 학습</h2>
            <div style={{ color: "#666", fontSize: 14 }}>
              최근 7일간 학습한 단어 복습
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
            ) : !card ? (
              <div style={{ textAlign: "center", padding: 28 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#333" }}>
                  리마인드할 단어가 없습니다.
                </div>
                <div style={{ color: "#666", marginTop: 8, fontSize: 14 }}>
                  최근 7일간 학습한 단어만 대상입니다.
                </div>
                <button
                  onClick={handleBackToDashboard}
                  style={{
                    marginTop: 16,
                    padding: "12px 20px",
                    background: "#667eea",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  대시보드로 돌아가기
                </button>
              </div>
            ) : (
              <div>
                {/* Day Topic 크게 표시 */}
                {card.vocab.topic ? (
                  <div style={{
                    background: "#fff8e1",
                    border: "1px solid #ffecb3",
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#b8860b",
                    textAlign: "center"
                  }}>
                    Day {card.vocab.day} 주제: {card.vocab.topic}
                  </div>
                ) : null}

                {/* Word */}
                <div style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: 16,
                  textAlign: "center"
                }}>
                  {card.vocab.word}
                </div>

                {/* Meaning */}
                <div style={{
                  fontSize: 18,
                  color: "#555",
                  marginBottom: 20,
                  textAlign: "center"
                }}>
                  {revealMeaning ? (
                    <BoldMarkup>{card.vocab.meaning}</BoldMarkup>
                  ) : (
                    <button
                      onClick={() => setRevealMeaning(true)}
                      style={{
                        padding: "10px 20px",
                        background: "#667eea",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      의미 보기
                    </button>
                  )}
                </div>

                {/* Example */}
                {revealMeaning && (card.vocab.example_en || card.vocab.example_kr) ? (
                  <div style={{
                    background: "#f7fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20,
                  }}>
                    {card.vocab.example_en ? (
                      <div style={{ marginBottom: 8, fontStyle: "italic", color: "#333" }}>
                        <BoldMarkup text={card.vocab.example_en} />
                      </div>
                    ) : null}
                    {card.vocab.example_kr ? (
                      <div style={{ color: "#666" }}>
                        <BoldMarkup text={card.vocab.example_kr} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Buttons */}
                <div style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center"
                }}>
                  <button
                    onClick={() => submit("again")}
                    style={{
                      padding: "12px 20px",
                      background: "#e53e3e",
                      color: "white",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    모름 (Again)
                  </button>
                  <button
                    onClick={() => submit("good")}
                    style={{
                      padding: "12px 20px",
                      background: "#ed8936",
                      color: "white",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    애매 (Good)
                  </button>
                  <button
                    onClick={() => submit("perfect")}
                    style={{
                      padding: "12px 20px",
                      background: "#38a169",
                      color: "white",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    완벽함 (Perfect)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
