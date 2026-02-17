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
    example_en: str | None = None
    example_kr: str | None = None


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vocab: VocabOut
    leitner_level: int | None = None
    next_review_date: date | None = None
    is_mastered: bool | None = None
    is_review: bool = False  # 이전 Day 복습 단어 여부


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


class RemindReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    vocab_id: int
    grade: ReviewGrade

    # 리마인드는 Leitner 정보 없음
    studied_at: datetime


LevelValue = Literal["600", "800", "900"]


class LevelStatusOut(BaseModel):
    difficulty_level: LevelValue
    cycle_no: int
    cycle_status: str
    next_day: int | None
    open_day: int | None
    completed_days: int
    total_days: int = 30
    cycle_progress_pct: int
    remind_window_days: int = 7


class LevelsStatusOut(BaseModel):
    user_id: int
    levels: list[LevelStatusOut]


class OpenDayIn(BaseModel):
    user_id: int
    difficulty_level: LevelValue
    day: int


class OpenDayOut(BaseModel):
    user_id: int
    difficulty_level: LevelValue
    cycle_no: int
    day: int
    status: str
    message: str | None = None


class StartNextCycleIn(BaseModel):
    user_id: int
    difficulty_level: LevelValue


class StartNextCycleOut(BaseModel):
    user_id: int
    difficulty_level: LevelValue
    previous_cycle_no: int
    new_cycle_no: int
    message: str


class CompleteDayIn(BaseModel):
    user_id: int
    difficulty_level: LevelValue


class CompleteDayOut(BaseModel):
    user_id: int
    difficulty_level: LevelValue
    cycle_no: int
    day: int
    status: str
    cycle_status: str


class ConfirmCycleIn(BaseModel):
    user_id: int
    difficulty_level: LevelValue


class ConfirmCycleOut(BaseModel):
    user_id: int
    difficulty_level: LevelValue
    new_cycle_no: int


# Statistics

class DayWordCountsOut(BaseModel):
    day: int
    topic: str | None = None
    cycle_no: int
    unknown_count: int
    unsure_count: int
    perfect_count: int
    total_count: int


class RecentStudyOut(BaseModel):
    studied_at: datetime
    difficulty_level: str | None
    vocab_id: int | None = None
    day: int | None
    topic: str | None = None
    result: ReviewGrade
    word: str | None = None
    cycle_no: int | None = None


class LevelStatsOut(BaseModel):
    difficulty_level: LevelValue
    cycle_no: int
    completed_days: int
    total_days: int = 30
    day_progress_pct: int
    total_vocab: int
    perfect_vocab: int
    previous_cycle_perfect_vocab: int
    memorization_pct: int
    day_word_counts: list[DayWordCountsOut]
    recent_study: list[RecentStudyOut]


class LevelsStatsOut(BaseModel):
    user_id: int
    levels: list[LevelStatsOut]


class CurrentDayProgressOut(BaseModel):
    difficulty_level: LevelValue
    cycle_no: int
    day: int | None
    total_words: int
    progressed_words: int
    perfect_words: int
    progress_pct: int
