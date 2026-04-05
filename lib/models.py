"""Pydantic models shared between the backend API and data layer."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---


class GolferStatus(str, Enum):
    IN_PROGRESS = "STATUS_IN_PROGRESS"
    FINAL = "STATUS_FINAL"
    CUT = "STATUS_CUT"
    WITHDRAWN = "STATUS_WITHDRAWN"
    DISQUALIFIED = "STATUS_DISQUALIFIED"
    SUSPENDED = "STATUS_SUSPENDED"


class TournamentStatus(str, Enum):
    PRE_TOURNAMENT = "pre_tournament"
    IN_PROGRESS = "in_progress"
    SUSPENDED = "suspended"
    COMPLETE = "complete"


class Tier(int, Enum):
    """World Golf Ranking tiers for team construction."""

    TIER_1 = 1  # WGR 1-10: pick 1
    TIER_2 = 2  # WGR 11-30: pick 2
    TIER_3 = 3  # WGR 31-50: pick 1
    TIER_4 = 4  # WGR 51+: pick 1


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REFUNDED = "refunded"


class TeamStatus(str, Enum):
    ACTIVE = "active"
    DISQUALIFIED = "disqualified"


# --- Golfer ---


class GolferScore(BaseModel):
    """A golfer's current tournament state, parsed from ESPN or other source."""

    espn_id: str
    name: str
    world_rank: Optional[int] = None
    tier: Optional[Tier] = None
    position: Optional[str] = None  # "1", "T2", "T15"
    score_to_par: Optional[int] = None  # -14, +2, 0 (E)
    thru: Optional[int] = None  # Holes completed in current round
    status: GolferStatus = GolferStatus.IN_PROGRESS
    round_scores: list[Optional[int]] = Field(default_factory=list)  # [66, 64, None, None]
    total_strokes: Optional[int] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def made_cut(self) -> bool:
        return self.status != GolferStatus.CUT

    @property
    def is_active(self) -> bool:
        return self.status in (GolferStatus.IN_PROGRESS, GolferStatus.FINAL, GolferStatus.SUSPENDED)

    @property
    def is_eliminated(self) -> bool:
        """True if golfer WD or DQ — causes team disqualification."""
        return self.status in (GolferStatus.WITHDRAWN, GolferStatus.DISQUALIFIED)


# --- Contestant & Team ---


class Contestant(BaseModel):
    """A person entering the pool."""

    id: Optional[str] = None
    email: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TeamGolferSlot(BaseModel):
    """A single golfer slot in a team, with tier assignment."""

    golfer_id: str  # espn_id
    golfer_name: str
    tier: Tier


class Team(BaseModel):
    """A submitted team of 5 golfers across tiers."""

    id: Optional[str] = None
    contestant_id: str
    team_name: str
    golfers: list[TeamGolferSlot]  # exactly 5
    total_score: Optional[int] = None  # sum of golfer scores to par
    status: TeamStatus = TeamStatus.ACTIVE
    payment_status: PaymentStatus = PaymentStatus.PENDING
    payment_id: Optional[str] = None  # Stripe payment ID
    submitted_at: datetime = Field(default_factory=datetime.utcnow)

    def validate_tier_composition(self) -> bool:
        """Verify the team has correct tier distribution: 1 from T1, 2 from T2, 1 from T3, 1 from T4."""
        tier_counts = {}
        for g in self.golfers:
            tier_counts[g.tier] = tier_counts.get(g.tier, 0) + 1
        return (
            tier_counts.get(Tier.TIER_1, 0) == 1
            and tier_counts.get(Tier.TIER_2, 0) == 2
            and tier_counts.get(Tier.TIER_3, 0) == 1
            and tier_counts.get(Tier.TIER_4, 0) == 1
        )

    @property
    def tier_1_golfer(self) -> Optional[TeamGolferSlot]:
        return next((g for g in self.golfers if g.tier == Tier.TIER_1), None)

    @property
    def tier_2_golfers(self) -> list[TeamGolferSlot]:
        return [g for g in self.golfers if g.tier == Tier.TIER_2]

    @property
    def tier_3_golfer(self) -> Optional[TeamGolferSlot]:
        return next((g for g in self.golfers if g.tier == Tier.TIER_3), None)

    @property
    def tier_4_golfer(self) -> Optional[TeamGolferSlot]:
        return next((g for g in self.golfers if g.tier == Tier.TIER_4), None)


# --- Tournament State ---


class TournamentState(BaseModel):
    """Single-row table tracking overall tournament status."""

    current_round: int = 0  # 0 = pre-tournament, 1-4 during play
    tournament_status: TournamentStatus = TournamentStatus.PRE_TOURNAMENT
    submissions_open: bool = True
    cut_line: Optional[int] = None  # Score to par where cut falls
    last_score_update: Optional[datetime] = None
