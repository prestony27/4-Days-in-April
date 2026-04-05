-- Masters Pool: Initial database schema
-- Tables: golfers, contestants, teams, tournament_state

-- =============================================================================
-- GOLFERS — tournament field with live scoring data
-- =============================================================================
CREATE TABLE golfers (
    id            TEXT PRIMARY KEY,              -- ESPN athlete ID
    name          TEXT NOT NULL,
    world_rank    INTEGER,
    tier          INTEGER CHECK (tier IN (1, 2, 3, 4)),
    score_to_par  INTEGER,                       -- current score relative to par
    position      TEXT,                           -- "1", "T2", "T15", "-"
    thru          INTEGER,                       -- holes completed in current round
    status        TEXT NOT NULL DEFAULT 'STATUS_IN_PROGRESS'
                  CHECK (status IN (
                      'STATUS_IN_PROGRESS', 'STATUS_FINAL', 'STATUS_CUT',
                      'STATUS_WITHDRAWN', 'STATUS_DISQUALIFIED', 'STATUS_SUSPENDED'
                  )),
    round_scores  JSONB DEFAULT '[]'::jsonb,     -- [66, 64, null, null]
    total_strokes INTEGER,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_golfers_tier ON golfers (tier);
CREATE INDEX idx_golfers_status ON golfers (status);
CREATE INDEX idx_golfers_world_rank ON golfers (world_rank);

-- =============================================================================
-- CONTESTANTS — people entering the pool
-- =============================================================================
CREATE TABLE contestants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contestants_email ON contestants (email);

-- =============================================================================
-- TEAMS — submitted entries (max 3 per contestant)
-- =============================================================================
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contestant_id   UUID NOT NULL REFERENCES contestants(id) ON DELETE CASCADE,
    team_name       TEXT NOT NULL,
    -- Golfer slots by tier
    tier1_golfer_id TEXT NOT NULL REFERENCES golfers(id),
    tier2a_golfer_id TEXT NOT NULL REFERENCES golfers(id),
    tier2b_golfer_id TEXT NOT NULL REFERENCES golfers(id),
    tier3_golfer_id TEXT NOT NULL REFERENCES golfers(id),
    tier4_golfer_id TEXT NOT NULL REFERENCES golfers(id),
    -- Scoring
    total_score     INTEGER,                     -- sum of golfer scores to par
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disqualified')),
    -- Payment
    payment_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending', 'completed', 'refunded')),
    payment_id      TEXT,                        -- Stripe payment ID
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A contestant can submit up to 3 teams
    CONSTRAINT max_teams_per_contestant CHECK (true)  -- enforced at app layer
);

CREATE INDEX idx_teams_contestant ON teams (contestant_id);
CREATE INDEX idx_teams_total_score ON teams (total_score);
CREATE INDEX idx_teams_payment_status ON teams (payment_status);

-- =============================================================================
-- TOURNAMENT_STATE — single-row table for global tournament metadata
-- =============================================================================
CREATE TABLE tournament_state (
    id                  BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),  -- enforces single row
    current_round       INTEGER NOT NULL DEFAULT 0,
    tournament_status   TEXT NOT NULL DEFAULT 'pre_tournament'
                        CHECK (tournament_status IN (
                            'pre_tournament', 'in_progress', 'suspended', 'complete'
                        )),
    submissions_open    BOOLEAN NOT NULL DEFAULT true,
    cut_line            INTEGER,                 -- score to par where cut falls
    last_score_update   TIMESTAMPTZ
);

-- Seed the single tournament state row
INSERT INTO tournament_state (current_round, tournament_status, submissions_open)
VALUES (0, 'pre_tournament', true);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_state ENABLE ROW LEVEL SECURITY;

-- Public read access for golfers and tournament state (leaderboard is public)
CREATE POLICY "golfers_public_read" ON golfers FOR SELECT USING (true);
CREATE POLICY "tournament_state_public_read" ON tournament_state FOR SELECT USING (true);

-- Teams: public read for leaderboard display
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);

-- Contestants: service role only (contains PII — email addresses)
-- No public read policy; all access goes through backend API

-- Service role can do everything (backend API uses service role key)
CREATE POLICY "golfers_service_write" ON golfers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "contestants_service_write" ON contestants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "teams_service_write" ON teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "tournament_state_service_write" ON tournament_state FOR ALL USING (auth.role() = 'service_role');
