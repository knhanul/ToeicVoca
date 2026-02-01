import { useCallback, useEffect, useMemo, useState } from "react";
import BoldMarkup from "./components/BoldMarkup.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "/voca/api";

const DEFAULT_USER_ID = 1;

export default function App() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealMeaning, setRevealMeaning] = useState(false);

  const userId = useMemo(() => DEFAULT_USER_ID, []);

  const loadNext = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevealMeaning(false);

    fetch(`${API_BASE}/cards/next?user_id=${userId}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "no cards");
        }
        return r.json();
      })
      .then(setCard)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

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

  return (
    <div
      style={{
        fontFamily: "system-ui",
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>TOEIC VOCA</h1>
      <div style={{ color: "#666", marginBottom: 16 }}>
        Flashcard (Active Recall) + Leitner Scheduling
      </div>

      {error ? (
        <div style={{ background: "#fee", border: "1px solid #fbb", padding: 12 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 20,
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          marginTop: 16,
        }}
      >
        {loading ? (
          <div>loading...</div>
        ) : card?.vocab ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{card.vocab.word}</div>
              <div style={{ textAlign: "right", color: "#666" }}>
                <div>Difficulty: {card.vocab.difficulty_level ?? "-"}</div>
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
              }}
              title="Click to reveal meaning"
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
                style={{ flex: 1, padding: "10px 12px" }}
                disabled={loading}
              >
                몰라요 (Again)
              </button>
              <button
                onClick={() => submit("good")}
                style={{ flex: 1, padding: "10px 12px" }}
                disabled={loading}
              >
                애매해요 (Good)
              </button>
              <button
                onClick={() => submit("perfect")}
                style={{ flex: 1, padding: "10px 12px" }}
                disabled={loading}
              >
                알아요 (Perfect)
              </button>
            </div>
          </>
        ) : (
          <div>no card</div>
        )}
      </div>
    </div>
  );
}
