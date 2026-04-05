/**
 * Score calculation and tiebreaker logic for the Masters Pool.
 *
 * Rules summary:
 * - Team score = sum of 5 golfers' scores to par.
 * - Missed cut: golfer's score freezes at their 36-hole total (still counts).
 * - DQ or WD (after tournament starts): entire team is disqualified.
 * - Tiebreakers:
 *   1. Lower score from the tier-4 (51+) golfer.
 *   2. Lower combined score from the two tier-2 (11-30) golfers.
 *   3. If still tied: split prize money.
 */

import type { GolferStatus, Tier } from "@/types";
import { DQ_STATUSES } from "./schema";

// Golfer score data needed for team scoring
export interface GolferScoreData {
  id: string;
  score_to_par: number | null;
  status: GolferStatus;
}

// Team golfer slot with tier assignment
export interface TeamGolferSlot {
  golfer_id: string;
  tier: Tier;
}

// Team with golfer slots
export interface TeamForScoring {
  id: string;
  golfers: TeamGolferSlot[];
}

// Result of scoring a team
export interface ScoredTeam {
  team: TeamForScoring;
  totalScore: number | null; // null if disqualified
  isDisqualified: boolean;
  tier4Score: number | null; // tiebreaker 1
  tier2CombinedScore: number | null; // tiebreaker 2
  rank: number | null; // assigned after sorting, null for DQ'd teams
}

/**
 * Check if a golfer status causes team disqualification.
 */
export function isEliminatedStatus(status: GolferStatus): boolean {
  return DQ_STATUSES.has(status);
}

/**
 * Calculate a team's total score and check for disqualification.
 */
export function calculateTeamScore(
  team: TeamForScoring,
  golferScores: Map<string, GolferScoreData>
): ScoredTeam {
  let total = 0;
  let tier4Score: number | null = null;
  const tier2Scores: number[] = [];

  for (const slot of team.golfers) {
    const golfer = golferScores.get(slot.golfer_id);

    if (!golfer) {
      continue;
    }

    // DQ or WD after starting -> team is disqualified
    if (isEliminatedStatus(golfer.status)) {
      return {
        team,
        totalScore: null,
        isDisqualified: true,
        tier4Score: null,
        tier2CombinedScore: null,
        rank: null,
      };
    }

    // Use score_to_par (works for both active players and those who missed the cut,
    // since ESPN keeps their score frozen at their 36-hole total)
    const score = golfer.score_to_par ?? 0;
    total += score;

    // Track tiebreaker values
    if (slot.tier === 4) {
      tier4Score = score;
    } else if (slot.tier === 2) {
      tier2Scores.push(score);
    }
  }

  const tier2Combined = tier2Scores.length > 0 ? tier2Scores.reduce((a, b) => a + b, 0) : null;

  return {
    team,
    totalScore: total,
    isDisqualified: false,
    tier4Score,
    tier2CombinedScore: tier2Combined,
    rank: null,
  };
}

/**
 * Check if two scored teams are tied after all tiebreakers.
 */
function isTied(a: ScoredTeam, b: ScoredTeam): boolean {
  return (
    a.totalScore === b.totalScore &&
    a.tier4Score === b.tier4Score &&
    a.tier2CombinedScore === b.tier2CombinedScore
  );
}

/**
 * Score all teams and return them ranked lowest-score-first.
 * Disqualified teams sort to the bottom.
 *
 * Tiebreaker order:
 *   1. Lower total score wins.
 *   2. Lower tier-4 (51+) golfer score.
 *   3. Lower combined tier-2 (11-30) golfer scores.
 *   4. If still tied, they share the position (split prize money).
 */
export function rankTeams(
  teams: TeamForScoring[],
  golferScores: Map<string, GolferScoreData>
): ScoredTeam[] {
  const scored = teams.map((t) => calculateTeamScore(t, golferScores));

  // Sort by: DQ status, total score, tier4 score, tier2 combined score
  scored.sort((a, b) => {
    // DQ'd teams sort to bottom
    if (a.isDisqualified && !b.isDisqualified) return 1;
    if (!a.isDisqualified && b.isDisqualified) return -1;
    if (a.isDisqualified && b.isDisqualified) return 0;

    // Compare total scores (lower is better)
    const aTotal = a.totalScore ?? 999;
    const bTotal = b.totalScore ?? 999;
    if (aTotal !== bTotal) return aTotal - bTotal;

    // Tiebreaker 1: tier-4 score
    const aTier4 = a.tier4Score ?? 999;
    const bTier4 = b.tier4Score ?? 999;
    if (aTier4 !== bTier4) return aTier4 - bTier4;

    // Tiebreaker 2: combined tier-2 score
    const aTier2 = a.tier2CombinedScore ?? 999;
    const bTier2 = b.tier2CombinedScore ?? 999;
    return aTier2 - bTier2;
  });

  // Assign ranks (ties get the same rank; DQ'd teams are unranked)
  let activePosition = 0;
  for (let i = 0; i < scored.length; i++) {
    const st = scored[i];

    if (st.isDisqualified) {
      st.rank = null;
      continue;
    }

    activePosition++;

    if (activePosition === 1) {
      st.rank = 1;
    } else {
      // Find the previous non-DQ team
      let prev: ScoredTeam | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!scored[j].isDisqualified) {
          prev = scored[j];
          break;
        }
      }

      if (prev && isTied(prev, st)) {
        st.rank = prev.rank;
      } else {
        st.rank = activePosition;
      }
    }
  }

  return scored;
}

/**
 * Check if any golfer on the team has WD or DQ status.
 */
export function checkTeamDisqualification(
  team: TeamForScoring,
  golferScores: Map<string, GolferScoreData>
): boolean {
  for (const slot of team.golfers) {
    const golfer = golferScores.get(slot.golfer_id);
    if (golfer && isEliminatedStatus(golfer.status)) {
      return true;
    }
  }
  return false;
}
