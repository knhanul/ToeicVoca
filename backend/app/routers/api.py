from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..leitner import LEITNER_MAX_LEVEL, next_review_date_for_level
from ..models import LevelCycle, LevelDayProgress, StudyLog, User, UserProgress, Vocab, VocabExample
from ..schemas import (
    CardOut,
    CompleteDayIn,
    CompleteDayOut,
    ConfirmCycleIn,
    ConfirmCycleOut,
    CurrentDayProgressOut,
    DayWordCountsOut,
    LevelsStatsOut,
    LevelStatsOut,
    LevelsStatusOut,
    LevelStatusOut,
    OpenDayIn,
    OpenDayOut,
    RecentStudyOut,
    ReviewIn,
    ReviewOut,
    VocabOut,
)

api_router = APIRouter()


def _vocab_out_with_random_example(db: Session, *, vocab: Vocab) -> VocabOut:
    example = db.execute(
        select(VocabExample)
        .where(VocabExample.vocab_id == vocab.id)
        .order_by(func.random())
        .limit(1)
    ).scalar_one_or_none()

    out = VocabOut.model_validate(vocab)
    if example is None:
        return out

    return out.model_copy(update={"example_en": example.example_en, "example_kr": example.example_kr})


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
            vocab=_vocab_out_with_random_example(db, vocab=vocab),
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

    return CardOut(vocab=_vocab_out_with_random_example(db, vocab=vocab))


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

    open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
    if open_day is not None:
        current_day = int(open_day.day)
    else:
        last_completed = db.execute(
            select(func.max(LevelDayProgress.day)).where(
                and_(
                    LevelDayProgress.user_id == user_id,
                    LevelDayProgress.difficulty_level == difficulty_level,
                    LevelDayProgress.cycle_no == cycle.cycle_no,
                    LevelDayProgress.status == "completed",
                )
            )
        ).scalar_one()
        current_day = int(last_completed or 1)

    # Curriculum Day 기준 최근 7일 윈도우 (날짜 기준 아님)
    REMIND_CURRICULUM_DAYS = 7
    start_day = max(1, current_day - REMIND_CURRICULUM_DAYS + 1)

    # recent 7 curriculum days studied vocab ids for this level+cycle
    # - only include vocabs whose latest result is NOT perfect (Perfect가 아닌 모든 결과 대상)
    latest_ts_subq = (
        select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
        .join(Vocab, Vocab.id == StudyLog.vocab_id)
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.cycle_no == cycle.cycle_no,
                StudyLog.difficulty_level == difficulty_level,
                Vocab.day.is_not(None),
                Vocab.day >= start_day,
                Vocab.day <= current_day,
            )
        )
        .group_by(StudyLog.vocab_id)
        .subquery()
    )

    recent_vocab_ids_stmt = (
        select(StudyLog.vocab_id)
        .join(
            latest_ts_subq,
            and_(StudyLog.vocab_id == latest_ts_subq.c.vocab_id, StudyLog.studied_at == latest_ts_subq.c.max_ts),
        )
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.cycle_no == cycle.cycle_no,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.result != "perfect",  # Perfect가 아닌 모든 결과 대상
            )
        )
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
            vocab=_vocab_out_with_random_example(db, vocab=vocab),
            leitner_level=None,      # 리마인드는 처음 보는 것처럼 동작
            next_review_date=None,   # 리마인드는 처음 보는 것처럼 동작
            is_mastered=None,        # 리마인드는 처음 보는 것처럼 동작
        )

    raise HTTPException(status_code=404, detail="no remind cards")


@api_router.get("/cards/review", response_model=CardOut)
def get_review_card(
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
    if open_day is not None:
        current_day = int(open_day.day)
    else:
        last_completed = db.execute(
            select(func.max(LevelDayProgress.day)).where(
                and_(
                    LevelDayProgress.user_id == user_id,
                    LevelDayProgress.difficulty_level == difficulty_level,
                    LevelDayProgress.cycle_no == cycle.cycle_no,
                    LevelDayProgress.status == "completed",
                )
            )
        ).scalar_one()
        current_day = int(last_completed or 1)

    window_days = int(getattr(user, "remind_window_days", 5) or 5)
    start_day = max(1, current_day - window_days + 1)

    # latest result per vocab in this level+cycle
    latest_ts_subq = (
        select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.cycle_no == cycle.cycle_no,
            )
        )
        .group_by(StudyLog.vocab_id)
        .subquery()
    )

    latest_logs_subq = (
        select(StudyLog.vocab_id.label("vocab_id"), StudyLog.result.label("result"))
        .join(
            latest_ts_subq,
            and_(StudyLog.vocab_id == latest_ts_subq.c.vocab_id, StudyLog.studied_at == latest_ts_subq.c.max_ts),
        )
        .subquery()
    )

    # review candidates: in day range and latest result is again/good
    vocab_stmt = (
        select(Vocab, latest_logs_subq.c.result)
        .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                Vocab.day.is_not(None),
                Vocab.day >= start_day,
                Vocab.day <= current_day,
                latest_logs_subq.c.result.in_(["again", "good"]),
            )
        )
        .order_by(
            (latest_logs_subq.c.result == "again").desc(),
            func.random(),
        )
        .limit(1)
    )

    row = db.execute(vocab_stmt).first()
    if row is None:
        raise HTTPException(status_code=404, detail="no review cards")

    vocab, _ = row
    return CardOut(vocab=_vocab_out_with_random_example(db, vocab=vocab))


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
            vocab=_vocab_out_with_random_example(db, vocab=vocab),
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

    return CardOut(vocab=_vocab_out_with_random_example(db, vocab=vocab))


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


@api_router.get("/stats/levels", response_model=LevelsStatsOut)
def get_levels_stats(user_id: int = Query(...), db: Session = Depends(get_db)):
    print(f"=== API CALLED: get_levels_stats with user_id={user_id} ===")  # 이 줄 추가
    user = db.get(User, user_id)
    if user is None:
        print(f"User not found: {user_id}")  # 이 줄 추가
        raise HTTPException(status_code=404, detail="user not found")

    levels_out: list[LevelStatsOut] = []

    for level in ["600", "800", "900"]:
        cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=level)
        _ensure_day_rows(db, user_id=user_id, difficulty_level=level, cycle_no=cycle.cycle_no)

        # Day progress (30-day 기준 완료 Day 수)
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

        day_progress_pct = int((int(completed_days) / 30) * 100)

        # 암기율(Perfect 기반): 레벨 전체 단어 중 perfect 최종 판정 단어 수
        total_vocab = db.execute(select(func.count(Vocab.id)).where(Vocab.difficulty_level == level)).scalar_one()

        latest_ts_subq = (
            select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
                    StudyLog.cycle_no == cycle.cycle_no,
                )
            )
            .group_by(StudyLog.vocab_id)
            .subquery()
        )

        latest_logs_subq = (
            select(StudyLog.vocab_id.label("vocab_id"), StudyLog.result.label("result"))
            .join(
                latest_ts_subq,
                and_(StudyLog.vocab_id == latest_ts_subq.c.vocab_id, StudyLog.studied_at == latest_ts_subq.c.max_ts),
            )
            .subquery()
        )

        perfect_vocab = db.execute(
            select(func.count()).select_from(latest_logs_subq).where(latest_logs_subq.c.result == "perfect")
        ).scalar_one()

        memorization_pct = 0
        if int(total_vocab) > 0:
            memorization_pct = int((int(perfect_vocab) / int(total_vocab)) * 100)

        # Day별(모름/애매/완료) 집계: 해당 레벨에서 진행한 day(status open/completed)에 대해서만
        progressed_days = db.execute(
            select(LevelDayProgress.day)
            .where(
                and_(
                    LevelDayProgress.user_id == user_id,
                    LevelDayProgress.difficulty_level == level,
                    LevelDayProgress.cycle_no == cycle.cycle_no,
                    LevelDayProgress.status.in_(["open", "completed"]),
                )
            )
            .order_by(LevelDayProgress.day.asc())
        ).scalars().all()

        # Latest result per vocab, joined to vocab for day
        day_result_rows = db.execute(
            select(Vocab.day, latest_logs_subq.c.result, func.count())
            .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
            .where(and_(Vocab.difficulty_level == level, Vocab.day.is_not(None)))
            .group_by(Vocab.day, latest_logs_subq.c.result)
        ).all()

        counts_by_day: dict[int, dict[str, int]] = {}
        for d, r, cnt in day_result_rows:
            if d is None:
                continue
            counts_by_day.setdefault(int(d), {})[str(r)] = int(cnt)

        day_word_counts: list[DayWordCountsOut] = []
        for d in progressed_days:
            d_int = int(d)
            total_day_vocab = db.execute(
                select(func.count(Vocab.id)).where(and_(Vocab.difficulty_level == level, Vocab.day == d_int))
            ).scalar_one()
            result_counts = counts_by_day.get(d_int, {})
            unknown = int(result_counts.get("again", 0))
            unsure = int(result_counts.get("good", 0))
            perfect = int(result_counts.get("perfect", 0))
            day_word_counts.append(
                DayWordCountsOut(
                    day=d_int,
                    unknown_count=unknown,
                    unsure_count=unsure,
                    perfect_count=perfect,
                    total_count=int(total_day_vocab),
                )
            )

        # 최근 학습 현황 (최근 20개)
        recent_rows = db.execute(
            select(
                StudyLog.studied_at,
                StudyLog.difficulty_level,
                StudyLog.vocab_id,
                Vocab.day,
                StudyLog.result,
                Vocab.word,
            )
            .outerjoin(Vocab, Vocab.id == StudyLog.vocab_id)  # LEFT JOIN으로 변경
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
                    StudyLog.cycle_no == cycle.cycle_no,
                    StudyLog.vocab_id.is_not(None),
                )
            )
            .order_by(StudyLog.studied_at.desc())
            .limit(20)
        ).all()

        # word가 None이면 기본값 제공 (LEFT JOIN으로 이미 가져왔으므로 추가 쿼리 불필요)
        recent_study: list[RecentStudyOut] = []
        for (ts, dl, vocab_id, day, res, word) in recent_rows:
            recent_study.append(
                RecentStudyOut(
                    studied_at=ts,
                    difficulty_level=dl,
                    vocab_id=vocab_id,
                    day=day,
                    result=res,
                    word=str(word) if word is not None else f"Day{day}단어",
                )
            )

        levels_out.append(
            LevelStatsOut(
                difficulty_level=level,
                cycle_no=cycle.cycle_no,
                completed_days=int(completed_days),
                day_progress_pct=int(day_progress_pct),
                total_vocab=int(total_vocab),
                perfect_vocab=int(perfect_vocab),
                memorization_pct=int(memorization_pct),
                day_word_counts=day_word_counts,
                recent_study=recent_study,
            )
        )

    db.commit()
    return LevelsStatsOut(user_id=user_id, levels=levels_out)


@api_router.get("/stats/current-day", response_model=CurrentDayProgressOut)
def get_current_day_progress(
    user_id: int = Query(...), difficulty_level: str = Query(...), db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=difficulty_level)
    _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)

    open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)

    day_val = open_day.day if open_day else None

    total_words = 0
    progressed_words = 0

    if day_val is not None:
        total_words = db.execute(
            select(func.count(Vocab.id)).where(
                and_(Vocab.difficulty_level == difficulty_level, Vocab.day == day_val)
            )
        ).scalar_one()

        progressed_words = db.execute(
            select(func.count(UserProgress.id))
            .join(Vocab, UserProgress.vocab_id == Vocab.id)
            .where(
                and_(
                    UserProgress.user_id == user_id,
                    UserProgress.cycle_no == cycle.cycle_no,
                    Vocab.difficulty_level == difficulty_level,
                    Vocab.day == day_val,
                )
            )
        ).scalar_one()

    progress_pct = 0
    if int(total_words) > 0:
        progress_pct = int((int(progressed_words) / int(total_words)) * 100)

    return CurrentDayProgressOut(
        difficulty_level=difficulty_level,
        cycle_no=cycle.cycle_no,
        day=day_val,
        total_words=int(total_words),
        progressed_words=int(progressed_words),
        progress_pct=int(progress_pct),
    )
