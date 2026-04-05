"""Tests for score calculation logic in lib/scoring.py per Rules.md.

Rule 2: Scores of a contestant's five golfers are added together.
  - Lowest team score wins.
  - Missed cut: golfer's score freezes at R2 total (still counted).
  - DQ/WD after starting: ENTIRE TEAM is disqualified.

Rule 8 Tiebreakers:
  - 1st: Lower score from 51+ ranked golfer.
  - 2nd: Lower combined score from two 11-30 ranked golfers.
  - Still tied: Split prize money.
"""

import pytest
from lib.models import (
    GolferScore,
    GolferStatus,
    Tier,
    TeamGolferSlot,
    Team,
    TeamStatus,
)
from lib.scoring import calculate_team_score, rank_teams, check_team_disqualification


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scored_golfer(
    espn_id: str,
    name: str,
    tier: Tier,
    score_to_par: int | None,
    status: GolferStatus = GolferStatus.FINAL,
) -> GolferScore:
    return GolferScore(
        espn_id=espn_id,
        name=name,
        tier=tier,
        score_to_par=score_to_par,
        status=status,
    )


def _make_team_and_scores(
    golfer_data: list[tuple[str, str, Tier, int | None, GolferStatus]],
    team_id: str = "team-1",
) -> tuple[Team, dict[str, GolferScore]]:
    """Build a Team + golfer score lookup from compact tuples.

    Each tuple: (espn_id, name, tier, score_to_par, status)
    """
    slots = [
        TeamGolferSlot(golfer_id=t[0], golfer_name=t[1], tier=t[2])
        for t in golfer_data
    ]
    team = Team(
        id=team_id,
        contestant_id="contestant-1",
        team_name=f"Team {team_id}",
        golfers=slots,
    )
    scores = {
        t[0]: _scored_golfer(t[0], t[1], t[2], t[3], t[4])
        for t in golfer_data
    }
    return team, scores


# ---------------------------------------------------------------------------
# calculate_team_score tests
# ---------------------------------------------------------------------------


class TestCalculateTeamScore:
    """Tests for calculate_team_score()."""

    def test_all_golfers_under_par(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == -15
        assert result.is_disqualified is False

    def test_mixed_over_under_par(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -8, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, 2, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -1, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, 0, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, 5, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == -2

    def test_all_even_par(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, 0, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, 0, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, 0, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, 0, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, 0, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == 0

    def test_all_over_par(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, 3, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, 4, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, 2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, 6, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, 1, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == 16

    def test_tiebreaker_values_populated(self):
        """Verify tier4_score and tier2_combined_score are correctly extracted."""
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.tier4_score == -4
        assert result.tier2_combined_score == -5  # -3 + -2


class TestMissedCutScoring:
    """Rule 2: Missed cut — score freezes, still counted, team NOT disqualified."""

    def test_cut_golfer_score_counted(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, 4, GolferStatus.CUT),  # missed cut at +4
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == -7  # -5 + -3 + 4 + -1 + -2
        assert result.is_disqualified is False

    def test_multiple_cut_golfers(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, 6, GolferStatus.CUT),
            ("g3", "C", Tier.TIER_2, 3, GolferStatus.CUT),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, 2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == 5
        assert result.is_disqualified is False


class TestDQWDDisqualification:
    """Rule 2: DQ or WD after starting → entire team disqualified."""

    def test_withdrawn_disqualifies_team(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, None, GolferStatus.WITHDRAWN),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.is_disqualified is True
        assert result.total_score is None

    def test_dq_disqualifies_team(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, None, GolferStatus.DISQUALIFIED),
            ("g5", "E", Tier.TIER_4, -2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.is_disqualified is True
        assert result.total_score is None

    def test_dq_clears_tiebreaker_values(self):
        """DQ'd teams should have None for tiebreaker fields."""
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.WITHDRAWN),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.tier4_score is None
        assert result.tier2_combined_score is None

    def test_cut_does_not_disqualify(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, 5, GolferStatus.CUT),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -2, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.is_disqualified is False

    def test_in_progress_does_not_disqualify(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.IN_PROGRESS),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.IN_PROGRESS),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.is_disqualified is False
        assert result.total_score == -15


class TestCheckTeamDisqualification:
    """Tests for the check_team_disqualification helper."""

    def test_no_eliminated_golfers(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.CUT),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        assert check_team_disqualification(team, scores) is False

    def test_wd_detected(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, None, GolferStatus.WITHDRAWN),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        assert check_team_disqualification(team, scores) is True

    def test_dq_detected(self):
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.FINAL),
            ("g2", "B", Tier.TIER_2, -3, GolferStatus.FINAL),
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, None, GolferStatus.DISQUALIFIED),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        assert check_team_disqualification(team, scores) is True


# ---------------------------------------------------------------------------
# rank_teams tests
# ---------------------------------------------------------------------------


class TestRankTeams:
    """Tests for rank_teams() — ranking, tiebreakers, and DQ ordering."""

    def _build_team_and_scores(
        self,
        team_id: str,
        t1: int, t2a: int, t2b: int, t3: int, t4: int,
        statuses: list[GolferStatus] | None = None,
    ) -> tuple[Team, dict[str, GolferScore]]:
        if statuses is None:
            statuses = [GolferStatus.FINAL] * 5
        return _make_team_and_scores([
            (f"{team_id}_t1", "T1", Tier.TIER_1, t1, statuses[0]),
            (f"{team_id}_t2a", "T2A", Tier.TIER_2, t2a, statuses[1]),
            (f"{team_id}_t2b", "T2B", Tier.TIER_2, t2b, statuses[2]),
            (f"{team_id}_t3", "T3", Tier.TIER_3, t3, statuses[3]),
            (f"{team_id}_t4", "T4", Tier.TIER_4, t4, statuses[4]),
        ], team_id=team_id)

    def test_simple_ranking_by_total_score(self):
        """Lower total score ranks higher."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # -15
        team_b, scores_b = self._build_team_and_scores("b", -3, -2, -1, 0, -1)   # -7
        team_c, scores_c = self._build_team_and_scores("c", -4, -3, -2, -1, -2)   # -12

        all_scores = {**scores_a, **scores_b, **scores_c}
        ranked = rank_teams([team_a, team_b, team_c], all_scores)

        assert ranked[0].team.id == "a"  # -15 (1st)
        assert ranked[1].team.id == "c"  # -12 (2nd)
        assert ranked[2].team.id == "b"  # -7  (3rd)

    def test_tiebreaker_1_tier4_score(self):
        """Tied teams: team with better (lower) T4 golfer score wins."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # total -15, T4: -4
        team_b, scores_b = self._build_team_and_scores("b", -6, -3, -2, -1, -3)  # total -15, T4: -3

        all_scores = {**scores_a, **scores_b}
        ranked = rank_teams([team_a, team_b], all_scores)

        assert ranked[0].team.id == "a"  # A wins — T4 score is -4 < -3
        assert ranked[1].team.id == "b"

    def test_tiebreaker_2_tier2_combined(self):
        """T4 tied → team with better combined T2 score wins."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -4, -2, -1, -3)  # total -15, T4: -3, T2: -6
        team_b, scores_b = self._build_team_and_scores("b", -6, -3, -1, -2, -3)  # total -15, T4: -3, T2: -4

        all_scores = {**scores_a, **scores_b}
        ranked = rank_teams([team_a, team_b], all_scores)

        assert ranked[0].team.id == "a"  # A wins — T2 combined: -6 < -4
        assert ranked[1].team.id == "b"

    def test_full_tie_same_rank(self):
        """Completely tied teams get same rank."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # -15
        team_b, scores_b = self._build_team_and_scores("b", -5, -3, -2, -1, -4)  # -15 (identical)

        all_scores = {**scores_a, **scores_b}
        ranked = rank_teams([team_a, team_b], all_scores)

        assert ranked[0].rank == ranked[1].rank  # Same rank — split prize

    def test_dq_teams_sort_to_bottom(self):
        """DQ'd teams rank below all active teams."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # -15, active
        team_b, scores_b = self._build_team_and_scores(
            "b", -10, -5, -3, -2, -4,
            statuses=[GolferStatus.FINAL, GolferStatus.WITHDRAWN, GolferStatus.FINAL,
                      GolferStatus.FINAL, GolferStatus.FINAL],
        )  # Would be -24 but DQ'd
        team_c, scores_c = self._build_team_and_scores("c", 2, 1, 0, 3, 4)  # +10, active

        all_scores = {**scores_a, **scores_b, **scores_c}
        ranked = rank_teams([team_a, team_b, team_c], all_scores)

        # Active teams first, DQ last
        assert ranked[0].team.id == "a"  # -15
        assert ranked[1].team.id == "c"  # +10
        assert ranked[2].team.id == "b"  # DQ
        assert ranked[2].is_disqualified is True
        assert ranked[2].rank is None

    def test_rank_numbers_with_gaps(self):
        """Ranks should have correct gaps (1, 2, 3 not 1, 1, 2 when not tied)."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)   # -15
        team_b, scores_b = self._build_team_and_scores("b", -4, -3, -2, -1, -2)   # -12
        team_c, scores_c = self._build_team_and_scores("c", -2, -1, 0, 1, -1)      # -3

        all_scores = {**scores_a, **scores_b, **scores_c}
        ranked = rank_teams([team_a, team_b, team_c], all_scores)

        assert ranked[0].rank == 1
        assert ranked[1].rank == 2
        assert ranked[2].rank == 3

    def test_tied_ranks_skip_correctly(self):
        """Two teams tied for 1st → next team is 3rd (not 2nd)."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # -15
        team_b, scores_b = self._build_team_and_scores("b", -5, -3, -2, -1, -4)  # -15 (tied)
        team_c, scores_c = self._build_team_and_scores("c", -2, -1, 0, 1, -1)    # -3

        all_scores = {**scores_a, **scores_b, **scores_c}
        ranked = rank_teams([team_a, team_b, team_c], all_scores)

        assert ranked[0].rank == 1
        assert ranked[1].rank == 1  # tied
        assert ranked[2].rank == 3  # skips 2

    def test_three_way_tie_resolved_by_tier4(self):
        """Three-way total tie, all resolved by different T4 scores."""
        team_a, scores_a = self._build_team_and_scores("a", -5, -3, -2, -1, -4)  # T4: -4
        team_b, scores_b = self._build_team_and_scores("b", -6, -3, -2, -1, -3)  # T4: -3
        team_c, scores_c = self._build_team_and_scores("c", -7, -3, -2, -1, -2)  # T4: -2

        all_scores = {**scores_a, **scores_b, **scores_c}
        ranked = rank_teams([team_a, team_b, team_c], all_scores)

        assert ranked[0].team.id == "a"
        assert ranked[1].team.id == "b"
        assert ranked[2].team.id == "c"
        assert ranked[0].rank == 1
        assert ranked[1].rank == 2
        assert ranked[2].rank == 3

    def test_golfer_with_none_score_treated_as_zero(self):
        """A golfer with score_to_par=None should be treated as 0 (even par)."""
        team, scores = _make_team_and_scores([
            ("g1", "A", Tier.TIER_1, -5, GolferStatus.IN_PROGRESS),
            ("g2", "B", Tier.TIER_2, None, GolferStatus.IN_PROGRESS),  # not yet started
            ("g3", "C", Tier.TIER_2, -2, GolferStatus.FINAL),
            ("g4", "D", Tier.TIER_3, -1, GolferStatus.FINAL),
            ("g5", "E", Tier.TIER_4, -4, GolferStatus.FINAL),
        ])
        result = calculate_team_score(team, scores)
        assert result.total_score == -12  # -5 + 0 + -2 + -1 + -4

    def test_empty_team_list(self):
        """rank_teams with no teams returns empty list."""
        ranked = rank_teams([], {})
        assert ranked == []
