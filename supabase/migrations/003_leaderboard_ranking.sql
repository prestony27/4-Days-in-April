-- 4 Days in April Contest: Leaderboard ranking optimization
-- Pre-compute rankings for efficient pagination without loading all teams into memory

-- =============================================================================
-- ADD RANKING COLUMNS TO TEAMS TABLE
-- =============================================================================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS rank INTEGER;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tier4_score INTEGER;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tier2_combined_score INTEGER;

-- Index for efficient leaderboard queries with pre-computed rank
CREATE INDEX IF NOT EXISTS idx_teams_leaderboard_rank
  ON teams (rank NULLS LAST, total_score NULLS LAST)
  WHERE payment_status = 'completed';

-- =============================================================================
-- FUNCTION TO UPDATE TEAM RANKINGS
-- Called after score updates to pre-compute rankings in the database
-- =============================================================================
CREATE OR REPLACE FUNCTION update_team_rankings()
RETURNS void AS $$
BEGIN
  -- Step 1: Update tiebreaker scores for all completed teams
  UPDATE teams t
  SET
    tier4_score = g4.score_to_par,
    tier2_combined_score = COALESCE(g2a.score_to_par, 0) + COALESCE(g2b.score_to_par, 0)
  FROM
    golfers g4,
    golfers g2a,
    golfers g2b
  WHERE t.payment_status = 'completed'
    AND t.tier4_golfer_id = g4.id
    AND t.tier2a_golfer_id = g2a.id
    AND t.tier2b_golfer_id = g2b.id;

  -- Step 2: Calculate ranks using window function
  -- Ranking logic matches scoring.ts:
  -- 1. Disqualified teams get NULL rank (sorted to bottom)
  -- 2. Order by: total_score ASC, tier4_score ASC, tier2_combined_score ASC
  -- 3. DENSE_RANK for tied teams to share same rank
  WITH ranked AS (
    SELECT
      id,
      CASE
        WHEN status = 'disqualified' THEN NULL
        ELSE DENSE_RANK() OVER (
          ORDER BY
            CASE WHEN status = 'disqualified' THEN 1 ELSE 0 END,
            total_score NULLS LAST,
            tier4_score NULLS LAST,
            tier2_combined_score NULLS LAST
        )
      END as new_rank
    FROM teams
    WHERE payment_status = 'completed'
  )
  UPDATE teams t
  SET rank = r.new_rank
  FROM ranked r
  WHERE t.id = r.id;
END;
$$ LANGUAGE plpgsql;
