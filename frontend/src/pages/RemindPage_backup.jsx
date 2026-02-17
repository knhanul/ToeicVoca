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
  }, [user]);

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

  if (!user) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#F8F9FA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#F8F9FA",
      paddingBottom: "80px"
    }}>
      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(12px)",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleBackToDashboard}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#1E293B",
              padding: 4,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ←
          </button>
          <h1 style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#1E293B",
            margin: 0
          }}>
            리마인드 학습
          </h1>
        </div>
        <div style={{
          fontSize: 14,
          color: "#64748B",
          fontWeight: 500
        }}>
          {user.username}님
        </div>
      </header>

      {/* Level Selector (Pill Style) */}
      <div style={{
        display: "flex",
        padding: "0 20px",
        gap: 12,
        marginBottom: 20,
        overflowX: "auto"
      }}>
        {levels.map((l, i) => (
          <button
            key={l.value}
            onClick={() => handleChangeLevel(l.value)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: selectedLevel === l.value ? "#4F46E5" : "#FFFFFF",
              borderWidth: 1,
              borderColor: selectedLevel === l.value ? "#4F46E5" : "#E2E8F0",
              borderStyle: "solid",
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap"
            }}
          >
            <span style={{
              color: selectedLevel === l.value ? "#FFFFFF" : "#64748B",
              fontWeight: 600,
              fontSize: 13
            }}>
              {l.label}
            </span>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{
        padding: "0 24px",
        maxWidth: "428px",
        margin: "0 auto",
        width: "100%"
      }}>
        {/* Main Word Card */}
        <div style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 32,
          padding: 32,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
          minHeight: "400px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative"
        }}>
          {/* Loading overlay */}
          {loading && card && (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              borderRadius: 32
            }}>
              <div style={{ color: "#64748B" }}>처리 중...</div>
            </div>
          )}

          {/* Error Display */}
          {error ? (
            <div style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FEE2E2",
              borderRadius: 16,
              padding: 20,
              margin: "20px 0",
              width: "100%"
            }}>
              <div style={{ color: "#DC2626", fontSize: 14, marginBottom: 12 }}>{error}</div>
              {!error.includes("리마인드할 단어가 없습니다") && (
                <button
                  onClick={() => {
                    setError(null);
                    loadNext();
                  }}
                  style={{
                    backgroundColor: "#DC2626",
                    color: "white",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  다시 시도
                </button>
              )}
            </div>
          ) : null}

          {/* No Card Message */}
          {!loading && !card && !error ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#1E293B",
                marginBottom: 12
              }}>
                리마인드할 단어가 없습니다.
              </div>
              <div style={{
                fontSize: 14,
                color: "#64748B",
                marginBottom: 24
              }}>
                최근 7일간 학습한 단어만 대상입니다.
              </div>
              <button
                onClick={handleBackToDashboard}
                style={{
                  backgroundColor: "#4F46E5",
                  color: "white",
                  padding: "12px 24px",
                  borderRadius: 16,
                  fontSize: 16,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer"
                }}
              >
                대시보드로 돌아가기
              </button>
            </div>
          ) : null}

          {/* Word Card Content */}
          {card && !error ? (
            <>
              {/* Day Topic */}
              {card.vocab.topic ? (
                <div style={{
                  position: "absolute",
                  top: 24,
                  backgroundColor: "#EEF2FF",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 8
                }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#4F46E5"
                  }}>
                    Day {card.vocab.day} • {card.vocab.topic}
                  </span>
                </div>
              ) : null}

              {/* Word */}
              <div style={{
                fontSize: 40,
                fontWeight: 800,
                color: "#1E293B",
                textAlign: "center",
                marginBottom: 8
              }}>
                {card.vocab.word}
              </div>
              
              {/* Pronunciation */}
              {card.vocab.pronunciation && (
                <div style={{
                  fontSize: 16,
                  color: "#94A3B8",
                  marginBottom: 40,
                  textAlign: "center"
                }}>
                  [{card.vocab.pronunciation}]
                </div>
              )}

              {/* Meaning Section (Togglable) */}
              <div style={{
                width: "100%",
                marginTop: 40,
                minHeight: 120
              }}>
                {!revealMeaning ? (
                  <button
                    onClick={() => setRevealMeaning(true)}
                    style={{
                      backgroundColor: "#F1F5F9",
                      padding: 20,
                      borderRadius: 20,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      transition: "all 0.2s ease"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#E2E8F0";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "#F1F5F9";
                    }}
                  >
                    <span style={{ fontSize: 20, color: "#64748B" }}>👁️</span>
                    <span style={{ color: "#64748B", fontWeight: 600 }}>의미 보기</span>
                  </button>
                ) : (
                  <div style={{
                    backgroundColor: "#F8FAFC",
                    padding: 20,
                    borderRadius: 20,
                    borderLeft: "4px solid #4F46E5"
                  }}>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#1E293B",
                      marginBottom: 12
                    }}>
                      <BoldMarkup>{card.vocab.meaning}</BoldMarkup>
                    </div>
                    
                    {/* Example */}
                    {card.vocab.example_en || card.vocab.example_kr ? (
                      <>
                        {card.vocab.example_en ? (
                          <div style={{
                            fontSize: 14,
                            color: "#475569",
                            lineHeight: 1.5,
                            marginBottom: 8,
                            fontStyle: "italic"
                          }}>
                            <BoldMarkup text={card.vocab.example_en} />
                          </div>
                        ) : null}
                        {card.vocab.example_kr ? (
                          <div style={{
                            fontSize: 13,
                            color: "#94A3B8",
                            lineHeight: 1.5
                          }}>
                            <BoldMarkup text={card.vocab.example_kr} />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Action Buttons (Leitner) */}
      {card && !error && (
        <div style={{
          position: "fixed",
          bottom: 80,
          left: 20,
          right: 20,
          display: "flex",
          gap: 12,
          zIndex: 40
        }}>
          <button
            onClick={() => submit("again")}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#F3F4F6" : "#FFF1F2",
              padding: "20px 0",
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <span style={{ fontSize: 24, color: loading ? "#9CA3AF" : "#F43F5E" }}>❌</span>
            <span style={{ color: loading ? "#9CA3AF" : "#F43F5E", fontWeight: 700 }}>모름</span>
          </button>
          
          <button
            onClick={() => submit("good")}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#F3F4F6" : "#FFFBEB",
              padding: "20px 0",
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <span style={{ fontSize: 24, color: loading ? "#9CA3AF" : "#D97706" }}>🤔</span>
            <span style={{ color: loading ? "#9CA3AF" : "#D97706", fontWeight: 700 }}>애매</span>
          </button>
          
          <button
            onClick={() => submit("perfect")}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#F3F4F6" : "#ECFDF5",
              padding: "20px 0",
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <span style={{ fontSize: 24, color: loading ? "#9CA3AF" : "#10B981" }}>✅</span>
            <span style={{ color: loading ? "#9CA3AF" : "#10B981", fontWeight: 700 }}>완벽</span>
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 -0.5px 0 0 rgba(0, 0, 0, 0.1)",
        padding: "12px 24px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 50
      }}>
        <button 
          onClick={handleBackToDashboard}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12
          }}
        >
          <span style={{ fontSize: 20 }}>🏠</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>홈</span>
        </button>
        
        <button style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          color: "#94A3B8",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12
        }}>
          <span style={{ fontSize: 20 }}>📚</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>학습</span>
        </button>
        
        <button style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          color: "#4F46E5",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12
        }}>
          <span style={{ fontSize: 20 }}>🔄</span>
          <span style={{ fontSize: 10, fontWeight: 700 }}>리마인드</span>
        </button>
        
        <button style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          color: "#94A3B8",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12
        }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>프로필</span>
        </button>
      </nav>
    </div>
  );
}
