from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..leitner import LEITNER_MAX_LEVEL, next_review_date_for_level
from ..models import LevelCycle, LevelDayProgress, StudyLog, User, UserProgress, Vocab
from ..schemas import (
    CardOut,
    CompleteDayIn,
    CompleteDayOut,
    ConfirmCycleIn,
    ConfirmCycleOut,
    LevelsStatusOut,
    LevelStatusOut,
    OpenDayIn,
    OpenDayOut,
    ReviewIn,
    ReviewOut,
    VocabOut,
)

api_router = APIRouter()


def _get_or_create_active_cycle(db: Session, *, user_id: int, difficulty_level: str) -> LevelCycle:
    cycle = db.execute(
        select(LevelCycle)
        .where(
            and_(
                LevelCycle.user_id == user_id,
                LevelCycle.difficulty_level == difficulty_level,
                LevelCycle.status.in_(["active", "completed_pending_confirm"]),
            )
        )
        .order_by(LevelCycle.cycle_no.desc())
        .limit(1)
    ).scalar_one_or_none()

    if cycle is None:
        cycle = LevelCycle(user_id=user_id, difficulty_level=difficulty_level, cycle_no=1, status="active")
        db.add(cycle)
        db.flush()

    return cycle


def _ensure_day_rows(db: Session, *, user_id: int, difficulty_level: str, cycle_no: int) -> None:
    existing = db.execute(
        select(func.count(LevelDayProgress.id)).where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == cycle_no,
            )
        )
    ).scalar_one()

    if int(existing) >= 30:
        return

    rows = [
        LevelDayProgress(
            user_id=user_id,
            difficulty_level=difficulty_level,
            cycle_no=cycle_no,
            day=d,
            status="locked",
        )
        for d in range(1, 31)
    ]
    db.add_all(rows)
    db.flush()


def _get_open_day(db: Session, *, user_id: int, difficulty_level: str, cycle_no: int) -> LevelDayProgress | None:
    return db.execute(
        select(LevelDayProgress)
        .where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == cycle_no,
                LevelDayProgress.status == "open",
            )
        )
        .order_by(LevelDayProgress.day.asc())
        .limit(1)
    ).scalar_one_or_none()


def _get_next_day(db: Session, *, user_id: int, difficulty_level: str, cycle_no: int) -> LevelDayProgress | None:
    return db.execute(
        select(LevelDayProgress)
        .where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == cycle_no,
                LevelDayProgress.status == "locked",
            )
        )
        .order_by(LevelDayProgress.day.asc())
        .limit(1)
    ).scalar_one_or_none()


@api_router.get("/health")
def health():
    return {"status": "ok"}


@api_router.get("/levels/status", response_model=LevelsStatusOut)
def get_levels_status(user_id: int = Query(...), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    levels: list[LevelStatusOut] = []
    for level in ["600", "800", "900"]:
        cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=level)
        _ensure_day_rows(db, user_id=user_id, difficulty_level=level, cycle_no=cycle.cycle_no)

        completed_days = db.execute(
            select(func.count(LevelDayProgress.id)).where(
                and_(
                    LevelDayProgress.user_id == user_id,
                    LevelDayProgress.difficulty_level == level,
                    LevelDayProgress.cycle_no == cycle.cycle_no,
                    LevelDayProgress.status == "completed",
                )
            )
        ).scalar_one()

        open_day = _get_open_day(db, user_id=user_id, difficulty_level=level, cycle_no=cycle.cycle_no)
        next_day = _get_next_day(db, user_id=user_id, difficulty_level=level, cycle_no=cycle.cycle_no)

        pct = int((int(completed_days) / 30) * 100)
        levels.append(
            LevelStatusOut(
                difficulty_level=level,
                cycle_no=cycle.cycle_no,
                cycle_status=cycle.status,
                next_day=next_day.day if next_day else None,
                open_day=open_day.day if open_day else None,
                completed_days=int(completed_days),
                cycle_progress_pct=pct,
            )
        )

    db.commit()
    return LevelsStatusOut(user_id=user_id, levels=levels)


@api_router.post("/levels/day/open", response_model=OpenDayOut)
def open_day(payload: OpenDayIn, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    if payload.day < 1 or payload.day > 30:
        raise HTTPException(status_code=400, detail="day must be 1..30")

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no)

    if cycle.status != "active":
        raise HTTPException(status_code=400, detail="cycle is not active")

    existing_open = _get_open_day(
        db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no
    )
    if existing_open is not None and existing_open.day != payload.day:
        raise HTTPException(status_code=400, detail="another day is already open")

    row = db.execute(
        select(LevelDayProgress).where(
            and_(
                LevelDayProgress.user_id == payload.user_id,
                LevelDayProgress.difficulty_level == payload.difficulty_level,
                LevelDayProgress.cycle_no == cycle.cycle_no,
                LevelDayProgress.day == payload.day,
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="day row not found")

    if row.status == "completed":
        raise HTTPException(status_code=400, detail="day already completed")

    next_locked = _get_next_day(
        db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no
    )
    if next_locked is None or next_locked.day != payload.day:
        raise HTTPException(status_code=400, detail="day is not the next available day")

    row.status = "open"
    row.opened_at = datetime.utcnow()
    db.add(row)
    db.commit()

    return OpenDayOut(
        user_id=payload.user_id,
        difficulty_level=payload.difficulty_level,
        cycle_no=cycle.cycle_no,
        day=row.day,
        status=row.status,
    )


@api_router.get("/cards/today", response_model=CardOut)
def get_today_card(
    user_id: int = Query(...),
    difficulty_level: str = Query(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=difficulty_level)
    _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)

    open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
    if open_day is None:
        raise HTTPException(status_code=400, detail="today learning day is not open")

    today = date.today()

    # 1) due reviews in this level+day+cycle
    due_stmt = (
        select(UserProgress, Vocab)
        .join(Vocab, UserProgress.vocab_id == Vocab.id)
        .where(
            and_(
                UserProgress.user_id == user_id,
                UserProgress.cycle_no == cycle.cycle_no,
                UserProgress.is_mastered.is_(False),
                UserProgress.next_review_date.is_not(None),
                UserProgress.next_review_date <= today,
                Vocab.difficulty_level == difficulty_level,
                Vocab.day == open_day.day,
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

    # 2) new cards for this level+day (exclude progress for current cycle)
    vocab_stmt = (
        select(Vocab)
        .where(and_(Vocab.difficulty_level == difficulty_level, Vocab.day == open_day.day))
        .where(
            ~Vocab.id.in_(
                select(UserProgress.vocab_id).where(
                    and_(UserProgress.user_id == user_id, UserProgress.cycle_no == cycle.cycle_no)
                )
            )
        )
        .order_by(Vocab.id.asc())
        .limit(1)
    )
    vocab = db.execute(vocab_stmt).scalar_one_or_none()
    if vocab is None:
        raise HTTPException(status_code=404, detail="no cards")

    return CardOut(vocab=VocabOut.model_validate(vocab))


@api_router.get("/cards/remind", response_model=CardOut)
def get_remind_card(
    user_id: int = Query(...),
    difficulty_level: str = Query(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=difficulty_level)
    _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)

    now = datetime.utcnow()
    window_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = window_start - timedelta(days=7)

    # recent 7 days studied vocab ids for this level+cycle
    recent_vocab_ids_stmt = (
        select(StudyLog.vocab_id)
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.cycle_no == cycle.cycle_no,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.studied_at >= window_start,
            )
        )
        .group_by(StudyLog.vocab_id)
    )

    # Prefer non-mastered or wrong_count>0
    today = date.today()
    due_stmt = (
        select(UserProgress, Vocab)
        .join(Vocab, UserProgress.vocab_id == Vocab.id)
        .where(
            and_(
                UserProgress.user_id == user_id,
                UserProgress.cycle_no == cycle.cycle_no,
                Vocab.id.in_(recent_vocab_ids_stmt),
                Vocab.difficulty_level == difficulty_level,
                UserProgress.is_mastered.is_(False),
                or_(
                    UserProgress.next_review_date.is_(None),
                    UserProgress.next_review_date <= today,
                    UserProgress.wrong_count > 0,
                ),
            )
        )
        .order_by(UserProgress.wrong_count.desc(), UserProgress.next_review_date.asc().nullsfirst())
        .limit(1)
    )
    row = db.execute(due_stmt).first()
    if row:
        progress, vocab = row
        return CardOut(
            vocab=VocabOut.model_validate(vocab),
            leitner_level=progress.leitner_level,
            next_review_date=progress.next_review_date,
            is_mastered=progress.is_mastered,
        )

    raise HTTPException(status_code=404, detail="no remind cards")


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

    cycle_no = 1
    if difficulty_level is not None:
        cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=difficulty_level)
        _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
        cycle_no = cycle.cycle_no

    # 1) Review first (due cards)
    due_filters = [
        UserProgress.user_id == user_id,
        UserProgress.cycle_no == cycle_no,
        UserProgress.is_mastered.is_(False),
        UserProgress.next_review_date.is_not(None),
        UserProgress.next_review_date <= today,
    ]
    if difficulty_level is not None:
        due_filters.append(Vocab.difficulty_level == difficulty_level)
    if day is not None:
        due_filters.append(Vocab.day == day)

    due_stmt = (
        select(UserProgress, Vocab)
        .join(Vocab, UserProgress.vocab_id == Vocab.id)
        .where(and_(*due_filters))
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
            select(UserProgress.vocab_id).where(
                and_(UserProgress.user_id == user_id, UserProgress.cycle_no == cycle_no)
            )
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

    cycle_no = 1
    if vocab.difficulty_level is not None:
        cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=vocab.difficulty_level)
        _ensure_day_rows(
            db, user_id=payload.user_id, difficulty_level=vocab.difficulty_level, cycle_no=cycle.cycle_no
        )
        cycle_no = cycle.cycle_no

    progress_stmt = select(UserProgress).where(
        and_(
            UserProgress.user_id == payload.user_id,
            UserProgress.vocab_id == payload.vocab_id,
            UserProgress.cycle_no == cycle_no,
        )
    )
    progress = db.execute(progress_stmt).scalar_one_or_none()
    if progress is None:
        progress = UserProgress(user_id=payload.user_id, vocab_id=payload.vocab_id, cycle_no=cycle_no)
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
            difficulty_level=vocab.difficulty_level,
            cycle_no=cycle_no,
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


@api_router.post("/levels/day/complete", response_model=CompleteDayOut)
def complete_day(payload: CompleteDayIn, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no)

    open_day = _get_open_day(
        db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no
    )
    if open_day is None:
        raise HTTPException(status_code=400, detail="no open day")

    total_vocab = db.execute(
        select(func.count(Vocab.id)).where(
            and_(Vocab.difficulty_level == payload.difficulty_level, Vocab.day == open_day.day)
        )
    ).scalar_one()
    progressed_vocab = db.execute(
        select(func.count(UserProgress.id))
        .join(Vocab, UserProgress.vocab_id == Vocab.id)
        .where(
            and_(
                UserProgress.user_id == payload.user_id,
                UserProgress.cycle_no == cycle.cycle_no,
                Vocab.difficulty_level == payload.difficulty_level,
                Vocab.day == open_day.day,
            )
        )
    ).scalar_one()

    if int(progressed_vocab) < int(total_vocab):
        raise HTTPException(status_code=400, detail="day is not fully completed")

    open_day.status = "completed"
    open_day.completed_at = datetime.utcnow()
    db.add(open_day)

    cycle_status = cycle.status
    completed_days = db.execute(
        select(func.count(LevelDayProgress.id)).where(
            and_(
                LevelDayProgress.user_id == payload.user_id,
                LevelDayProgress.difficulty_level == payload.difficulty_level,
                LevelDayProgress.cycle_no == cycle.cycle_no,
                LevelDayProgress.status == "completed",
            )
        )
    ).scalar_one()

    if int(completed_days) >= 30 and cycle.status == "active":
        cycle.status = "completed_pending_confirm"
        cycle.completed_at = datetime.utcnow()
        cycle_status = cycle.status
        db.add(cycle)

    db.commit()
    return CompleteDayOut(
        user_id=payload.user_id,
        difficulty_level=payload.difficulty_level,
        cycle_no=cycle.cycle_no,
        day=open_day.day,
        status=open_day.status,
        cycle_status=cycle_status,
    )


@api_router.post("/levels/cycle/confirm", response_model=ConfirmCycleOut)
def confirm_cycle(payload: ConfirmCycleIn, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no)

    if cycle.status != "completed_pending_confirm":
        raise HTTPException(status_code=400, detail="cycle is not ready to confirm")

    cycle.status = "completed_confirmed"
    db.add(cycle)
    db.flush()

    new_cycle_no = int(cycle.cycle_no) + 1
    new_cycle = LevelCycle(
        user_id=payload.user_id,
        difficulty_level=payload.difficulty_level,
        cycle_no=new_cycle_no,
        status="active",
    )
    db.add(new_cycle)
    db.flush()

    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=new_cycle_no)
    db.commit()

    return ConfirmCycleOut(
        user_id=payload.user_id,
        difficulty_level=payload.difficulty_level,
        new_cycle_no=new_cycle_no,
    )
