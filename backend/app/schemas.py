from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class VocabOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    difficulty_level: str | None
    day: int | None
    topic: str | None
    word: str
    meaning: str
    example_en: str | None
    example_kr: str | None


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vocab: VocabOut
    leitner_level: int | None = None
    next_review_date: date | None = None
    is_mastered: bool | None = None


ReviewGrade = Literal["perfect", "good", "again"]


class ReviewIn(BaseModel):
    user_id: int
    vocab_id: int
    grade: ReviewGrade


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    vocab_id: int
    grade: ReviewGrade

    leitner_level: int
    next_review_date: date
    is_mastered: bool

    studied_at: datetime
