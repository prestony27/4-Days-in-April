-- 4 Days in April Contest: Race condition prevention triggers
-- Enforces max 3 completed teams and no duplicate golfers at database level

-- =============================================================================
-- MAX COMPLETED TEAMS TRIGGER
-- Prevents more than 3 completed teams per contestant
-- =============================================================================
CREATE OR REPLACE FUNCTION enforce_max_completed_teams()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INTEGER;
BEGIN
  -- Only check when payment_status is being set to 'completed'
  IF NEW.payment_status = 'completed' AND
     (OLD IS NULL OR OLD.payment_status IS DISTINCT FROM 'completed') THEN

    SELECT COUNT(*) INTO completed_count
    FROM teams
    WHERE contestant_id = NEW.contestant_id
      AND payment_status = 'completed'
      AND id != NEW.id;  -- Exclude current row

    IF completed_count >= 3 THEN
      RAISE EXCEPTION 'Maximum of 3 completed teams per contestant exceeded'
        USING ERRCODE = '23514';  -- check_violation
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_max_completed_teams
  BEFORE INSERT OR UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_completed_teams();

-- =============================================================================
-- NO DUPLICATE GOLFERS TRIGGER
-- Prevents same golfer appearing on multiple completed teams for one contestant
-- =============================================================================
CREATE OR REPLACE FUNCTION enforce_no_duplicate_golfers()
RETURNS TRIGGER AS $$
DECLARE
  duplicate_golfer_id TEXT;
  duplicate_golfer_name TEXT;
BEGIN
  -- Only check when payment_status is being set to 'completed'
  IF NEW.payment_status = 'completed' AND
     (OLD IS NULL OR OLD.payment_status IS DISTINCT FROM 'completed') THEN

    -- Check all 5 golfer slots against existing completed teams
    WITH new_golfers AS (
      SELECT unnest(ARRAY[
        NEW.tier1_golfer_id,
        NEW.tier2a_golfer_id,
        NEW.tier2b_golfer_id,
        NEW.tier3_golfer_id,
        NEW.tier4_golfer_id
      ]) AS golfer_id
    ),
    existing_golfers AS (
      SELECT unnest(ARRAY[
        tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id,
        tier3_golfer_id, tier4_golfer_id
      ]) AS golfer_id
      FROM teams
      WHERE contestant_id = NEW.contestant_id
        AND payment_status = 'completed'
        AND id != NEW.id
    )
    SELECT ng.golfer_id INTO duplicate_golfer_id
    FROM new_golfers ng
    INNER JOIN existing_golfers eg ON ng.golfer_id = eg.golfer_id
    LIMIT 1;

    IF duplicate_golfer_id IS NOT NULL THEN
      -- Get golfer name for better error message
      SELECT name INTO duplicate_golfer_name FROM golfers WHERE id = duplicate_golfer_id;
      RAISE EXCEPTION 'Golfer % is already on another completed team', COALESCE(duplicate_golfer_name, duplicate_golfer_id)
        USING ERRCODE = '23514';  -- check_violation
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_no_duplicate_golfers
  BEFORE INSERT OR UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION enforce_no_duplicate_golfers();
