from __future__ import annotations

from datetime import date, timedelta

LEITNER_MAX_LEVEL = 5
LEITNER_INTERVAL_DAYS = {
    1: 1,
    2: 3,
    3: 7,
    4: 15,
    5: 30,
}


def clamp_level(level: int) -> int:
    if level < 1:
        return 1
    if level > LEITNER_MAX_LEVEL:
        return LEITNER_MAX_LEVEL
    return level


def next_review_date_for_level(level: int, today: date | None = None) -> date:
    today = today or date.today()
    level = clamp_level(level)
    days = LEITNER_INTERVAL_DAYS[level]
    return today + timedelta(days=days)
