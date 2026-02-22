from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
import uuid
import json
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import (
    select,
    insert,
    update,
    delete,
    func,
    and_,
    or_,
    text,
    desc,
    asc,
    literal_column,
)
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
    RemindReviewOut,
    RemindSessionStart,
    RemindSessionOut,
    RemindCardOut,
    GradeSubmission,
    ReviewIn,
    ReviewOut,
    StartNextCycleIn,
    StartNextCycleOut,
    RecentStudyOut,
    UserOut,
    VocabOut,
)

# 사용자 생성을 위한 Pydantic 모델
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str


class LoginIn(BaseModel):
    username: str
    password: str


# 리마인드 세션 저장소 (메모리)
remind_sessions: Dict[str, dict] = {}

logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.WARNING)

api_router = APIRouter()


@api_router.post("/register", response_model=UserOut)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    """새 사용자 등록"""
    # 중복 사용자 확인
    existing_user = db.execute(
        select(User).where(User.username == user_data.username)
    ).scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # 비밀번호 해싱 (간단한 구현)
    from hashlib import sha256
    password_hash = sha256(user_data.password.encode()).hexdigest()
    
    # 사용자 생성
    new_user = User(
        username=user_data.username,
        password_hash=password_hash,
        current_level="800",  # 기본 레벨
        remind_window_days=5  # 기본 복습 기간
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@api_router.post("/login", response_model=UserOut)
def login_user(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.username == payload.username)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    from hashlib import sha256

    password_hash = sha256(payload.password.encode()).hexdigest()
    if user.password_hash != password_hash:
        raise HTTPException(status_code=401, detail="invalid credentials")

    # UserOut 스키마로 변환 (model_validate with from_attributes)
    return UserOut.model_validate(user, from_attributes=True)


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
    # 레벨별 Max Day 계산
    max_day = db.execute(
        select(func.max(Vocab.day)).where(Vocab.difficulty_level == difficulty_level)
    ).scalar_one() or 30
    
    # Max Day를 초과하는 기존 Day들 삭제
    db.execute(
        delete(LevelDayProgress).where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == cycle_no,
                LevelDayProgress.day > max_day
            )
        )
    )
    
    existing = db.execute(
        select(func.count(LevelDayProgress.id)).where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == cycle_no,
            )
        )
    ).scalar_one()

    if int(existing) >= max_day:
        return

    rows = [
        LevelDayProgress(
            user_id=user_id,
            difficulty_level=difficulty_level,
            cycle_no=cycle_no,
            day=d,
            status="locked",
        )
        for d in range(1, max_day + 1)
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
        
        # 레벨별 Max Day 계산
        max_day = db.execute(
            select(func.max(Vocab.day)).where(Vocab.difficulty_level == level)
        ).scalar_one() or 30
        
        # Max Day 완료 확인: completed_days가 max_day이고 open_day가 없으면 완료
        is_cycle_completed = int(completed_days) >= max_day and open_day is None
        
        # 사이클 완료 상태이면 status 업데이트
        if is_cycle_completed and cycle.status == "active":
            cycle.status = "completed_pending_confirm"
            cycle.completed_at = datetime.utcnow()
            db.add(cycle)

        pct = int((int(completed_days) / max_day) * 100)
        levels.append(
            LevelStatusOut(
                difficulty_level=level,
                cycle_no=cycle.cycle_no,
                cycle_status=cycle.status,
                next_day=next_day.day if next_day else None,
                open_day=open_day.day if open_day else None,
                completed_days=int(completed_days),
                total_days=max_day,
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

    # 레벨별 Max Day 계산
    max_day = db.execute(
        select(func.max(Vocab.day)).where(Vocab.difficulty_level == payload.difficulty_level)
    ).scalar_one() or 30
    
    if payload.day < 1 or payload.day > max_day:
        raise HTTPException(status_code=400, detail=f"day must be 1..{max_day}")

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no)

    if cycle.status != "active":
        raise HTTPException(status_code=400, detail="cycle is not active")

    # 현재 선택된 레벨의 열린 Day만 확인
    existing_open = _get_open_day(
        db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no
    )
    if existing_open is not None:
        # "오늘 학습 시작" 버튼은 '다음 Day 강제 오픈' 용도이므로,
        # 현재 Day가 open 상태여도 다음 Day(payload.day)가 요청되면 진행을 허용한다.
        expected_next_day = int(existing_open.day) + 1
        if int(payload.day) != expected_next_day:
            raise HTTPException(
                status_code=400,
                detail=f"현재 {payload.difficulty_level}점대 Day {existing_open.day}가 열려 있습니다. 다음 Day({expected_next_day})만 열 수 있습니다.",
            )

        existing_open.status = "completed"
        existing_open.completed_at = datetime.utcnow()
        db.add(existing_open)

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

    # 다음 Day인지 확인 (선택된 레벨만)
    next_locked = _get_next_day(
        db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no
    )
    if next_locked is None or next_locked.day != payload.day:
        raise HTTPException(
            status_code=400,
            detail=f"현재 {payload.difficulty_level}점대에서 열 수 있는 다음 Day가 아닙니다.",
        )

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


@api_router.post("/levels/day/complete", response_model=OpenDayOut)
def complete_day(payload: OpenDayIn, db: Session = Depends(get_db)):
    """Day 학습 완료 처리 (Max Day 완료 시 다음 회독 시작)"""
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    # 레벨별 Max Day 계산
    max_day = db.execute(
        select(func.max(Vocab.day)).where(Vocab.difficulty_level == payload.difficulty_level)
    ).scalar_one() or 30

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    
    # Max Day 완료 확인
    if int(payload.day) == max_day:
        # 현재 사이클의 Day 30이 완료되었는지 확인
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
        
        # Max Day가 완료되었고, 현재 사이클이 active 상태인 경우에만 다음 회독 시작
        # 이미 completed_pending_confirm 상태이면 다음 회독이 시작된 것이므로 건너뛰기
        if int(completed_days) >= max_day and cycle.status == "active":
            # 현재 사이클 완료 처리
            cycle.status = "completed_pending_confirm"
            cycle.completed_at = datetime.utcnow()
            db.add(cycle)
            
            # 새로운 사이클 생성
            new_cycle_no = cycle.cycle_no + 1
            new_cycle = LevelCycle(
                user_id=payload.user_id,
                difficulty_level=payload.difficulty_level,
                cycle_no=new_cycle_no,
                status="active"
            )
            db.add(new_cycle)
            
            # 새로운 사이클의 Day 1 생성
            _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=new_cycle_no)
            
            # 새로운 사이클의 Day 1 열기
            new_day1 = db.execute(
                select(LevelDayProgress).where(
                    and_(
                        LevelDayProgress.user_id == payload.user_id,
                        LevelDayProgress.difficulty_level == payload.difficulty_level,
                        LevelDayProgress.cycle_no == new_cycle_no,
                        LevelDayProgress.day == 1,
                    )
                )
            ).scalar_one()
            
            new_day1.status = "open"
            new_day1.opened_at = datetime.utcnow()
            db.add(new_day1)
            
            db.commit()
            
            return OpenDayOut(
                user_id=payload.user_id,
                difficulty_level=payload.difficulty_level,
                cycle_no=new_cycle_no,
                day=1,
                status="open",
                message=f"🎉 축하합니다! {payload.difficulty_level}점대 {cycle.cycle_no}회독을 완료했습니다. {new_cycle_no}회독 Day 1이 시작되었습니다."
            )
        
        # 이미 완료된 사이클이면 새로운 사이클 찾기
        if cycle.status == "completed_pending_confirm":
            # 새로운 사이클 찾기
            new_cycle = db.execute(
                select(LevelCycle).where(
                    and_(
                        LevelCycle.user_id == payload.user_id,
                        LevelCycle.difficulty_level == payload.difficulty_level,
                        LevelCycle.status == "active",
                    )
                ).order_by(LevelCycle.cycle_no.desc()).limit(1)
            ).scalar_one_or_none()
            
            if new_cycle:
                # 새로운 사이클의 Day 1이 열려있는지 확인
                new_day1 = db.execute(
                    select(LevelDayProgress).where(
                        and_(
                            LevelDayProgress.user_id == payload.user_id,
                            LevelDayProgress.difficulty_level == payload.difficulty_level,
                            LevelDayProgress.cycle_no == new_cycle.cycle_no,
                            LevelDayProgress.day == 1,
                        )
                    )
                ).scalar_one_or_none()
                
                if new_day1 and new_day1.status == "open":
                    return OpenDayOut(
                        user_id=payload.user_id,
                        difficulty_level=payload.difficulty_level,
                        cycle_no=new_cycle.cycle_no,
                        day=1,
                        status="open",
                        message=f"이미 {new_cycle.cycle_no}회독이 진행 중입니다. Day 1부터 학습을 계속하세요."
                    )
                else:
                    # Day 1이 없거나 열려있지 않으면 열기
                    if new_day1:
                        new_day1.status = "open"
                        new_day1.opened_at = datetime.utcnow()
                        db.add(new_day1)
                    else:
                        # Day 1 생성
                        _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=new_cycle.cycle_no)
                        new_day1 = db.execute(
                            select(LevelDayProgress).where(
                                and_(
                                    LevelDayProgress.user_id == payload.user_id,
                                    LevelDayProgress.difficulty_level == payload.difficulty_level,
                                    LevelDayProgress.cycle_no == new_cycle.cycle_no,
                                    LevelDayProgress.day == 1,
                                )
                            )
                        ).scalar_one()
                        new_day1.status = "open"
                        new_day1.opened_at = datetime.utcnow()
                        db.add(new_day1)
                    
                    db.commit()
                    
                    return OpenDayOut(
                        user_id=payload.user_id,
                        difficulty_level=payload.difficulty_level,
                        cycle_no=new_cycle.cycle_no,
                        day=1,
                        status="open",
                        message=f"{new_cycle.cycle_no}회독 Day 1이 시작되었습니다. 학습을 계속하세요."
                    )
            
            # 새로운 사이클이 없으면 생성
            new_cycle_no = cycle.cycle_no + 1
            new_cycle = LevelCycle(
                user_id=payload.user_id,
                difficulty_level=payload.difficulty_level,
                cycle_no=new_cycle_no,
                status="active"
            )
            db.add(new_cycle)
            
            # 새로운 사이클의 Day 1 생성
            _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=new_cycle_no)
            
            # 새로운 사이클의 Day 1 열기
            new_day1 = db.execute(
                select(LevelDayProgress).where(
                    and_(
                        LevelDayProgress.user_id == payload.user_id,
                        LevelDayProgress.difficulty_level == payload.difficulty_level,
                        LevelDayProgress.cycle_no == new_cycle_no,
                        LevelDayProgress.day == 1,
                    )
                )
            ).scalar_one()
            
            new_day1.status = "open"
            new_day1.opened_at = datetime.utcnow()
            db.add(new_day1)
            
            db.commit()
            
            return OpenDayOut(
                user_id=payload.user_id,
                difficulty_level=payload.difficulty_level,
                cycle_no=new_cycle_no,
                day=1,
                status="open",
                message=f"새로운 {new_cycle_no}회독 Day 1이 시작되었습니다."
            )
    
    # Max Day가 아니면 일반 완료 처리
    day_progress = db.execute(
        select(LevelDayProgress).where(
            and_(
                LevelDayProgress.user_id == payload.user_id,
                LevelDayProgress.difficulty_level == payload.difficulty_level,
                LevelDayProgress.cycle_no == cycle.cycle_no,
                LevelDayProgress.day == payload.day,
            )
        )
    ).scalar_one_or_none()
    
    if day_progress:
        day_progress.status = "completed"
        day_progress.completed_at = datetime.utcnow()
        db.add(day_progress)
        db.commit()
    
    return OpenDayOut(
        user_id=payload.user_id,
        difficulty_level=payload.difficulty_level,
        cycle_no=cycle.cycle_no,
        day=payload.day,
        status="completed",
    )


@api_router.get("/user/exclude-perfect-settings")
def get_exclude_perfect_settings(
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    
    return {
        "exclude_perfect_settings": user.exclude_perfect_settings or {}
    }


@api_router.post("/user/exclude-perfect-settings")
def update_exclude_perfect_settings(
    user_id: int = Query(...),
    settings: dict = Body(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    
    user.exclude_perfect_settings = settings
    db.commit()
    
    return {"message": "Settings updated successfully"}


@api_router.get("/cards/today", response_model=CardOut)
def get_today_card(
    user_id: int = Query(...),
    difficulty_level: str = Query(...),
    exclude_perfect: bool = Query(False),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=difficulty_level)
    _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)

    open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
    print(f"DEBUG: open_day for {difficulty_level} cycle {cycle.cycle_no}: {open_day}")
    
    if open_day is None:
        # Check if cycle is completed and auto-start next cycle
        completed_days = db.execute(
            select(func.count(LevelDayProgress.id)).where(
                and_(
                    LevelDayProgress.user_id == user_id,
                    LevelDayProgress.difficulty_level == difficulty_level,
                    LevelDayProgress.cycle_no == cycle.cycle_no,
                    LevelDayProgress.status == "completed",
                )
            )
        ).scalar_one()
        
        max_day = db.execute(
            select(func.max(Vocab.day)).where(Vocab.difficulty_level == difficulty_level)
        ).scalar_one() or 30
        
        print(f"DEBUG: completed_days={completed_days}, max_day={max_day}")
        
        # If all days completed, auto-start next cycle
        if int(completed_days) >= max_day:
            print(f"DEBUG: Auto-starting next cycle for {difficulty_level}")
            # Complete current cycle and start next one
            cycle.status = "completed_pending_confirm"
            cycle.completed_at = datetime.utcnow()
            db.add(cycle)
            db.commit()
            
            # Create new cycle
            new_cycle = LevelCycle(
                user_id=user_id,
                difficulty_level=difficulty_level,
                cycle_no=cycle.cycle_no + 1,
                status="active",
                started_at=datetime.utcnow()
            )
            db.add(new_cycle)
            db.commit()
            
            # Initialize new cycle days
            _ensure_day_rows(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=new_cycle.cycle_no)
            
            # Get open_day from new cycle
            open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=new_cycle.cycle_no)
            cycle = new_cycle
            print(f"DEBUG: New cycle created, open_day: {open_day}")
        
        if open_day is None:
            print(f"DEBUG: Still no open_day for {difficulty_level}")
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
    # If exclude_perfect is True, also exclude words that have perfect status in current cycle
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
    )
    
    # Add exclude_perfect filter if enabled
    if exclude_perfect:
        # Use raw SQL to avoid SQLAlchemy subquery issues
        perfect_words_query = text("""
            SELECT DISTINCT vocab_id 
            FROM study_logs sl
            WHERE sl.user_id = :user_id 
              AND sl.cycle_no < :cycle_no 
              AND sl.difficulty_level = :difficulty_level 
              AND sl.result = 'perfect'
              AND sl.studied_at = (
                  SELECT MAX(studied_at)
                  FROM study_logs
                  WHERE user_id = :user_id 
                    AND vocab_id = sl.vocab_id
                    AND cycle_no < :cycle_no 
                    AND difficulty_level = :difficulty_level
              )
        """)
        
        perfect_words_result = db.execute(perfect_words_query, {
            "user_id": user_id,
            "cycle_no": cycle.cycle_no,
            "difficulty_level": difficulty_level
        }).fetchall()
        
        perfect_vocab_ids = [row[0] for row in perfect_words_result]
        
        if perfect_vocab_ids:
            vocab_stmt = vocab_stmt.where(~Vocab.id.in_(perfect_vocab_ids))
    
    vocab_stmt = vocab_stmt.order_by(Vocab.id.asc()).limit(1)
    vocab = db.execute(vocab_stmt).scalar_one_or_none()
    if vocab is None:
        # 현재 Day의 모든 단어를 학습했는지 확인 (Perfect 단어 제외 고려)
        if exclude_perfect:
            # Perfect 단어 제외 상태에서의 완료 확인 (전 회차까지의 최종 perfect)
            current_day_completed = db.execute(
                text("""
                    SELECT COUNT(*) = COUNT(up.vocab_id)
                    FROM vocab v
                    LEFT JOIN user_progress up ON v.id = up.vocab_id AND up.user_id = :user_id AND up.cycle_no = :cycle_no
                    WHERE v.difficulty_level = :difficulty_level 
                      AND v.day = :current_day
                      AND v.id NOT IN (
                          SELECT DISTINCT vocab_id 
                          FROM study_logs sl
                          WHERE sl.user_id = :user_id 
                            AND sl.cycle_no < :cycle_no 
                            AND sl.difficulty_level = :difficulty_level 
                            AND sl.result = 'perfect'
                            AND sl.studied_at = (
                                SELECT MAX(studied_at)
                                FROM study_logs
                                WHERE user_id = :user_id 
                                  AND vocab_id = sl.vocab_id
                                  AND cycle_no < :cycle_no 
                                  AND difficulty_level = :difficulty_level
                            )
                      )
                """),
                {
                    "user_id": user_id, 
                    "cycle_no": cycle.cycle_no, 
                    "difficulty_level": difficulty_level, 
                    "current_day": open_day.day
                }
            ).scalar()
        else:
            # 일반 상태에서의 완료 확인
            current_day_completed = db.execute(
                text("""
                    SELECT COUNT(*) = COUNT(up.vocab_id)
                    FROM vocab v
                    LEFT JOIN user_progress up ON v.id = up.vocab_id AND up.user_id = :user_id AND up.cycle_no = :cycle_no
                    WHERE v.difficulty_level = :difficulty_level AND v.day = :current_day
                """),
                {"user_id": user_id, "cycle_no": cycle.cycle_no, "difficulty_level": difficulty_level, "current_day": open_day.day}
            ).scalar()
        
        if current_day_completed:
            # 현재 Day 완료 처리
            db.execute(
                text("""
                    UPDATE level_day_progress 
                    SET status = 'completed', completed_at = NOW()
                    WHERE user_id = :user_id AND difficulty_level = :difficulty_level AND cycle_no = :cycle_no AND day = :current_day
                """),
                {"user_id": user_id, "difficulty_level": difficulty_level, "cycle_no": cycle.cycle_no, "current_day": open_day.day}
            )
            
            # 레벨별 Max Day 계산
            max_day = db.execute(
                select(func.max(Vocab.day)).where(Vocab.difficulty_level == difficulty_level)
            ).scalar_one() or 30
            
            # Max Day 완료 확인
            if open_day.day >= max_day:
                # 사이클 완료 처리
                cycle.status = "completed_pending_confirm"
                cycle.completed_at = datetime.utcnow()
                db.add(cycle)
                db.commit()
                
                # 404 에러 대신 명확한 메시지 반환
                raise HTTPException(
                    status_code=404, 
                    detail=f"🎉 {difficulty_level}점대 {cycle.cycle_no}회독을 완료했습니다! 다음 회독을 시작해주세요."
                )
            
            # 다음 Day 열기
            if open_day.day < max_day:  # 동적 최대 Day 수
                next_day = open_day.day + 1
                db.execute(
                    text("""
                        UPDATE level_day_progress 
                        SET status = 'open', opened_at = NOW()
                        WHERE user_id = :user_id AND difficulty_level = :difficulty_level AND cycle_no = :cycle_no AND day = :next_day
                    """),
                    {"user_id": user_id, "difficulty_level": difficulty_level, "cycle_no": cycle.cycle_no, "next_day": next_day}
                )
                db.commit()
                
                # 다음 Day의 단어 다시 시도 (Perfect 단어 제외 적용)
                vocab_stmt = (
                    select(Vocab)
                    .where(and_(Vocab.difficulty_level == difficulty_level, Vocab.day == next_day))
                    .where(
                        ~Vocab.id.in_(
                            select(UserProgress.vocab_id).where(
                                and_(UserProgress.user_id == user_id, UserProgress.cycle_no == cycle.cycle_no)
                            )
                        )
                    )
                )
                
                # Add exclude_perfect filter if enabled
                if exclude_perfect:
                    # Use raw SQL to avoid SQLAlchemy subquery issues
                    perfect_words_query = text("""
                        SELECT DISTINCT vocab_id 
                        FROM study_logs sl
                        WHERE sl.user_id = :user_id 
                          AND sl.cycle_no < :cycle_no 
                          AND sl.difficulty_level = :difficulty_level 
                          AND sl.result = 'perfect'
                          AND sl.studied_at = (
                              SELECT MAX(studied_at)
                              FROM study_logs
                              WHERE user_id = :user_id 
                                AND vocab_id = sl.vocab_id
                                AND cycle_no < :cycle_no 
                                AND difficulty_level = :difficulty_level
                          )
                    """)
                    
                    perfect_words_result = db.execute(perfect_words_query, {
                        "user_id": user_id,
                        "cycle_no": cycle.cycle_no,
                        "difficulty_level": difficulty_level
                    }).fetchall()
                    
                    perfect_vocab_ids = [row[0] for row in perfect_words_result]
                    
                    if perfect_vocab_ids:
                        vocab_stmt = vocab_stmt.where(~Vocab.id.in_(perfect_vocab_ids))
                
                vocab_stmt = vocab_stmt.order_by(Vocab.id.asc()).limit(1)
                vocab = db.execute(vocab_stmt).scalar_one_or_none()
                if vocab is None:
                    raise HTTPException(status_code=404, detail="no cards available in next day")
            else:
                raise HTTPException(status_code=404, detail="all days completed")
        else:
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

    # Day 기준 7일 윈도우 (실제 일자 기준 아님)
    REMIND_CURRICULUM_DAYS = 7
    
    # 가장 마지막 사이클(가장 높은 cycle_no)의 마지막 Day 찾기
    max_cycle_no = db.execute(
        select(func.max(LevelCycle.cycle_no)).where(
            and_(
                LevelCycle.user_id == user_id,
                LevelCycle.difficulty_level == difficulty_level
            )
        )
    ).scalar_one() or 1
    
    # 마지막 사이클의 마지막 학습 Day 찾기
    last_cycle_last_day = db.execute(
        select(func.max(LevelDayProgress.day)).where(
            and_(
                LevelDayProgress.user_id == user_id,
                LevelDayProgress.difficulty_level == difficulty_level,
                LevelDayProgress.cycle_no == max_cycle_no,
                LevelDayProgress.status == "completed",
            )
        )
    ).scalar_one() or 0
    
    # 마지막 사이클에 open_day가 있다면 그 Day를 기준으로
    open_day_in_last_cycle = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=max_cycle_no)
    if open_day_in_last_cycle is not None:
        reference_day = int(open_day_in_last_cycle.day)
    else:
        reference_day = max(last_cycle_last_day, 1)
    
    # 현재 활성 사이클과 마지막 사이클의 Day 범위 계산
    all_cycle_ranges = []
    
    if reference_day >= REMIND_CURRICULUM_DAYS:
        # 마지막 Day가 7보다 크면: 마지막 Day ~ 마지막 Day - 7
        start_day = reference_day - REMIND_CURRICULUM_DAYS + 1
        
        # 현재 활성 사이클 추가 (마지막 사이클과 다를 경우)
        if cycle.cycle_no == max_cycle_no:
            all_cycle_ranges.append({
                'cycle_no': cycle.cycle_no,
                'start_day': start_day,
                'end_day': reference_day
            })
        else:
            # 현재 활성 사이클의 범위
            current_cycle_last_day = db.execute(
                select(func.max(LevelDayProgress.day)).where(
                    and_(
                        LevelDayProgress.user_id == user_id,
                        LevelDayProgress.difficulty_level == difficulty_level,
                        LevelDayProgress.cycle_no == cycle.cycle_no,
                        LevelDayProgress.status == "completed",
                    )
                )
            ).scalar_one() or 0
            
            current_open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
            if current_open_day is not None and int(current_open_day.day) > current_cycle_last_day:
                current_cycle_last_day = int(current_open_day.day)
            
            if current_cycle_last_day > 0:
                all_cycle_ranges.append({
                    'cycle_no': cycle.cycle_no,
                    'start_day': max(1, current_cycle_last_day - REMIND_CURRICULUM_DAYS + 1),
                    'end_day': current_cycle_last_day
                })
            
            # 마지막 사이클 추가
            all_cycle_ranges.append({
                'cycle_no': max_cycle_no,
                'start_day': start_day,
                'end_day': reference_day
            })
    else:
        # 현재 Day가 7보다 작으면: 마지막 Day ~ 1Day + 이전 사이클의 30 + 마지막 Day - 7
        remaining_days = REMIND_CURRICULUM_DAYS - reference_day + 1
        
        # 마지막 사이클: 1Day ~ reference_day
        all_cycle_ranges.append({
            'cycle_no': max_cycle_no,
            'start_day': 1,
            'end_day': reference_day
        })
        
        # 이전 사이클에서 필요한 만큼 가져오기
        if max_cycle_no > 1 and remaining_days > 0:
            prev_cycle_no = max_cycle_no - 1
            prev_cycle_last_day = db.execute(
                select(func.max(LevelDayProgress.day)).where(
                    and_(
                        LevelDayProgress.user_id == user_id,
                        LevelDayProgress.difficulty_level == difficulty_level,
                        LevelDayProgress.cycle_no == prev_cycle_no,
                        LevelDayProgress.status == "completed",
                    )
                )
            ).scalar_one() or 0
            
            if prev_cycle_last_day > 0:
                # 이전 사이클의 마지막 Day부터 필요한 만큼
                prev_start_day = max(1, prev_cycle_last_day - remaining_days + 1)
                all_cycle_ranges.append({
                    'cycle_no': prev_cycle_no,
                    'start_day': prev_start_day,
                    'end_day': prev_cycle_last_day
                })
        
        # 현재 활성 사이클이 마지막 사이클과 다를 경우 추가
        if cycle.cycle_no != max_cycle_no:
            current_cycle_last_day = db.execute(
                select(func.max(LevelDayProgress.day)).where(
                    and_(
                        LevelDayProgress.user_id == user_id,
                        LevelDayProgress.difficulty_level == difficulty_level,
                        LevelDayProgress.cycle_no == cycle.cycle_no,
                        LevelDayProgress.status == "completed",
                    )
                )
            ).scalar_one() or 0
            
            current_open_day = _get_open_day(db, user_id=user_id, difficulty_level=difficulty_level, cycle_no=cycle.cycle_no)
            if current_open_day is not None and int(current_open_day.day) > current_cycle_last_day:
                current_cycle_last_day = int(current_open_day.day)
            
            if current_cycle_last_day > 0:
                all_cycle_ranges.append({
                    'cycle_no': cycle.cycle_no,
                    'start_day': max(1, current_cycle_last_day - REMIND_CURRICULUM_DAYS + 1),
                    'end_day': current_cycle_last_day
                })

    if not all_cycle_ranges:
        raise HTTPException(status_code=404, detail="no remind cards")

    day_range_conditions = []
    for range_info in all_cycle_ranges:
        day_range_conditions.append(
            and_(
                Vocab.day >= range_info["start_day"],
                Vocab.day <= range_info["end_day"],
            )
        )
    combined_day_range_condition = or_(*day_range_conditions)

    # 1. 최근 7일(커리큘럼 Day) 범위에 속한 vocab_id 집합 구하기
    vocab_ids_in_window_stmt = (
        select(Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                combined_day_range_condition,
            )
        )
    )

    vocab_ids_in_window = {row[0] for row in db.execute(vocab_ids_in_window_stmt).fetchall()}
    if not vocab_ids_in_window:
        raise HTTPException(status_code=404, detail="no remind cards")

    # 2. 그 vocab들에 대해 최신 StudyLog 구하기 (StudyLog.id 기준)
    latest_logs_subq = (
        select(
            StudyLog.vocab_id.label("vocab_id"),
            StudyLog.result.label("result"),
            func.row_number()
            .over(partition_by=StudyLog.vocab_id, order_by=StudyLog.id.desc())
            .label("rn"),
        )
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.vocab_id.in_(vocab_ids_in_window),
            )
        )
        .subquery()
    )

    # 3. 최신 결과가 again/good인 vocab만 최종 후보로 선택
    remind_vocab_stmt = (
        select(Vocab)
        .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                latest_logs_subq.c.rn == 1,
                latest_logs_subq.c.result.in_(["again", "good"]),
            )
        )
        .order_by(func.random())
        .limit(1)
    )

    vocab = db.execute(remind_vocab_stmt).scalar_one_or_none()
    
    if vocab:
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

    # 현재 열린 Day 확인
    open_day = _get_open_day(db, user_id=payload.user_id, difficulty_level=vocab.difficulty_level, cycle_no=cycle_no)
    
    # 이전 Day 복습 단어인지 확인
    is_prev_day_review = False
    if open_day and vocab.day and vocab.day < open_day.day:
        is_prev_day_review = True

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

    # 이전 Day 복습 단어인 경우, Leitner 업데이트를 다르게 처리
    if is_prev_day_review:
        # 이전 Day 복습 단어는 현재 Day 진도에 반영되지 않도록 처리
        if payload.grade == "again":
            # 다음 날 다시 복습하도록 설정
            new_level = int(progress.leitner_level or 1)
            next_date = today + timedelta(days=1)  # 다음 날 복습
            progress.correct_streak = 0
            progress.wrong_count = int(progress.wrong_count or 0) + 1
        elif payload.grade == "good":
            # 3일 후 복습
            new_level = min(int(progress.leitner_level or 1) + 1, LEITNER_MAX_LEVEL)
            next_date = today + timedelta(days=3)
            progress.correct_streak = int(progress.correct_streak or 0) + 1
        else:  # perfect
            # 7일 후 복습
            new_level = min(int(progress.leitner_level or 1) + 1, LEITNER_MAX_LEVEL)
            next_date = today + timedelta(days=7)
            progress.correct_streak = int(progress.correct_streak or 0) + 1
    else:
        # 현재 Day 단어의 정상적인 Leitner 처리
        current_level = int(progress.leitner_level or 1)

        if payload.grade == "again":
            new_level = 1
            next_date = today + timedelta(days=1)  # 다음 날 복습으로 변경하여 진도 나가도록 수정
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


@api_router.post("/review/remind", response_model=RemindReviewOut)
def submit_remind_review(payload: ReviewIn, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    vocab = db.get(Vocab, payload.vocab_id)
    if vocab is None:
        raise HTTPException(status_code=404, detail="vocab not found")

    today = date.today()
    now = datetime.utcnow()

    # 리마인드는 기존 StudyLog의 cycle_no를 유지하고 새로운 회차를 만들지 않음
    # 가장 최근 StudyLog의 cycle_no를 찾아서 사용
    latest_cycle = db.execute(
        select(StudyLog.cycle_no)
        .where(
            and_(
                StudyLog.user_id == payload.user_id,
                StudyLog.vocab_id == payload.vocab_id,
                StudyLog.difficulty_level == vocab.difficulty_level,
            )
        )
        .order_by(StudyLog.studied_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    
    # 이전 학습 기록이 없으면 에러 반환 (리마인드는 복습이므로 기존 기록이 있어야 함)
    if latest_cycle is None:
        raise HTTPException(status_code=400, detail="no previous study record found for this vocabulary")
    
    cycle_no = latest_cycle

    # UserProgress는 업데이트하지 않음 (리마인드는 복습이므로)
    # StudyLog만 추가하여 결과와 시간 기록
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

    # 리마인드는 Leitner 정보를 반환하지 않음 (복습이므로)
    return RemindReviewOut(
        user_id=payload.user_id,
        vocab_id=payload.vocab_id,
        grade=payload.grade,
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

    # 레벨별 Max Day 계산
    max_day = db.execute(
        select(func.max(Vocab.day)).where(Vocab.difficulty_level == payload.difficulty_level)
    ).scalar_one() or 30

    if int(completed_days) >= max_day and cycle.status == "active":
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
def get_levels_stats(user_id: int = Query(...), exclude_perfect: bool = Query(False), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    levels_out: list[LevelStatsOut] = []

    for level in ["600", "800", "900"]:
        cycle = _get_or_create_active_cycle(db, user_id=user_id, difficulty_level=level)
        _ensure_day_rows(db, user_id=user_id, difficulty_level=level, cycle_no=cycle.cycle_no)

        # 레벨별 Max Day 계산
        max_day = db.execute(
            select(func.max(Vocab.day)).where(Vocab.difficulty_level == level)
        ).scalar_one() or 30

        # Day progress (Max Day 기준 완료 Day 수)
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

        day_progress_pct = int((int(completed_days) / max_day) * 100)

        # 암기율(Perfect 기반): 레벨 전체 단어 중 perfect 최종 판정 단어 수 (모든 회차의 최신 결과 기준)
        total_vocab = db.execute(select(func.count(Vocab.id)).where(Vocab.difficulty_level == level)).scalar_one()

        # 모든 회차에서 각 단어별 최신 결과를 찾기
        latest_ts_subq = (
            select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
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

        # 진행한 Day별 현황 (전 회독 포함)
        # 모든 회독의 학습 기록이 있는 모든 Day 가져오기 (completed 상태가 아니어도 학습 기록이 있으면 포함)
        all_progressed_days = db.execute(
            select(func.distinct(Vocab.day))
            .join(StudyLog, StudyLog.vocab_id == Vocab.id)
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
                )
            )
        ).scalars().all()

        # 각 Day별로 최신 회독 정보와 결과 집계
        day_word_counts: list[DayWordCountsOut] = []
        for d in all_progressed_days:
            d_int = int(d)
            total_day_vocab = db.execute(
                select(func.count(Vocab.id)).where(and_(Vocab.difficulty_level == level, Vocab.day == d_int))
            ).scalar_one()
            
            # Day별 Topic 정보 가져오기
            topic = db.execute(
                select(Vocab.topic)
                .where(and_(Vocab.difficulty_level == level, Vocab.day == d_int))
                .limit(1)
            ).scalar_one_or_none()
            
            # 해당 Day를 가장 최근에 학습한 회차(cycle_no)와 결과 집계
            latest_cycle_for_day = db.execute(
                select(StudyLog.cycle_no, func.max(StudyLog.studied_at).label("max_ts"))
                .where(
                    and_(
                        StudyLog.user_id == user_id,
                        StudyLog.difficulty_level == level,
                        Vocab.day == d_int,
                    )
                )
                .join(Vocab, Vocab.id == StudyLog.vocab_id)
                .group_by(StudyLog.cycle_no)
                .order_by(func.max(StudyLog.studied_at).desc())
                .limit(1)
            ).first()
            
            cycle_no = latest_cycle_for_day[0] if latest_cycle_for_day else cycle.cycle_no
            
            # 1. 레벨별 모든 단어의 최신 결과를 먼저 계산
            latest_vocab_results_subq = (
                select(
                    StudyLog.vocab_id,
                    StudyLog.result,
                    StudyLog.cycle_no,
                    Vocab.day,
                    func.row_number()
                    .over(partition_by=StudyLog.vocab_id, order_by=StudyLog.studied_at.desc())
                    .label("rn")
                )
                .where(
                    and_(
                        StudyLog.user_id == user_id,
                        StudyLog.difficulty_level == level,
                    )
                )
                .join(Vocab, Vocab.id == StudyLog.vocab_id)
                .subquery()
            )
            
            # 2. 현재 Day에 해당하는 단어들의 최신 결과만 필터링
            day_latest_results = db.execute(
                select(
                    latest_vocab_results_subq.c.result,
                    latest_vocab_results_subq.c.cycle_no,
                    func.count(latest_vocab_results_subq.c.vocab_id).label("cnt")
                )
                .where(
                    and_(
                        latest_vocab_results_subq.c.rn == 1,  # 각 단어별 최신 결과만
                        latest_vocab_results_subq.c.day == d_int  # 현재 Day에 해당하는 단어만
                    )
                )
                .group_by(latest_vocab_results_subq.c.result, latest_vocab_results_subq.c.cycle_no)
            ).all()
            
            # 3. 해당 Day의 가장 최신 회차 찾기
            if day_latest_results:
                latest_cycle_for_day = max([row.cycle_no for row in day_latest_results])
                # 4. 가장 최신 회차의 결과만 집계
                latest_cycle_results = [row for row in day_latest_results if row.cycle_no == latest_cycle_for_day]
                result_counts = {str(r.result): int(r.cnt) for r in latest_cycle_results}
            else:
                # 해당 Day에 학습 기록이 없는 경우
                result_counts = {}
            
            unknown = int(result_counts.get("again", 0))
            unsure = int(result_counts.get("good", 0))
            perfect = int(result_counts.get("perfect", 0))
            
            day_word_counts.append(
                DayWordCountsOut(
                    day=d_int,
                    topic=topic,
                    cycle_no=cycle_no,
                    unknown_count=unknown,
                    unsure_count=unsure,
                    perfect_count=perfect,
                    total_count=int(total_day_vocab),
                )
            )

        # 회차별 내림차순, Day별 내림차순으로 정렬
        day_word_counts.sort(key=lambda x: (x.cycle_no, x.day), reverse=True)

        # 최근 학습 현황 (모든 회차에서 최신 20개)
        recent_rows = db.execute(
            select(
                StudyLog.studied_at,
                StudyLog.difficulty_level,
                StudyLog.vocab_id,
                StudyLog.cycle_no,
                Vocab.day,
                Vocab.topic,
                StudyLog.result,
                Vocab.word,
            )
            .outerjoin(Vocab, Vocab.id == StudyLog.vocab_id)  # LEFT JOIN으로 변경
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
                    StudyLog.vocab_id.is_not(None),
                )
            )
            .order_by(StudyLog.studied_at.desc())
            .limit(20)  # 최신 20개로 제한
        ).all()

        # word가 None이면 기본값 제공 (LEFT JOIN으로 이미 가져왔으므로 추가 쿼리 불필요)
        recent_study: list[RecentStudyOut] = []
        for (ts, dl, vocab_id, cycle_no, day, topic, res, word) in recent_rows:
            recent_study.append(
                RecentStudyOut(
                    studied_at=ts,
                    difficulty_level=dl,
                    vocab_id=vocab_id,
                    cycle_no=cycle_no,
                    day=day,
                    topic=topic,
                    result=res,
                    word=str(word) if word is not None else f"Day{day}단어",
            )
        )
        
        # Count perfect words from ALL previous cycles with latest results (matching study page logic)
        if cycle.cycle_no > 1:
            # Use Raw SQL for consistency with other endpoints
            perfect_words_query = text("""
                SELECT DISTINCT vocab_id
                FROM (
                    SELECT vocab_id, result
                    FROM study_logs sl
                    WHERE sl.user_id = :user_id 
                      AND sl.difficulty_level = :difficulty_level
                      AND sl.studied_at = (
                          SELECT MAX(studied_at)
                          FROM study_logs
                          WHERE user_id = :user_id 
                            AND vocab_id = sl.vocab_id
                            AND difficulty_level = :difficulty_level
                      )
                ) AS latest_results
                WHERE latest_results.result = 'perfect'
            """)
            
            perfect_words_result = db.execute(perfect_words_query, {
                "user_id": user_id,
                "cycle_no": cycle.cycle_no,
                "difficulty_level": level
            }).fetchall()
            
            if str(level) == "800":
                perfect_vocab_ids = [row[0] for row in perfect_words_result]
                perfect_vocab_words = []
                if perfect_vocab_ids:
                    perfect_vocab_words = db.execute(
                        select(Vocab.id, Vocab.word)
                        .where(Vocab.id.in_(perfect_vocab_ids))
                        .order_by(Vocab.id)
                    ).fetchall()
                logger.warning(
                    "[levels-stats debug] user_id=%s level=%s cycle_no=%s previous_cycle_perfect_vocab=%s vocab=%s",
                    user_id,
                    level,
                    cycle.cycle_no,
                    len(perfect_vocab_ids),
                    [(int(v_id), str(word)) for (v_id, word) in perfect_vocab_words],
                )
                print(
                    "[levels-stats debug] user_id=%s level=%s cycle_no=%s previous_cycle_perfect_vocab=%s vocab=%s"
                    % (
                        user_id,
                        level,
                        cycle.cycle_no,
                        len(perfect_vocab_ids),
                        [(int(v_id), str(word)) for (v_id, word) in perfect_vocab_words],
                    )
                )

            previous_cycle_perfect_vocab = len(perfect_words_result)
        else:
            previous_cycle_perfect_vocab = 0

        # 회차별 진도율 계산
        # 1. 현재 회차에서 학습된 단어 수 계산
        current_cycle_progressed = db.execute(
            select(func.count(func.distinct(StudyLog.vocab_id)))
            .where(
                and_(
                    StudyLog.user_id == user_id,
                    StudyLog.difficulty_level == level,
                    StudyLog.cycle_no == cycle.cycle_no,
                )
            )
        ).scalar_one() or 0

        # Exclude-perfect progress requires knowing which vocab were already "perfect" before current cycle.
        prev_final_perfect_count = 0
        prev_final_perfect_studied_in_current_count = 0
        if cycle.cycle_no > 1:
            prev_final_perfect_count_query = text("""
                SELECT COUNT(*)
                FROM (
                    SELECT sl_prev.vocab_id
                    FROM study_logs sl_prev
                    JOIN (
                        SELECT vocab_id, MAX(studied_at) AS max_ts
                        FROM study_logs
                        WHERE user_id = :user_id
                          AND difficulty_level = :difficulty_level
                          AND cycle_no < :current_cycle_no
                        GROUP BY vocab_id
                    ) t
                      ON t.vocab_id = sl_prev.vocab_id
                     AND t.max_ts = sl_prev.studied_at
                    WHERE sl_prev.user_id = :user_id
                      AND sl_prev.difficulty_level = :difficulty_level
                      AND sl_prev.cycle_no < :current_cycle_no
                      AND sl_prev.result = 'perfect'
                ) p
            """)

            prev_final_perfect_count = (
                db.execute(
                    prev_final_perfect_count_query,
                    {
                        "user_id": user_id,
                        "difficulty_level": level,
                        "current_cycle_no": cycle.cycle_no,
                    },
                ).scalar_one()
                or 0
            )

            prev_final_perfect_studied_in_current_query = text("""
                SELECT COUNT(DISTINCT sl_current.vocab_id)
                FROM study_logs sl_current
                JOIN (
                    SELECT sl_prev.vocab_id
                    FROM study_logs sl_prev
                    JOIN (
                        SELECT vocab_id, MAX(studied_at) AS max_ts
                        FROM study_logs
                        WHERE user_id = :user_id
                          AND difficulty_level = :difficulty_level
                          AND cycle_no < :current_cycle_no
                        GROUP BY vocab_id
                    ) t
                      ON t.vocab_id = sl_prev.vocab_id
                     AND t.max_ts = sl_prev.studied_at
                    WHERE sl_prev.user_id = :user_id
                      AND sl_prev.difficulty_level = :difficulty_level
                      AND sl_prev.cycle_no < :current_cycle_no
                      AND sl_prev.result = 'perfect'
                ) prev_perfect
                  ON prev_perfect.vocab_id = sl_current.vocab_id
                WHERE sl_current.user_id = :user_id
                  AND sl_current.difficulty_level = :difficulty_level
                  AND sl_current.cycle_no = :current_cycle_no
            """)

            prev_final_perfect_studied_in_current_count = (
                db.execute(
                    prev_final_perfect_studied_in_current_query,
                    {
                        "user_id": user_id,
                        "difficulty_level": level,
                        "current_cycle_no": cycle.cycle_no,
                    },
                ).scalar_one()
                or 0
            )

        # Get final results for completion rate (regardless of cycle)
        final_perfect_query = text("""
            SELECT COUNT(DISTINCT v.id)
            FROM vocab v
            JOIN (
                SELECT vocab_id, result, studied_at
                FROM study_logs sl_final
                WHERE sl_final.user_id = :user_id 
                  AND sl_final.difficulty_level = :difficulty_level
                  AND sl_final.studied_at = (
                      SELECT MAX(studied_at)
                      FROM study_logs
                      WHERE user_id = :user_id 
                        AND vocab_id = sl_final.vocab_id
                        AND difficulty_level = :difficulty_level
                  )
            ) AS final_results ON v.id = final_results.vocab_id
            WHERE v.difficulty_level = :difficulty_level
              AND final_results.result = 'perfect'
        """)
        
        final_perfect_result = db.execute(final_perfect_query, {
            "user_id": user_id,
            "difficulty_level": level
        }).scalar_one() or 0

        # We use StudyLog distinct vocab count for "현재 회차에서 학습한 단어건수"
        current_cycle_studied_result = int(current_cycle_progressed)

        # Denominator for exclude-perfect: total vocab - (prev cycles final perfect vocab)
        not_perfect_final_result = max(0, int(total_vocab) - int(prev_final_perfect_count))

        # Calculate completion rate (always based on final perfect words)
        if int(total_vocab) > 0:
            completion_rate = int((final_perfect_result / int(total_vocab)) * 100)
        else:
            completion_rate = 0

        # Progress (학습률)
        # 1) excludePerfect OFF
        #    - denom: total vocab
        #    - numer: current cycle studied vocab count
        # 2) excludePerfect ON
        #    - denom: total vocab - (prev cycles final perfect vocab count)
        #    - numer: (current cycle studied vocab count) - (those studied in current cycle but already perfect before)
        include_progress_pct = int((current_cycle_studied_result / int(total_vocab)) * 100) if int(total_vocab) > 0 else 0

        exclude_numerator = max(0, int(current_cycle_studied_result) - int(prev_final_perfect_studied_in_current_count))
        exclude_progress_pct = int((exclude_numerator / int(not_perfect_final_result)) * 100) if int(not_perfect_final_result) > 0 else 0

        # Keep total/perfect counts stable regardless of exclude_perfect;
        # only progress fields change.
        day_progress_pct = include_progress_pct
        current_cycle_progress_pct = exclude_progress_pct

        # For UI convenience: use current_cycle_total_words as exclude denominator
        # and current_cycle_progressed_words as exclude numerator.
        current_cycle_total = int(not_perfect_final_result)
        current_cycle_progressed = int(exclude_numerator)

        perfect_vocab = int(final_perfect_result)
        
        # Safety: ensure all required fields have defaults
        day_progress_pct = int(day_progress_pct) if day_progress_pct is not None else 0
        current_cycle_progress_pct = int(current_cycle_progress_pct) if current_cycle_progress_pct is not None else 0
        completed_days = int(completed_days) if completed_days is not None else 0
        max_day = int(max_day) if max_day is not None else 30
        memorization_pct = int(memorization_pct) if memorization_pct is not None else 0
        current_cycle_total = int(current_cycle_total) if current_cycle_total is not None else 0
        current_cycle_progressed = int(current_cycle_progressed) if current_cycle_progressed is not None else 0
        total_vocab = int(total_vocab) if total_vocab is not None else 0
        perfect_vocab = int(perfect_vocab) if perfect_vocab is not None else 0
        previous_cycle_perfect_vocab = int(previous_cycle_perfect_vocab) if previous_cycle_perfect_vocab is not None else 0

        levels_out.append(
            LevelStatsOut(
                difficulty_level=level,
                cycle_no=cycle.cycle_no,
                completed_days=int(completed_days),
                total_days=max_day,
                day_progress_pct=int(day_progress_pct),
                total_vocab=int(total_vocab),
                perfect_vocab=int(perfect_vocab),
                previous_cycle_perfect_vocab=int(previous_cycle_perfect_vocab),
                memorization_pct=int(memorization_pct),
                current_cycle_progressed_words=current_cycle_progressed,
                current_cycle_total_words=current_cycle_total,
                current_cycle_progress_pct=current_cycle_progress_pct,
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
    perfect_words = 0

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

        # Count perfect words from ALL previous cycles with latest results (matching study page logic)
        if cycle.cycle_no > 1:
            # Use Raw SQL for consistency with level stats
            perfect_words_query = text("""
                SELECT DISTINCT vocab_id 
                FROM study_logs sl
                JOIN vocab v ON v.id = sl.vocab_id
                WHERE sl.user_id = :user_id 
                  AND sl.cycle_no < :cycle_no 
                  AND sl.difficulty_level = :difficulty_level 
                  AND v.day = :day_val
                  AND sl.result = 'perfect'
                  AND sl.cycle_no = (
                      SELECT MAX(cycle_no)
                      FROM study_logs sl2
                      JOIN vocab v2 ON v2.id = sl2.vocab_id
                      WHERE sl2.user_id = :user_id 
                        AND sl2.vocab_id = sl.vocab_id
                        AND sl2.cycle_no < :cycle_no 
                        AND sl2.difficulty_level = :difficulty_level
                        AND sl2.result = 'perfect'
                  )
            """)
            
            perfect_words_result = db.execute(perfect_words_query, {
                "user_id": user_id,
                "cycle_no": cycle.cycle_no,
                "difficulty_level": difficulty_level,
                "day_val": day_val
            }).fetchall()
            
            perfect_words = len(perfect_words_result)
        else:
            perfect_words = 0  # No previous cycle

    progress_pct = 0
    if int(total_words) > 0:
        progress_pct = int((int(progressed_words) / int(total_words)) * 100)

    return CurrentDayProgressOut(
        difficulty_level=difficulty_level,
        cycle_no=cycle.cycle_no,
        day=day_val,
        total_words=int(total_words),
        progressed_words=int(progressed_words),
        perfect_words=int(perfect_words),
        progress_pct=int(progress_pct),
    )


# 새로운 리마인드 세션 API
def _get_remind_words_from_range(db, user_id, difficulty_level, cycle_no, start_day, end_day):
    """특정 Day 범위와 회차에서 perfect가 아닌 단어들을 추출하는 헬퍼 함수 (again 우선)"""
    # perfect가 아닌 단어들 찾기 (최종 결과가 perfect가 아닌 단어)
    latest_ts_subq = (
        select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.cycle_no == cycle_no,
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

    # again 단어들 우선 선택 (result == 'again')
    again_vocab_stmt = (
        select(Vocab, latest_logs_subq.c.result)
        .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                Vocab.day.is_not(None),
                Vocab.day >= start_day,
                Vocab.day <= end_day,
                latest_logs_subq.c.result == "again",
            )
        )
        .order_by(Vocab.day.asc(), Vocab.id.asc())
    )

    # good 단어들 선택 (result == 'good')
    good_vocab_stmt = (
        select(Vocab, latest_logs_subq.c.result)
        .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                Vocab.day.is_not(None),
                Vocab.day >= start_day,
                Vocab.day <= end_day,
                latest_logs_subq.c.result == "good",
            )
        )
        .order_by(Vocab.day.asc(), Vocab.id.asc())
    )

    # again 단어들 먼저, good 단어들 나중에 합쳐서 반환
    again_words = db.execute(again_vocab_stmt).all()
    good_words = db.execute(good_vocab_stmt).all()
    
    return again_words + good_words


def _get_remind_words_from_range_with_result(db, user_id, difficulty_level, cycle_no, start_day, end_day, result_value):
    """특정 Day 범위와 회차에서 최신 결과가 특정 값(result_value)인 단어들을 추출하는 헬퍼 함수"""
    latest_ts_subq = (
        select(StudyLog.vocab_id.label("vocab_id"), func.max(StudyLog.studied_at).label("max_ts"))
        .where(
            and_(
                StudyLog.user_id == user_id,
                StudyLog.difficulty_level == difficulty_level,
                StudyLog.cycle_no == cycle_no,
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

    vocab_stmt = (
        select(Vocab, latest_logs_subq.c.result)
        .join(latest_logs_subq, latest_logs_subq.c.vocab_id == Vocab.id)
        .where(
            and_(
                Vocab.difficulty_level == difficulty_level,
                Vocab.day.is_not(None),
                Vocab.day >= start_day,
                Vocab.day <= end_day,
                latest_logs_subq.c.result == result_value,
            )
        )
        .order_by(Vocab.day.asc(), Vocab.id.asc())
    )

    return db.execute(vocab_stmt).all()


@api_router.post("/remind/session/start", response_model=RemindSessionOut)
def start_remind_session(payload: RemindSessionStart, db: Session = Depends(get_db)):
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")

    cycle = _get_or_create_active_cycle(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level)
    _ensure_day_rows(db, user_id=payload.user_id, difficulty_level=payload.difficulty_level, cycle_no=cycle.cycle_no)

    # 마지막으로 학습한 Day를 기준으로 리마인드 범위 설정
    last_studied_day = db.execute(
        select(func.max(Vocab.day))
        .join(StudyLog, Vocab.id == StudyLog.vocab_id)
        .where(
            and_(
                StudyLog.user_id == payload.user_id,
                StudyLog.difficulty_level == payload.difficulty_level,
                StudyLog.cycle_no == cycle.cycle_no,
            )
        )
    ).scalar_one()
    
    # 리마인드 기간 계산 로직 수정
    if last_studied_day is None:
        # 학습 기록이 없으면 현재 열린 Day 사용
        current_day = 1
    else:
        current_day = int(last_studied_day)

    # 현재 Day에 따른 기간 계산
    current_cycle_words = []
    prev_cycle_words = []
    prev_cycle_start = None
    prev_cycle_end = None
    
    if current_day <= 7:
        # 현재 Day가 7 이하인 경우
        # 1) 현재 회차: 1Day ~ 현재 Day
        current_cycle_start = 1
        current_cycle_end = current_day
        
        # 2) 직전 회차: (Max Day - 7 + 현재 Day) ~ Max Day
        if cycle.cycle_no > 1:
            # 직전 회차의 최대 Day 조회
            prev_cycle_max_day = db.execute(
                select(func.max(Vocab.day))
                .join(StudyLog, Vocab.id == StudyLog.vocab_id)
                .where(
                    and_(
                        StudyLog.user_id == payload.user_id,
                        StudyLog.difficulty_level == payload.difficulty_level,
                        StudyLog.cycle_no == cycle.cycle_no - 1,
                    )
                )
            ).scalar_one_or_none()
            
            if prev_cycle_max_day is not None:
                prev_cycle_start = max(1, int(prev_cycle_max_day) - 7 + current_day)
                prev_cycle_end = int(prev_cycle_max_day)
            else:
                prev_cycle_start = None
                prev_cycle_end = None
        else:
            prev_cycle_start = None
            prev_cycle_end = None
        
        # 두 구간의 단어를 합쳐서 검색
        remind_words = []
        
        # 현재 회차 구간 검색
        current_cycle_words = _get_remind_words_from_range(
            db, payload.user_id, payload.difficulty_level, cycle.cycle_no,
            current_cycle_start, current_cycle_end
        )
        remind_words.extend(current_cycle_words)

        current_cycle_again_words = _get_remind_words_from_range_with_result(
            db, payload.user_id, payload.difficulty_level, cycle.cycle_no,
            current_cycle_start, current_cycle_end, "again"
        )
        
        # 직전 회차 구간 검색
        if prev_cycle_start is not None and prev_cycle_end is not None:
            prev_cycle_words = _get_remind_words_from_range(
                db, payload.user_id, payload.difficulty_level, cycle.cycle_no - 1,
                prev_cycle_start, prev_cycle_end
            )
            remind_words.extend(prev_cycle_words)

            prev_cycle_again_words = _get_remind_words_from_range_with_result(
                db, payload.user_id, payload.difficulty_level, cycle.cycle_no - 1,
                prev_cycle_start, prev_cycle_end, "again"
            )
        else:
            prev_cycle_again_words = []

        # again(몰라요) 단어는 세션 내에서 1회 추가 출제되도록, 최초 세션 확정 시 words 뒤에 한 번 더 추가
        remind_words.extend(current_cycle_again_words)
        remind_words.extend(prev_cycle_again_words)
        
        rows = remind_words
        
    else:
        # 현재 Day가 7 초과인 경우: 현재 회차의 (현재 Day - 7) ~ 현재 Day
        start_day = current_day - 7
        end_day = current_day
        
        rows = _get_remind_words_from_range(
            db, payload.user_id, payload.difficulty_level, cycle.cycle_no,
            start_day, end_day
        )

        again_rows = _get_remind_words_from_range_with_result(
            db, payload.user_id, payload.difficulty_level, cycle.cycle_no,
            start_day, end_day, "again"
        )

        # again(몰라요) 단어는 세션 내에서 1회 추가 출제되도록, 최초 세션 확정 시 words 뒤에 한 번 더 추가
        rows.extend(again_rows)

    if not rows:
        # 리마인드할 단어가 없는 경우 확인
        if current_day <= 7:
            # 현재 Day가 7 이하인 경우: 두 구간 모두 확인
            message_parts = []
            if not current_cycle_words:
                message_parts.append(f"현재 회차(Day 1~{current_day})")
            if prev_cycle_start is None or not prev_cycle_words:
                message_parts.append("직전 회차")
            
            if message_parts:
                raise HTTPException(
                    status_code=404, 
                    detail=f"{', '.join(message_parts)}에서 리마인드할 단어가 없습니다. 모든 단어를 완벽하게 마쳤거나 학습 기록이 없습니다."
                )
        else:
            # 현재 Day가 7 초과인 경우
            raise HTTPException(
                status_code=404, 
                detail=f"Day {start_day}~{end_day} 구간에서 리마인드할 단어가 없습니다. 모든 단어를 완벽하게 마쳤습니다."
            )

    # 세션 생성
    session_id = str(uuid.uuid4())
    words = []
    for vocab, result in rows:
        words.append({
            "vocab_id": vocab.id,
            "word": vocab.word,
            "meaning": vocab.meaning,
            "day": vocab.day,
            "last_result": result,
        })

    session_data = {
        "session_id": session_id,
        "user_id": payload.user_id,
        "difficulty_level": payload.difficulty_level,
        "total_words": len(words),
        "current_index": 0,
        "completed_count": 0,
        "words": words,
        "start_time": datetime.utcnow()
    }
    
    remind_sessions[session_id] = session_data

    return RemindSessionOut(
        session_id=session_id,
        total_words=len(words),
        current_index=0,
        completed_count=0,
        words=words
    )


@api_router.post("/user/update-email")
def update_user_email(
    user_id: int = Body(...),
    new_email: str = Body(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    
    # Check if email column exists in database
    try:
        # Check if email is already in use by another user
        existing_user = db.execute(
            select(User).where(User.email == new_email)
        ).scalar_one_or_none()
        
        if existing_user and existing_user.id != user_id:
            raise HTTPException(status_code=400, detail="이미 사용 중인 이메일 주소입니다")
        
        # Update email
        user.email = new_email
        db.add(user)
        db.commit()
        
        return {"message": "이메일 주소가 성공적으로 변경되었습니다"}
    except Exception as e:
        # If email column doesn't exist, return a mock success
        if "column" in str(e).lower() and "email" in str(e).lower():
            return {"message": "이메일 주소가 성공적으로 변경되었습니다 (시뮬레이션)"}
        raise e


@api_router.get("/user/last-studied-level")
def get_last_studied_level(
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    # Get the most recent study log for this user
    last_study = db.execute(
        select(StudyLog.difficulty_level)
        .where(StudyLog.user_id == user_id)
        .order_by(StudyLog.studied_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    
    if last_study:
        return {"last_studied_level": last_study}
    
    # If no study logs, return current level or default
    user = db.get(User, user_id)
    if user:
        return {"last_studied_level": user.current_level or "800"}
    
    return {"last_studied_level": "800"}


@api_router.post("/user/update-password")
def update_user_password(
    user_id: int = Body(...),
    current_password: str = Body(...),
    new_password: str = Body(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    
    # Verify current password
    if not user.verify_password(current_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다")
    
    # Update password
    user.set_password(new_password)
    db.add(user)
    db.commit()
    
    return {"message": "비밀번호가 성공적으로 변경되었습니다"}


@api_router.get("/remind/session/{session_id}/next", response_model=RemindCardOut)
def get_next_remind_card(session_id: str, db: Session = Depends(get_db)):
    if session_id not in remind_sessions:
        raise HTTPException(status_code=404, detail="session not found")

    session = remind_sessions[session_id]
    
    if session["current_index"] >= session["total_words"]:
        raise HTTPException(status_code=404, detail="session completed")

    current_word = session["words"][session["current_index"]]
    vocab = db.get(Vocab, current_word["vocab_id"])
    if vocab is None:
        raise HTTPException(status_code=404, detail="vocab not found")

    return RemindCardOut(
        session_id=session_id,
        current_index=session["current_index"],
        total_words=session["total_words"],
        completed_count=session["completed_count"],
        vocab=_vocab_out_with_random_example(db, vocab=vocab),
        is_last=session["current_index"] == session["total_words"] - 1
    )


@api_router.post("/remind/session/{session_id}/submit")
def submit_remind_answer(session_id: str, submission: GradeSubmission = Body(...), db: Session = Depends(get_db)):
    if session_id not in remind_sessions:
        raise HTTPException(status_code=404, detail="session not found")

    session = remind_sessions[session_id]
    current_word = session["words"][session["current_index"]]
    
    # 기존 submit_remind_review 로직 사용
    payload = ReviewIn(
        user_id=session["user_id"],
        vocab_id=current_word["vocab_id"],
        grade=submission.grade
    )
    
    # 기존 리마인드 제출 로직 호출
    submit_remind_review(payload, db)

    # 세션 업데이트
    session["current_index"] += 1
    session["completed_count"] += 1  # 모든 답변을 진행으로 간주
    
    return {"message": "answer submitted", "next_index": session["current_index"]}
