from __future__ import annotations

import csv
import sys
from pathlib import Path

from sqlalchemy import text

from app.db import engine


def _pick(row: dict[str, str], *keys: str) -> str | None:
    for k in keys:
        if k in row and row[k] != "":
            return row[k]
    return None


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python migrate_vocab_csv.py <path-to-csv>")
        return 2

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 2

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print("CSV has no header")
            return 2

        rows = []
        for row in reader:
            # CSV header -> DB column mapping
            # Level -> difficulty_level
            rows.append(
                {
                    "difficulty_level": _pick(row, "Level"),
                    "day": _pick(row, "Day"),
                    "topic": _pick(row, "Topic"),
                    "word": _pick(row, "Word"),
                    "meaning": _pick(row, "Meaning"),
                    "example_en": _pick(row, "Example"),
                    "example_kr": _pick(row, "Translation", "Example_K", "Example_kr"),
                }
            )

    # Basic validation
    rows = [r for r in rows if r.get("word") and r.get("meaning")]
    if not rows:
        print("No valid rows found (need at least Word and Meaning)")
        return 1

    stmt = text(
        """
        INSERT INTO vocab (
            difficulty_level,
            day,
            topic,
            word,
            meaning,
            example_en,
            example_kr
        ) VALUES (
            :difficulty_level,
            CAST(:day AS INTEGER),
            :topic,
            :word,
            :meaning,
            :example_en,
            :example_kr
        )
        """
    )

    with engine.begin() as conn:
        conn.execute(stmt, rows)

    print(f"Inserted {len(rows)} rows into vocab")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
