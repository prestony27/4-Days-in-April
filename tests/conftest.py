"""Shared pytest fixtures for Masters Pool tests."""

import pytest
from datetime import datetime, timezone

from lib.models import (
    GolferScore,
    GolferStatus,
    Tier,
    TeamGolferSlot,
    Team,
    TeamStatus,
    PaymentStatus,
    Contestant,
    TournamentState,
    TournamentStatus,
)


# --- Golfer Fixtures ---


@pytest.fixture
def make_golfer():
    """Factory fixture for creating GolferScore instances."""

    def _make(
        espn_id: str = "1",
        name: str = "Test Golfer",
        world_rank: int = 1,
        tier: Tier = Tier.TIER_1,
        score_to_par: int | None = None,
        status: GolferStatus = GolferStatus.IN_PROGRESS,
        round_scores: list | None = None,
        thru: int | None = None,
        position: str | None = None,
        total_strokes: int | None = None,
    ) -> GolferScore:
        return GolferScore(
            espn_id=espn_id,
            name=name,
            world_rank=world_rank,
            tier=tier,
            score_to_par=score_to_par,
            status=status,
            round_scores=round_scores or [],
            thru=thru,
            position=position,
            total_strokes=total_strokes,
        )

    return _make


@pytest.fixture
def tier1_golfer(make_golfer):
    return make_golfer(espn_id="t1", name="Scottie Scheffler", world_rank=1, tier=Tier.TIER_1)


@pytest.fixture
def tier2_golfer_a(make_golfer):
    return make_golfer(espn_id="t2a", name="Collin Morikawa", world_rank=15, tier=Tier.TIER_2)


@pytest.fixture
def tier2_golfer_b(make_golfer):
    return make_golfer(espn_id="t2b", name="Tommy Fleetwood", world_rank=20, tier=Tier.TIER_2)


@pytest.fixture
def tier3_golfer(make_golfer):
    return make_golfer(espn_id="t3", name="Sam Burns", world_rank=35, tier=Tier.TIER_3)


@pytest.fixture
def tier4_golfer(make_golfer):
    return make_golfer(espn_id="t4", name="Nick Dunlap", world_rank=55, tier=Tier.TIER_4)


# --- Team Slot Fixtures ---


@pytest.fixture
def valid_team_slots():
    """A valid set of 5 team golfer slots with correct tier distribution."""
    return [
        TeamGolferSlot(golfer_id="t1", golfer_name="Scottie Scheffler", tier=Tier.TIER_1),
        TeamGolferSlot(golfer_id="t2a", golfer_name="Collin Morikawa", tier=Tier.TIER_2),
        TeamGolferSlot(golfer_id="t2b", golfer_name="Tommy Fleetwood", tier=Tier.TIER_2),
        TeamGolferSlot(golfer_id="t3", golfer_name="Sam Burns", tier=Tier.TIER_3),
        TeamGolferSlot(golfer_id="t4", golfer_name="Nick Dunlap", tier=Tier.TIER_4),
    ]


@pytest.fixture
def make_team_slot():
    """Factory for creating TeamGolferSlot instances."""

    def _make(golfer_id: str = "g1", golfer_name: str = "Golfer", tier: Tier = Tier.TIER_1):
        return TeamGolferSlot(golfer_id=golfer_id, golfer_name=golfer_name, tier=tier)

    return _make


# --- Team Fixtures ---


@pytest.fixture
def valid_team(valid_team_slots):
    """A valid team with correct tier composition."""
    return Team(
        id="team-1",
        contestant_id="contestant-1",
        team_name="Test Team",
        golfers=valid_team_slots,
        status=TeamStatus.ACTIVE,
        payment_status=PaymentStatus.COMPLETED,
    )


@pytest.fixture
def make_team(make_team_slot):
    """Factory fixture for creating Team instances."""

    def _make(
        id: str = "team-1",
        contestant_id: str = "contestant-1",
        team_name: str = "Test Team",
        golfers: list[TeamGolferSlot] | None = None,
        status: TeamStatus = TeamStatus.ACTIVE,
        payment_status: PaymentStatus = PaymentStatus.COMPLETED,
    ) -> Team:
        if golfers is None:
            golfers = [
                make_team_slot("t1", "Golfer 1", Tier.TIER_1),
                make_team_slot("t2a", "Golfer 2", Tier.TIER_2),
                make_team_slot("t2b", "Golfer 3", Tier.TIER_2),
                make_team_slot("t3", "Golfer 4", Tier.TIER_3),
                make_team_slot("t4", "Golfer 5", Tier.TIER_4),
            ]
        return Team(
            id=id,
            contestant_id=contestant_id,
            team_name=team_name,
            golfers=golfers,
            status=status,
            payment_status=payment_status,
        )

    return _make


# --- Contestant Fixtures ---


@pytest.fixture
def contestant():
    return Contestant(id="contestant-1", email="test@example.com", name="Test User")


# --- Tournament State Fixtures ---


@pytest.fixture
def pre_tournament_state():
    return TournamentState(
        current_round=0,
        tournament_status=TournamentStatus.PRE_TOURNAMENT,
        submissions_open=True,
    )


@pytest.fixture
def mid_tournament_state():
    return TournamentState(
        current_round=2,
        tournament_status=TournamentStatus.IN_PROGRESS,
        submissions_open=False,
        last_score_update=datetime.now(timezone.utc),
    )


@pytest.fixture
def post_cut_state():
    return TournamentState(
        current_round=3,
        tournament_status=TournamentStatus.IN_PROGRESS,
        submissions_open=False,
        cut_line=4,  # +4 to par
        last_score_update=datetime.now(timezone.utc),
    )
