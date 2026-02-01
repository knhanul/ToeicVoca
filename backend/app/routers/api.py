from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..leitner import LEITNER_MAX_LEVEL, next_review_date_for_level
from ..models import StudyLog, User, UserProgress, Vocab
from ..schemas import CardOut, ReviewIn, ReviewOut, VocabOut

api_router = APIRouter()


@api_router.get("/health")
def health():
    return {"status": "ok"}


@api_router.get("/cards/next", response_model=CardOut)
def get_next_card(
    user_id: int = Query(...),
    difficulty_level: str | None = Query(None),
    day: int | None = Query(None),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    today = date.today()

    # 1) Review first (due cards)
    due_stmt = (
        select(UserProgress, Vocab)
        .join(Vocab, UserProgress.vocab_id == Vocab.id)
        .where(
            and_(
                UserProgress.user_id == user_id,
                UserProgress.is_mastered.is_(False),
                UserProgress.next_review_date.is_not(None),
                UserProgress.next_review_date <= today,
            )
        )
        .order_by(UserProgress.next_review_date.asc(), UserProgress.id.asc())
        .limit(1)
    )
    due_row = db.execute(due_stmt).first()
    if due_row:
        progress, vocab = due_row
        return CardOut(
            vocab=VocabOut.model_validate(vocab),
            leitner_level=progress.leitner_level,
            next_review_date=progress.next_review_date,
            is_mastered=progress.is_mastered,
        )

    # 2) New learning card by filter (difficulty/day)
    vocab_stmt = select(Vocab)
    if difficulty_level is not None:
        vocab_stmt = vocab_stmt.where(Vocab.difficulty_level == difficulty_level)
    if day is not None:
        vocab_stmt = vocab_stmt.where(Vocab.day == day)

    # Exclude already progressed vocab
    vocab_stmt = vocab_stmt.where(
        ~Vocab.id.in_(
            select(UserProgress.vocab_id).where(UserProgress.user_id == user_id)
        )
    )

    vocab_stmt = vocab_stmt.order_by(Vocab.id.asc()).limit(1)
    vocab = db.execute(vocab_stmt).scalar_one_or_none()
    if vocab is None:
        raise HTTPException(status_code=404, detail="no cards")

    return CardOut(vocab=VocabOut.model_validate(vocab))


@api_router.post("/review", response_model=ReviewOut)
def submit_review(payload: ReviewIn, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    vocab = db.get(Vocab, payload.vocab_id)
    if vocab is None:
        raise HTTPException(status_code=404, detail="vocab not found")

    today = date.today()
    now = datetime.utcnow()

    progress_stmt = select(UserProgress).where(
        and_(UserProgress.user_id == payload.user_id, UserProgress.vocab_id == payload.vocab_id)
    )
    progress = db.execute(progress_stmt).scalar_one_or_none()
    if progress is None:
        progress = UserProgress(user_id=payload.user_id, vocab_id=payload.vocab_id)
        db.add(progress)
        db.flush()

    # Update Leitner scheduling
    current_level = int(progress.leitner_level or 1)

    if payload.grade == "again":
        new_level = 1
        next_date = today
        progress.correct_streak = 0
        progress.wrong_count = int(progress.wrong_count or 0) + 1
    elif payload.grade == "good":
        new_level = min(current_level + 1, LEITNER_MAX_LEVEL)
        next_date = next_review_date_for_level(new_level, today=today)
        progress.correct_streak = int(progress.correct_streak or 0) + 1
    else:  # perfect
        new_level = min(current_level + 1, LEITNER_MAX_LEVEL)
        next_date = next_review_date_for_level(new_level, today=today)
        progress.correct_streak = int(progress.correct_streak or 0) + 1

    progress.leitner_level = new_level
    progress.next_review_date = next_date
    progress.last_reviewed_at = now
    progress.updated_at = now
    progress.is_mastered = new_level >= LEITNER_MAX_LEVEL

    db.add(
        StudyLog(
            user_id=payload.user_id,
            vocab_id=payload.vocab_id,
            result=payload.grade,
            studied_at=now,
        )
    )

    db.commit()

    return ReviewOut(
        user_id=payload.user_id,
        vocab_id=payload.vocab_id,
        grade=payload.grade,
        leitner_level=progress.leitner_level,
        next_review_date=progress.next_review_date,
        is_mastered=progress.is_mastered,
        studied_at=now,
    )
