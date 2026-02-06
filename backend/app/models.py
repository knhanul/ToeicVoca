from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    study_logs: Mapped[list["StudyLog"]] = relationship(back_populates="user")
    progress: Mapped[list["UserProgress"]] = relationship(back_populates="user")


class Vocab(Base):
    __tablename__ = "vocab"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    difficulty_level: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    day: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    topic: Mapped[str | None] = mapped_column(Text, nullable=True)

    word: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    meaning: Mapped[str] = mapped_column(Text, nullable=False)
    example_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_kr: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    study_logs: Mapped[list["StudyLog"]] = relationship(back_populates="vocab")
    progress: Mapped[list["UserProgress"]] = relationship(back_populates="vocab")


class StudyLog(Base):
    __tablename__ = "study_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    vocab_id: Mapped[int] = mapped_column(ForeignKey("vocab.id"), index=True, nullable=False)

    difficulty_level: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    cycle_no: Mapped[int] = mapped_column(Integer, default=1, index=True, nullable=False)

    result: Mapped[str] = mapped_column(String(20), nullable=False)
    studied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="study_logs")
    vocab: Mapped["Vocab"] = relationship(back_populates="study_logs")


class UserProgress(Base):
    __tablename__ = "user_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    vocab_id: Mapped[int] = mapped_column(ForeignKey("vocab.id"), index=True, nullable=False)

    cycle_no: Mapped[int] = mapped_column(Integer, default=1, index=True, nullable=False)

    leitner_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_review_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_mastered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    correct_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="progress")
    vocab: Mapped["Vocab"] = relationship(back_populates="progress")


class LevelCycle(Base):
    __tablename__ = "level_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    difficulty_level: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    cycle_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # active | completed_pending_confirm | completed_confirmed
    status: Mapped[str] = mapped_column(String(40), default="active", nullable=False)

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LevelDayProgress(Base):
    __tablename__ = "level_day_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    difficulty_level: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    cycle_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    day: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # locked | open | completed
    status: Mapped[str] = mapped_column(String(20), default="locked", nullable=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
