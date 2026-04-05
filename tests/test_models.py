"""Tests for Pydantic data models in lib/models.py."""

import pytest
from lib.models import (
    GolferScore,
    GolferStatus,
    Tier,
    TeamGolferSlot,
    Team,
    TeamStatus,
    PaymentStatus,
    TournamentState,
    TournamentStatus,
)


class TestGolferScore:
    """Tests for the GolferScore model and its properties."""

    def test_golfer_creation(self, make_golfer):
        g = make_golfer(espn_id="123", name="Tiger Woods", world_rank=5, tier=Tier.TIER_1)
        assert g.espn_id == "123"
        assert g.name == "Tiger Woods"
        assert g.world_rank == 5
        assert g.tier == Tier.TIER_1

    def test_default_status_is_in_progress(self, make_golfer):
        g = make_golfer()
        assert g.status == GolferStatus.IN_PROGRESS

    def test_made_cut_true_when_active(self, make_golfer):
        g = make_golfer(status=GolferStatus.IN_PROGRESS)
        assert g.made_cut is True

    def test_made_cut_true_when_final(self, make_golfer):
        g = make_golfer(status=GolferStatus.FINAL)
        assert g.made_cut is True

    def test_made_cut_false_when_cut(self, make_golfer):
        g = make_golfer(status=GolferStatus.CUT)
        assert g.made_cut is False

    def test_is_active_in_progress(self, make_golfer):
        g = make_golfer(status=GolferStatus.IN_PROGRESS)
        assert g.is_active is True

    def test_is_active_final(self, make_golfer):
        g = make_golfer(status=GolferStatus.FINAL)
        assert g.is_active is True

    def test_is_active_suspended(self, make_golfer):
        g = make_golfer(status=GolferStatus.SUSPENDED)
        assert g.is_active is True

    def test_is_active_false_when_cut(self, make_golfer):
        g = make_golfer(status=GolferStatus.CUT)
        assert g.is_active is False

    def test_is_active_false_when_withdrawn(self, make_golfer):
        g = make_golfer(status=GolferStatus.WITHDRAWN)
        assert g.is_active is False

    def test_is_active_false_when_dq(self, make_golfer):
        g = make_golfer(status=GolferStatus.DISQUALIFIED)
        assert g.is_active is False

    def test_is_eliminated_withdrawn(self, make_golfer):
        """WD golfer should cause team disqualification per rule 2."""
        g = make_golfer(status=GolferStatus.WITHDRAWN)
        assert g.is_eliminated is True

    def test_is_eliminated_disqualified(self, make_golfer):
        """DQ golfer should cause team disqualification per rule 2."""
        g = make_golfer(status=GolferStatus.DISQUALIFIED)
        assert g.is_eliminated is True

    def test_is_eliminated_false_for_cut(self, make_golfer):
        """CUT golfer does NOT eliminate team - score just freezes (rule 2)."""
        g = make_golfer(status=GolferStatus.CUT)
        assert g.is_eliminated is False

    def test_is_eliminated_false_for_active(self, make_golfer):
        g = make_golfer(status=GolferStatus.IN_PROGRESS)
        assert g.is_eliminated is False

    def test_round_scores_default_empty(self, make_golfer):
        g = make_golfer()
        assert g.round_scores == []

    def test_round_scores_with_data(self, make_golfer):
        g = make_golfer(round_scores=[68, 70, None, None])
        assert g.round_scores == [68, 70, None, None]


class TestTierEnum:
    """Tests for the Tier enum values."""

    def test_tier_values(self):
        assert Tier.TIER_1 == 1
        assert Tier.TIER_2 == 2
        assert Tier.TIER_3 == 3
        assert Tier.TIER_4 == 4


class TestGolferStatusEnum:
    """Tests for GolferStatus mapping to ESPN status values."""

    def test_espn_status_values(self):
        assert GolferStatus.IN_PROGRESS == "STATUS_IN_PROGRESS"
        assert GolferStatus.FINAL == "STATUS_FINAL"
        assert GolferStatus.CUT == "STATUS_CUT"
        assert GolferStatus.WITHDRAWN == "STATUS_WITHDRAWN"
        assert GolferStatus.DISQUALIFIED == "STATUS_DISQUALIFIED"
        assert GolferStatus.SUSPENDED == "STATUS_SUSPENDED"


class TestTeamTierComposition:
    """Tests for Team.validate_tier_composition() per Rule 1.

    Rule 1: 1 from rank 1-10 (T1), 2 from 11-30 (T2), 1 from 31-50 (T3), 1 from 51+ (T4).
    """

    def test_valid_composition(self, valid_team):
        assert valid_team.validate_tier_composition() is True

    def test_missing_tier1(self, make_team, make_team_slot):
        """Team with no Tier 1 golfer should fail."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_2),  # should be T1
            make_team_slot("g2", "B", Tier.TIER_2),
            make_team_slot("g3", "C", Tier.TIER_2),
            make_team_slot("g4", "D", Tier.TIER_3),
            make_team_slot("g5", "E", Tier.TIER_4),
        ])
        assert team.validate_tier_composition() is False

    def test_too_many_tier1(self, make_team, make_team_slot):
        """Team with 2 Tier 1 golfers should fail."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_1),
            make_team_slot("g2", "B", Tier.TIER_1),
            make_team_slot("g3", "C", Tier.TIER_2),
            make_team_slot("g4", "D", Tier.TIER_3),
            make_team_slot("g5", "E", Tier.TIER_4),
        ])
        assert team.validate_tier_composition() is False

    def test_only_one_tier2(self, make_team, make_team_slot):
        """Team with only 1 Tier 2 golfer should fail (need 2)."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_1),
            make_team_slot("g2", "B", Tier.TIER_2),
            make_team_slot("g3", "C", Tier.TIER_3),
            make_team_slot("g4", "D", Tier.TIER_3),
            make_team_slot("g5", "E", Tier.TIER_4),
        ])
        assert team.validate_tier_composition() is False

    def test_three_tier2(self, make_team, make_team_slot):
        """Team with 3 Tier 2 golfers should fail."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_1),
            make_team_slot("g2", "B", Tier.TIER_2),
            make_team_slot("g3", "C", Tier.TIER_2),
            make_team_slot("g4", "D", Tier.TIER_2),
            make_team_slot("g5", "E", Tier.TIER_4),
        ])
        assert team.validate_tier_composition() is False

    def test_missing_tier4(self, make_team, make_team_slot):
        """Team with no Tier 4 golfer should fail."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_1),
            make_team_slot("g2", "B", Tier.TIER_2),
            make_team_slot("g3", "C", Tier.TIER_2),
            make_team_slot("g4", "D", Tier.TIER_3),
            make_team_slot("g5", "E", Tier.TIER_3),
        ])
        assert team.validate_tier_composition() is False

    def test_all_same_tier(self, make_team, make_team_slot):
        """Team with all golfers from same tier should fail."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_2),
            make_team_slot("g2", "B", Tier.TIER_2),
            make_team_slot("g3", "C", Tier.TIER_2),
            make_team_slot("g4", "D", Tier.TIER_2),
            make_team_slot("g5", "E", Tier.TIER_2),
        ])
        assert team.validate_tier_composition() is False

    def test_empty_golfers(self, make_team):
        """Team with no golfers should fail."""
        team = make_team(golfers=[])
        assert team.validate_tier_composition() is False


class TestTeamTierAccessors:
    """Tests for tier-specific golfer accessor properties."""

    def test_tier_1_golfer(self, valid_team):
        g = valid_team.tier_1_golfer
        assert g is not None
        assert g.tier == Tier.TIER_1
        assert g.golfer_name == "Scottie Scheffler"

    def test_tier_2_golfers(self, valid_team):
        golfers = valid_team.tier_2_golfers
        assert len(golfers) == 2
        assert all(g.tier == Tier.TIER_2 for g in golfers)

    def test_tier_3_golfer(self, valid_team):
        g = valid_team.tier_3_golfer
        assert g is not None
        assert g.tier == Tier.TIER_3

    def test_tier_4_golfer(self, valid_team):
        g = valid_team.tier_4_golfer
        assert g is not None
        assert g.tier == Tier.TIER_4

    def test_missing_tier_returns_none(self, make_team, make_team_slot):
        """If a tier is missing, accessor should return None."""
        team = make_team(golfers=[
            make_team_slot("g1", "A", Tier.TIER_2),
            make_team_slot("g2", "B", Tier.TIER_2),
        ])
        assert team.tier_1_golfer is None
        assert team.tier_3_golfer is None
        assert team.tier_4_golfer is None


class TestTeamStatus:
    """Tests for team status and payment status."""

    def test_default_status_active(self, valid_team):
        team = Team(
            contestant_id="c1",
            team_name="T",
            golfers=valid_team.golfers,
        )
        assert team.status == TeamStatus.ACTIVE

    def test_default_payment_pending(self, valid_team):
        team = Team(
            contestant_id="c1",
            team_name="T",
            golfers=valid_team.golfers,
        )
        assert team.payment_status == PaymentStatus.PENDING

    def test_total_score_default_none(self, valid_team):
        team = Team(
            contestant_id="c1",
            team_name="T",
            golfers=valid_team.golfers,
        )
        assert team.total_score is None


class TestTournamentState:
    """Tests for TournamentState model."""

    def test_pre_tournament_defaults(self, pre_tournament_state):
        assert pre_tournament_state.current_round == 0
        assert pre_tournament_state.tournament_status == TournamentStatus.PRE_TOURNAMENT
        assert pre_tournament_state.submissions_open is True
        assert pre_tournament_state.cut_line is None

    def test_mid_tournament(self, mid_tournament_state):
        assert mid_tournament_state.current_round == 2
        assert mid_tournament_state.tournament_status == TournamentStatus.IN_PROGRESS
        assert mid_tournament_state.submissions_open is False

    def test_post_cut(self, post_cut_state):
        assert post_cut_state.cut_line == 4
        assert post_cut_state.current_round == 3
