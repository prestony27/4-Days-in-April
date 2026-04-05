"""Score calculation and tiebreaker logic for the Masters Pool.

Rules summary (from Rules.md):
- Team score = sum of 5 golfers' scores to par.
- Missed cut: golfer's score freezes at their 36-hole total (still counts).
- DQ or WD (after tournament starts): entire team is disqualified.
- Tiebreakers:
  1. Lower score from the tier-4 (51+) golfer.
  2. Lower combined score from the two tier-2 (11-30) golfers.
  3. If still tied: split prize money.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from lib.models import GolferScore, GolferStatus, Team, TeamGolferSlot, TeamStatus, Tier


@dataclass
class ScoredTeam:
    """A team with its computed score and tiebreaker values."""

    team: Team
    total_score: Optional[int]  # None if disqualified
    is_disqualified: bool
    tier4_score: Optional[int]  # tiebreaker 1
    tier2_combined_score: Optional[int]  # tiebreaker 2
    rank: Optional[int] = None  # assigned after sorting


def calculate_team_score(
    team: Team,
    golfer_scores: dict[str, GolferScore],
) -> ScoredTeam:
    """Calculate a team's total score and check for disqualification.

    Args:
        team: The team to score.
        golfer_scores: Map of espn_id -> GolferScore for all golfers in the tournament.

    Returns:
        ScoredTeam with computed total and tiebreaker values.
    """
    total = 0
    tier4_score: int | None = None
    tier2_scores: list[int] = []

    for slot in team.golfers:
        golfer = golfer_scores.get(slot.golfer_id)

        if golfer is None:
            continue

        # DQ or WD after starting -> team is disqualified
        if golfer.is_eliminated:
            return ScoredTeam(
                team=team,
                total_score=None,
                is_disqualified=True,
                tier4_score=None,
                tier2_combined_score=None,
            )

        # Use score_to_par (works for both active players and those who missed the cut,
        # since ESPN keeps their score frozen at their 36-hole total)
        score = golfer.score_to_par if golfer.score_to_par is not None else 0
        total += score

        # Track tiebreaker values
        if slot.tier == Tier.TIER_4:
            tier4_score = score
        elif slot.tier == Tier.TIER_2:
            tier2_scores.append(score)

    tier2_combined = sum(tier2_scores) if tier2_scores else None

    return ScoredTeam(
        team=team,
        total_score=total,
        is_disqualified=False,
        tier4_score=tier4_score,
        tier2_combined_score=tier2_combined,
    )


def rank_teams(
    teams: list[Team],
    golfer_scores: dict[str, GolferScore],
) -> list[ScoredTeam]:
    """Score all teams and return them ranked lowest-score-first.

    Disqualified teams sort to the bottom.

    Tiebreaker order:
      1. Lower total score wins.
      2. Lower tier-4 (51+) golfer score.
      3. Lower combined tier-2 (11-30) golfer scores.
      4. If still tied, they share the position (split prize money).
    """
    scored = [calculate_team_score(t, golfer_scores) for t in teams]

    def sort_key(st: ScoredTeam) -> tuple:
        if st.is_disqualified:
            return (1, 0, 0, 0)
        return (
            0,
            st.total_score if st.total_score is not None else 999,
            st.tier4_score if st.tier4_score is not None else 999,
            st.tier2_combined_score if st.tier2_combined_score is not None else 999,
        )

    scored.sort(key=sort_key)

    # Assign ranks (ties get the same rank; DQ'd teams are unranked)
    active_position = 0  # counts only non-DQ teams seen so far
    for st in scored:
        if st.is_disqualified:
            st.rank = None
            continue

        active_position += 1
        if active_position == 1:
            st.rank = 1
        else:
            # Find the previous non-DQ team
            prev = next(
                (s for s in reversed(scored[:scored.index(st)]) if not s.is_disqualified),
                None,
            )
            if prev and _is_tied(prev, st):
                st.rank = prev.rank
            else:
                st.rank = active_position

    return scored


def _is_tied(a: ScoredTeam, b: ScoredTeam) -> bool:
    """Check if two scored teams are tied after all tiebreakers."""
    return (
        a.total_score == b.total_score
        and a.tier4_score == b.tier4_score
        and a.tier2_combined_score == b.tier2_combined_score
    )


def check_team_disqualification(
    team: Team,
    golfer_scores: dict[str, GolferScore],
) -> bool:
    """Return True if any golfer on the team has WD or DQ status."""
    for slot in team.golfers:
        golfer = golfer_scores.get(slot.golfer_id)
        if golfer and golfer.is_eliminated:
            return True
    return False
