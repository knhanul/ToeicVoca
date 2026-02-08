from __future__ import annotations

import csv
import sys
from pathlib import Path

from sqlalchemy import text

from app.db import engine


def _digits_only(value: str | None) -> str | None:
    if value is None:
        return None
    s = "".join(ch for ch in value if ch.isdigit())
    return s or None


def _to_int_str(value: str | None) -> str | None:
    if value is None:
        return None
    digits = _digits_only(value)
    return digits


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
                    "difficulty_level": _digits_only(_pick(row, "Level")),
                    "day": _to_int_str(_pick(row, "Day")),
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

    insert_vocab_stmt = text(
        """
        INSERT INTO vocab (
            difficulty_level,
            day,
            topic,
            word,
            meaning
        ) VALUES (
            :difficulty_level,
            CAST(:day AS INTEGER),
            :topic,
            :word,
            :meaning
        )
        RETURNING id
        """
    )

    insert_example_stmt = text(
        """
        INSERT INTO vocab_examples (
            vocab_id,
            example_en,
            example_kr
        ) VALUES (
            :vocab_id,
            :example_en,
            :example_kr
        )
        """
    )

    with engine.begin() as conn:
        inserted = 0
        examples_inserted = 0
        for r in rows:
            vocab_id = conn.execute(insert_vocab_stmt, r).scalar_one()
            inserted += 1

            if r.get("example_en") or r.get("example_kr"):
                conn.execute(
                    insert_example_stmt,
                    {
                        "vocab_id": vocab_id,
                        "example_en": r.get("example_en"),
                        "example_kr": r.get("example_kr"),
                    },
                )
                examples_inserted += 1

    print(f"Inserted {inserted} rows into vocab")
    print(f"Inserted {examples_inserted} rows into vocab_examples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
