"""Regression tests for bugs found during code review.

Each test class corresponds to a specific review finding (C = Critical, H = High).
Tests verify the fix is in place so these bugs can't silently return.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError as PydanticValidationError

from lib.models import (
    GolferScore,
    GolferStatus,
    PaymentStatus,
    Team,
    TeamGolferSlot,
    TeamStatus,
    Tier,
)


# ===========================================================================
# C1 — Golfer ID field naming
# ===========================================================================


class TestC1_GolferIdField:
    """C1: Golfer type uses `id` in DB / API responses, `espn_id` in Pydantic model.

    The frontend `Golfer` and `GolferScore` types use `id`, which is what
    the /api/golfers endpoint returns (directly from DB). The Pydantic
    GolferScore model internally uses `espn_id` but the API serializes
    from raw DB rows that use `id`.
    """

    def test_golfer_api_response_uses_id_field(self):
        """The /api/golfers select clause must include `id`, not `espn_id`."""
        from api.routes.golfers import list_golfers

        # The function's select string is in the source — verify it starts with "id"
        import inspect
        source = inspect.getsource(list_golfers)
        # The DB query must select "id" as the first column
        assert '"id, name, world_rank' in source or "'id, name, world_rank" in source

    def test_golfer_score_model_has_espn_id(self):
        """Internal model uses espn_id for ESPN-sourced data."""
        g = GolferScore(
            espn_id="12345",
            name="Test Golfer",
            status=GolferStatus.IN_PROGRESS,
        )
        assert g.espn_id == "12345"

    def test_leaderboard_golfer_response_uses_id(self):
        """The leaderboard endpoint returns golfer details with `id` field (from DB)."""
        from api.routes.leaderboard import get_leaderboard

        import inspect
        source = inspect.getsource(get_leaderboard)
        # Verify the response dict uses "id" not "espn_id"
        assert '"id": g["id"]' in source or "'id': g['id']" in source or '"id": g["id"]' in source


# ===========================================================================
# C2 — fetchGolfers response format
# ===========================================================================


class TestC2_GolfersResponseFormat:
    """C2: /api/golfers must return {golfers: [...], count: N}."""

    def test_golfers_endpoint_returns_golfers_and_count_keys(self):
        """Verify the response structure has correct keys."""
        from api.routes.golfers import list_golfers

        import inspect
        source = inspect.getsource(list_golfers)
        # The return statement must include both "golfers" and "count"
        assert '"golfers"' in source
        assert '"count"' in source

    def test_golfers_endpoint_count_matches_data_length(self):
        """Verify count = len(golfers) in response."""
        from api.routes.golfers import list_golfers

        import inspect
        source = inspect.getsource(list_golfers)
        assert "len(result.data)" in source


# ===========================================================================
# C3 — seed-golfers requires `id` field
# ===========================================================================


class TestC3_GolferCreateRequiresId:
    """C3: GolferCreate model must require `id` — the DB PK has no default."""

    def test_golfer_create_has_id_field(self):
        """The admin GolferCreate model must include `id`."""
        from api.routes.admin import GolferCreate

        g = GolferCreate(id="12345", name="Tiger Woods", world_rank=15, tier=2)
        assert g.id == "12345"

    def test_golfer_create_missing_id_fails(self):
        """Omitting `id` must raise a validation error."""
        from api.routes.admin import GolferCreate

        with pytest.raises(PydanticValidationError) as exc_info:
            GolferCreate(name="Tiger Woods", world_rank=15, tier=2)
        # Check that 'id' is mentioned in the error
        errors = exc_info.value.errors()
        id_errors = [e for e in errors if "id" in str(e.get("loc", []))]
        assert len(id_errors) > 0

    def test_golfer_create_id_is_string(self):
        """id field must accept a string (ESPN athlete IDs are strings)."""
        from api.routes.admin import GolferCreate

        g = GolferCreate(id="espn-abc-123", name="Test", world_rank=1, tier=1)
        assert isinstance(g.id, str)


# ===========================================================================
# H1 — Webhook idempotency
# ===========================================================================


class TestH1_WebhookIdempotency:
    """H1: Calling the payment webhook twice must not change an already-completed team."""

    def test_webhook_checks_payment_status_before_update(self):
        """The webhook handler must check payment_status != 'completed' before updating."""
        from api.routes.webhooks import stripe_webhook

        import inspect
        source = inspect.getsource(stripe_webhook)
        # Must check current status before updating
        assert "payment_status" in source
        assert '"completed"' in source or "'completed'" in source
        # Must have a conditional that prevents re-processing
        assert '!= "completed"' in source or "!= 'completed'" in source

    def test_idempotent_update_logic(self):
        """Simulate: team already completed → webhook should NOT update again.

        This tests the logic flow by checking that the code fetches the team
        first and only updates if not already completed.
        """
        from api.routes.webhooks import stripe_webhook

        import inspect
        source = inspect.getsource(stripe_webhook)

        # The code must SELECT the team BEFORE doing the UPDATE
        # (fetch to check status, then conditionally update)
        select_pos = source.find(".select(")
        update_pos = source.find(".update(")
        assert select_pos > 0, "Webhook must SELECT team before updating"
        assert update_pos > select_pos, "UPDATE must come after SELECT (check-then-act)"


# ===========================================================================
# H2 — Cron handler supports GET (Vercel Cron sends GET)
# ===========================================================================


class TestH2_CronHandlerMethod:
    """H2: The cron endpoint must accept GET requests (Vercel Cron sends GET)."""

    def test_cron_endpoint_accepts_get(self):
        """The cron endpoint must be registered for GET method."""
        from api.routes.cron import router

        cron_routes = [r for r in router.routes if hasattr(r, "path") and "update-scores" in r.path]
        assert len(cron_routes) == 1, "Expected exactly one update-scores route"

        route = cron_routes[0]
        assert "GET" in route.methods, "Cron endpoint must accept GET (Vercel Cron sends GET)"

    def test_cron_endpoint_also_accepts_post(self):
        """POST should also work for manual triggers."""
        from api.routes.cron import router

        cron_routes = [r for r in router.routes if hasattr(r, "path") and "update-scores" in r.path]
        route = cron_routes[0]
        assert "POST" in route.methods, "Cron endpoint should also accept POST for manual use"

    def test_cron_handler_is_async(self):
        """The cron handler must be async (uses await for ESPN client)."""
        from api.routes.cron import update_scores
        import inspect

        assert inspect.iscoroutinefunction(update_scores), "Cron handler must be async"


# ===========================================================================
# H4 — Double-submit protection (post-insert checks)
# ===========================================================================


class TestH4_DoubleSubmitProtection:
    """H4: Submit flow must have post-insert race condition checks."""

    def test_submit_team_has_post_insert_max_teams_check(self):
        """After inserting a team, verify we haven't exceeded max teams."""
        from api.routes.submit_team import submit_team

        import inspect
        source = inspect.getsource(submit_team)
        # Must have a post-insert check that queries teams AFTER insert
        assert "MAX_TEAMS_PER_EMAIL" in source or "max_teams" in source.lower()
        # Must have cleanup (delete) if over limit
        assert ".delete()" in source

    def test_submit_team_has_post_insert_duplicate_golfer_check(self):
        """After inserting a team, verify no duplicate golfers snuck in."""
        from api.routes.submit_team import submit_team

        import inspect
        source = inspect.getsource(submit_team)
        # Must check for overlap in golfer IDs across teams
        assert "overlap" in source or "existing_golfer_ids" in source
        # Must clean up on conflict
        assert ".delete()" in source

    def test_submit_team_normalizes_email(self):
        """Email must be normalized to lowercase before any operation."""
        from api.routes.submit_team import submit_team

        import inspect
        source = inspect.getsource(submit_team)
        assert ".lower()" in source
        assert ".strip()" in source


# ===========================================================================
# Timezone — SUBMISSION_DEADLINE uses EDT for April
# ===========================================================================


class TestTimezone:
    """SUBMISSION_DEADLINE must use EDT (UTC-4) for April dates, not EST (UTC-5)."""

    def test_backend_deadline_uses_america_new_york(self):
        """Backend must use ZoneInfo('America/New_York') which auto-resolves EDT."""
        from lib.validation import SUBMISSION_DEADLINE

        assert SUBMISSION_DEADLINE.tzinfo == ZoneInfo("America/New_York")

    def test_backend_deadline_is_april_9_at_5am(self):
        """Deadline: 5:00 AM, April 9, 2026."""
        from lib.validation import SUBMISSION_DEADLINE

        assert SUBMISSION_DEADLINE.year == 2026
        assert SUBMISSION_DEADLINE.month == 4
        assert SUBMISSION_DEADLINE.day == 9
        assert SUBMISSION_DEADLINE.hour == 5
        assert SUBMISSION_DEADLINE.minute == 0

    def test_deadline_converts_to_utc_as_0900_not_1000(self):
        """April 9 is EDT (UTC-4), so 5 AM EDT = 9:00 AM UTC, NOT 10:00 AM UTC.

        If someone accidentally uses EST (UTC-5), it would be 10:00 AM UTC.
        This test catches that specific bug.
        """
        from lib.validation import SUBMISSION_DEADLINE

        utc_deadline = SUBMISSION_DEADLINE.astimezone(timezone.utc)
        assert utc_deadline.hour == 9, (
            f"5 AM EDT should be 09:00 UTC, got {utc_deadline.hour}:00 UTC. "
            "If this is 10:00, the offset is -05:00 (EST) instead of -04:00 (EDT)."
        )
        assert utc_deadline.minute == 0

    def test_frontend_deadline_string_uses_edt_offset(self):
        """Frontend constant must use -04:00 (EDT), not -05:00 (EST)."""
        from pathlib import Path

        types_file = Path(__file__).parent.parent / "src" / "types" / "index.ts"
        content = types_file.read_text()

        # Find the SUBMISSION_DEADLINE line
        for line in content.splitlines():
            if "SUBMISSION_DEADLINE" in line and "new Date" in line:
                # Must have -04:00 (EDT), not -05:00 (EST)
                assert "-04:00" in line, (
                    f"SUBMISSION_DEADLINE must use -04:00 (EDT) for April. Found: {line.strip()}"
                )
                assert "-05:00" not in line, (
                    f"SUBMISSION_DEADLINE uses -05:00 (EST) but April is EDT (-04:00). Found: {line.strip()}"
                )
                break
        else:
            pytest.fail("Could not find SUBMISSION_DEADLINE in src/types/index.ts")


# ===========================================================================
# Response format consistency — API shapes match frontend types
# ===========================================================================


class TestResponseFormats:
    """Verify API endpoints return shapes matching frontend TypeScript interfaces."""

    def test_leaderboard_response_shape(self):
        """LeaderboardResponse must have: teams, total, last_updated."""
        from api.routes.leaderboard import get_leaderboard

        import inspect
        source = inspect.getsource(get_leaderboard)
        # Return dict must contain these keys
        assert '"teams"' in source
        assert '"total"' in source
        assert '"last_updated"' in source

    def test_leaderboard_team_shape(self):
        """Each LeaderboardTeam must have: rank, team_id, team_name, contestant_name, total_score, status, golfers."""
        from api.routes.leaderboard import get_leaderboard

        import inspect
        source = inspect.getsource(get_leaderboard)
        required_fields = ["rank", "team_id", "team_name", "contestant_name", "total_score", "status", "golfers"]
        for field in required_fields:
            assert f'"{field}"' in source, f"Leaderboard team response missing field: {field}"

    def test_leaderboard_golfer_shape(self):
        """Each LeaderboardGolfer must have: id, name, world_rank, tier, score_to_par, thru, status, round_scores."""
        from api.routes.leaderboard import get_leaderboard

        import inspect
        source = inspect.getsource(get_leaderboard)
        golfer_fields = ["id", "name", "world_rank", "tier", "score_to_par", "thru", "status", "round_scores"]
        for field in golfer_fields:
            assert f'"{field}"' in source, f"Leaderboard golfer detail missing field: {field}"

    def test_golfers_response_shape(self):
        """/api/golfers must return {golfers: [...], count: N}."""
        from api.routes.golfers import list_golfers

        import inspect
        source = inspect.getsource(list_golfers)
        assert '"golfers"' in source
        assert '"count"' in source

    def test_submit_team_response_shape(self):
        """/api/submit-team must return {team_id, payment_url}."""
        from api.routes.submit_team import submit_team

        import inspect
        source = inspect.getsource(submit_team)
        assert '"team_id"' in source
        assert '"payment_url"' in source

    def test_my_teams_response_shape(self):
        """/api/my-teams must return {teams: [...], count: N}."""
        from api.routes.my_teams import get_my_teams

        import inspect
        source = inspect.getsource(get_my_teams)
        assert '"teams"' in source
        assert '"count"' in source


# ===========================================================================
# Schema alignment — column names must match DB schema
# ===========================================================================


class TestSchemaAlignment:
    """Verify code references correct DB column names (prevents the schema drift bug)."""

    CORRECT_TIER_COLS = ("tier1_golfer_id", "tier2a_golfer_id", "tier2b_golfer_id", "tier3_golfer_id", "tier4_golfer_id")
    # Old Planning.md names that must NOT appear (check as quoted strings to avoid substring matches)
    WRONG_TIER_COL_PATTERNS = (
        '"tier1_golfer"', '"tier2_golfer_1"', '"tier2_golfer_2"',
        '"tier3_golfer"', '"tier4_golfer"',
    )

    def _get_source(self, module_path: str) -> str:
        """Read a Python source file."""
        from pathlib import Path
        return Path(module_path).read_text()

    def test_submit_team_uses_correct_tier_columns(self):
        source = self._get_source("api/routes/submit_team.py")
        for col in self.CORRECT_TIER_COLS:
            assert col in source, f"submit_team.py must use correct column name: {col}"
        for pattern in self.WRONG_TIER_COL_PATTERNS:
            assert pattern not in source, f"submit_team.py has wrong column name: {pattern}"

    def test_cron_uses_correct_tier_columns(self):
        source = self._get_source("api/routes/cron.py")
        for col in self.CORRECT_TIER_COLS:
            assert col in source, f"cron.py must use correct column name: {col}"

    def test_leaderboard_uses_correct_tier_columns(self):
        source = self._get_source("api/routes/leaderboard.py")
        for col in self.CORRECT_TIER_COLS:
            assert col in source, f"leaderboard.py must use correct column name: {col}"

    def test_validation_uses_correct_tier_columns(self):
        source = self._get_source("lib/validation.py")
        for col in self.CORRECT_TIER_COLS:
            assert col in source, f"validation.py must use correct column name: {col}"

    def test_no_file_uses_golfer_ids_column(self):
        """The `golfer_ids` column does not exist in the teams table.

        Local variable names like `existing_golfer_ids` or `golfer_ids_for_team`
        are fine — we only flag references inside DB query strings.
        """
        for path in ("api/routes/submit_team.py", "api/routes/cron.py", "api/routes/leaderboard.py"):
            source = self._get_source(path)
            lines = source.splitlines()
            for line in lines:
                # Only flag if "golfer_ids" appears as a DB column inside a query builder call
                # e.g. .select("..., golfer_ids, ...") or .insert({"golfer_ids": ...})
                if ".select(" in line or ".insert(" in line or ".update(" in line:
                    # Check for golfer_ids as a quoted string key in the query (DB column reference)
                    if '"golfer_ids"' in line or "'golfer_ids'" in line:
                        pytest.fail(f"{path} references non-existent 'golfer_ids' DB column: {line.strip()}")

    def test_payment_status_values_match_schema(self):
        """Schema CHECK constraint allows: 'pending', 'completed', 'refunded'.

        Code must NOT use 'paid' or 'unpaid'.
        """
        for path in ("api/routes/submit_team.py", "api/routes/webhooks.py", "api/routes/cron.py"):
            source = self._get_source(path)
            assert '"paid"' not in source, f"{path} uses 'paid' but schema requires 'completed'"
            assert '"unpaid"' not in source, f"{path} uses 'unpaid' but schema requires 'pending'"

    def test_score_column_name_is_score_to_par(self):
        """The golfers table column is `score_to_par`, NOT `current_score`."""
        for path in ("api/routes/cron.py", "api/routes/golfers.py", "api/routes/leaderboard.py"):
            source = self._get_source(path)
            lines = source.splitlines()
            for line in lines:
                if "current_score" in line and (".select(" in line or ".update(" in line):
                    pytest.fail(f"{path} uses 'current_score' but schema column is 'score_to_par': {line.strip()}")

    def test_tournament_state_id_is_boolean(self):
        """tournament_state.id is BOOLEAN TRUE, not integer 1."""
        for path in ("api/routes/cron.py", "api/routes/admin.py", "lib/validation.py"):
            source = self._get_source(path)
            # Check that .eq("id", ...) uses True not 1
            if '.eq("id", 1)' in source or ".eq('id', 1)" in source:
                pytest.fail(f"{path} uses tournament_state id=1 but schema has BOOLEAN TRUE")


# ===========================================================================
# Admin manual score entry (ESPN fallback)
# ===========================================================================


class TestAdminManualScoreEntry:
    """Task #43: Manual score entry endpoint must exist as ESPN fallback."""

    def test_single_score_update_endpoint_exists(self):
        from api.routes.admin import router

        paths = [r.path for r in router.routes if hasattr(r, "path")]
        assert "/admin/update-score" in paths, "Missing /admin/update-score endpoint"

    def test_bulk_score_update_endpoint_exists(self):
        from api.routes.admin import router

        paths = [r.path for r in router.routes if hasattr(r, "path")]
        assert "/admin/update-scores-bulk" in paths, "Missing /admin/update-scores-bulk endpoint"

    def test_score_update_model_fields(self):
        """ScoreUpdate model must accept all necessary fields."""
        from api.routes.admin import ScoreUpdate

        update = ScoreUpdate(
            golfer_id="12345",
            score_to_par=-5,
            thru=14,
            status="STATUS_IN_PROGRESS",
            round_scores=[68, 70, None, None],
            position="T3",
            total_strokes=138,
        )
        assert update.golfer_id == "12345"
        assert update.score_to_par == -5
        assert update.round_scores == [68, 70, None, None]

    def test_score_update_validates_status(self):
        """Invalid status values must be rejected."""
        from api.routes.admin import _VALID_STATUSES

        valid = {"STATUS_IN_PROGRESS", "STATUS_FINAL", "STATUS_CUT",
                 "STATUS_WITHDRAWN", "STATUS_DISQUALIFIED", "STATUS_SUSPENDED"}
        assert _VALID_STATUSES == valid

        assert "active" not in _VALID_STATUSES, "Must use ESPN status strings, not short names"
        assert "withdrawn" not in _VALID_STATUSES, "Must use ESPN status strings, not short names"
