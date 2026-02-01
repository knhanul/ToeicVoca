function parseBold(text) {
  if (!text) return [];

  const parts = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const end = re.lastIndex;

    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start), key: key++ });
    }

    parts.push({ type: "bold", value: match[1], key: key++ });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex), key: key++ });
  }

  return parts;
}

export default function BoldMarkup({ text }) {
  const parts = parseBold(text);
  return (
    <>
      {parts.map((p) =>
        p.type === "bold" ? (
          <strong key={p.key}>{p.value}</strong>
        ) : (
          <span key={p.key}>{p.value}</span>
        )
      )}
    </>
  );
}
