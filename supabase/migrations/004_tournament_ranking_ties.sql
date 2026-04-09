-- 4 Days in April Contest: Tournament-style ranking with ties
-- Changes DENSE_RANK to RANK and adds is_tied flag for proper tournament display

-- =============================================================================
-- ADD IS_TIED COLUMN TO TEAMS TABLE
-- =============================================================================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_tied BOOLEAN DEFAULT false;

-- =============================================================================
-- UPDATE FUNCTION TO USE RANK() AND COMPUTE IS_TIED
-- Uses standard tournament ranking where ties skip subsequent positions
-- Example: 1, T2, T2, T2, 5 (not 1, 2, 2, 2, 3)
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

  -- Step 2: Calculate ranks using RANK() (not DENSE_RANK) for proper tournament ranking
  -- Also compute is_tied by checking if multiple teams share the same rank
  WITH ranked AS (
    SELECT
      id,
      CASE
        WHEN status = 'disqualified' THEN NULL
        ELSE RANK() OVER (
          PARTITION BY CASE WHEN status = 'disqualified' THEN 1 ELSE 0 END
          ORDER BY
            total_score NULLS LAST,
            tier4_score NULLS LAST,
            tier2_combined_score NULLS LAST
        )
      END as new_rank
    FROM teams
    WHERE payment_status = 'completed'
  ),
  rank_counts AS (
    SELECT new_rank, COUNT(*) as cnt
    FROM ranked
    WHERE new_rank IS NOT NULL
    GROUP BY new_rank
  )
  UPDATE teams t
  SET
    rank = r.new_rank,
    is_tied = COALESCE(rc.cnt > 1, false)
  FROM ranked r
  LEFT JOIN rank_counts rc ON r.new_rank = rc.new_rank
  WHERE t.id = r.id;
END;
$$ LANGUAGE plpgsql;

-- Re-run the function to update existing data
SELECT update_team_rankings();
