"""Tests for submission validation logic in lib/validation.py.

Tests the pure validation functions that don't require database access:
- validate_tier_placement: golfer in correct tier by world rank
- validate_tier_composition: correct 1-2-1-1 distribution
- SUBMISSION_DEADLINE constant
- TIER_RANK_RANGES and TIER_PICK_COUNTS constants

DB-dependent validators (check_submissions_open, validate_no_duplicate_golfers,
validate_max_teams, validate_golfers_exist) are tested separately with mocks.
"""

import pytest
from datetime import datetime
from zoneinfo import ZoneInfo

from lib.models import Tier
from lib.validation import (
    SUBMISSION_DEADLINE,
    MAX_TEAMS_PER_EMAIL,
    TIER_RANK_RANGES,
    TIER_PICK_COUNTS,
    ValidationError,
    validate_tier_placement,
    validate_tier_composition,
)


# ---------------------------------------------------------------------------
# Constants validation
# ---------------------------------------------------------------------------


class TestConstants:
    """Verify critical business rule constants."""

    def test_submission_deadline(self):
        """Deadline must be 5:00 AM EST, Thursday April 9, 2026."""
        assert SUBMISSION_DEADLINE.year == 2026
        assert SUBMISSION_DEADLINE.month == 4
        assert SUBMISSION_DEADLINE.day == 9
        assert SUBMISSION_DEADLINE.hour == 5
        assert SUBMISSION_DEADLINE.minute == 0
        est = ZoneInfo("America/New_York")
        assert SUBMISSION_DEADLINE.tzinfo == est

    def test_max_teams_per_email(self):
        """Rule 3: max 3 entries per contestant."""
        assert MAX_TEAMS_PER_EMAIL == 3

    def test_tier_rank_ranges(self):
        """Rule 1: tier boundaries."""
        assert TIER_RANK_RANGES[Tier.TIER_1] == (1, 10)
        assert TIER_RANK_RANGES[Tier.TIER_2] == (11, 30)
        assert TIER_RANK_RANGES[Tier.TIER_3] == (31, 50)
        assert TIER_RANK_RANGES[Tier.TIER_4] == (51, 999)

    def test_tier_pick_counts(self):
        """Rule 1: picks per tier."""
        assert TIER_PICK_COUNTS[Tier.TIER_1] == 1
        assert TIER_PICK_COUNTS[Tier.TIER_2] == 2
        assert TIER_PICK_COUNTS[Tier.TIER_3] == 1
        assert TIER_PICK_COUNTS[Tier.TIER_4] == 1


# ---------------------------------------------------------------------------
# validate_tier_placement
# ---------------------------------------------------------------------------


class TestValidateTierPlacement:
    """Rule 1: Each golfer must be in the correct tier based on world rank."""

    def test_valid_tier1_rank_1(self):
        """Rank 1 is valid for Tier 1."""
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_1, "world_rank": 1}])

    def test_valid_tier1_rank_10(self):
        """Rank 10 (boundary) is valid for Tier 1."""
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_1, "world_rank": 10}])

    def test_invalid_tier1_rank_11(self):
        """Rank 11 is NOT valid for Tier 1 (belongs in Tier 2)."""
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_1, "world_rank": 11}])
        assert "does not belong in Tier 1" in exc_info.value.message
        assert "ranks 1-10" in exc_info.value.message

    def test_valid_tier2_rank_11(self):
        """Rank 11 (lower boundary) is valid for Tier 2."""
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_2, "world_rank": 11}])

    def test_valid_tier2_rank_30(self):
        """Rank 30 (upper boundary) is valid for Tier 2."""
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_2, "world_rank": 30}])

    def test_invalid_tier2_rank_10(self):
        """Rank 10 is NOT valid for Tier 2."""
        with pytest.raises(ValidationError):
            validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_2, "world_rank": 10}])

    def test_invalid_tier2_rank_31(self):
        """Rank 31 is NOT valid for Tier 2."""
        with pytest.raises(ValidationError):
            validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_2, "world_rank": 31}])

    def test_valid_tier3_rank_31(self):
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_3, "world_rank": 31}])

    def test_valid_tier3_rank_50(self):
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_3, "world_rank": 50}])

    def test_invalid_tier3_rank_51(self):
        with pytest.raises(ValidationError):
            validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_3, "world_rank": 51}])

    def test_valid_tier4_rank_51(self):
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_4, "world_rank": 51}])

    def test_valid_tier4_rank_200(self):
        """Very high rank still valid for Tier 4."""
        validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_4, "world_rank": 200}])

    def test_invalid_tier4_rank_50(self):
        """Rank 50 belongs in Tier 3, not Tier 4."""
        with pytest.raises(ValidationError):
            validate_tier_placement([{"golfer_id": "1", "name": "A", "tier": Tier.TIER_4, "world_rank": 50}])

    def test_multiple_golfers_all_valid(self):
        """Full valid team placement."""
        picks = [
            {"golfer_id": "1", "name": "A", "tier": Tier.TIER_1, "world_rank": 5},
            {"golfer_id": "2", "name": "B", "tier": Tier.TIER_2, "world_rank": 15},
            {"golfer_id": "3", "name": "C", "tier": Tier.TIER_2, "world_rank": 25},
            {"golfer_id": "4", "name": "D", "tier": Tier.TIER_3, "world_rank": 40},
            {"golfer_id": "5", "name": "E", "tier": Tier.TIER_4, "world_rank": 60},
        ]
        validate_tier_placement(picks)  # Should not raise

    def test_one_invalid_among_valid(self):
        """One bad pick in an otherwise valid group should raise."""
        picks = [
            {"golfer_id": "1", "name": "A", "tier": Tier.TIER_1, "world_rank": 5},
            {"golfer_id": "2", "name": "Bad Pick", "tier": Tier.TIER_2, "world_rank": 5},  # rank 5 not in T2
            {"golfer_id": "3", "name": "C", "tier": Tier.TIER_2, "world_rank": 25},
            {"golfer_id": "4", "name": "D", "tier": Tier.TIER_3, "world_rank": 40},
            {"golfer_id": "5", "name": "E", "tier": Tier.TIER_4, "world_rank": 60},
        ]
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_placement(picks)
        assert "Bad Pick" in exc_info.value.message


# ---------------------------------------------------------------------------
# validate_tier_composition
# ---------------------------------------------------------------------------


class TestValidateTierComposition:
    """Rule 1: Must have exactly 1 T1, 2 T2, 1 T3, 1 T4 golfers."""

    def _picks(self, tiers: list[int]) -> list[dict]:
        return [{"golfer_id": str(i), "name": f"G{i}", "tier": t, "world_rank": 1}
                for i, t in enumerate(tiers)]

    def test_valid_composition(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_2, Tier.TIER_3, Tier.TIER_4])
        validate_tier_composition(picks)  # Should not raise

    def test_too_few_golfers(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2])
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_composition(picks)
        assert "exactly 5" in exc_info.value.message

    def test_too_many_golfers(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_2, Tier.TIER_3, Tier.TIER_4, Tier.TIER_4])
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_composition(picks)
        assert "exactly 5" in exc_info.value.message

    def test_zero_golfers(self):
        with pytest.raises(ValidationError):
            validate_tier_composition([])

    def test_missing_tier1(self):
        picks = self._picks([Tier.TIER_2, Tier.TIER_2, Tier.TIER_2, Tier.TIER_3, Tier.TIER_4])
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_composition(picks)
        assert "Tier 1" in exc_info.value.message
        assert "requires 1 golfer(s), but got 0" in exc_info.value.message

    def test_too_many_tier1(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_1, Tier.TIER_2, Tier.TIER_3, Tier.TIER_4])
        with pytest.raises(ValidationError):
            validate_tier_composition(picks)

    def test_only_one_tier2(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_3, Tier.TIER_3, Tier.TIER_4])
        with pytest.raises(ValidationError) as exc_info:
            validate_tier_composition(picks)
        assert "Tier 2" in exc_info.value.message
        assert "requires 2 golfer(s), but got 1" in exc_info.value.message

    def test_three_tier2(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_2, Tier.TIER_2, Tier.TIER_4])
        with pytest.raises(ValidationError):
            validate_tier_composition(picks)

    def test_missing_tier3(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_2, Tier.TIER_4, Tier.TIER_4])
        with pytest.raises(ValidationError):
            validate_tier_composition(picks)

    def test_missing_tier4(self):
        picks = self._picks([Tier.TIER_1, Tier.TIER_2, Tier.TIER_2, Tier.TIER_3, Tier.TIER_3])
        with pytest.raises(ValidationError):
            validate_tier_composition(picks)

    def test_all_same_tier(self):
        picks = self._picks([Tier.TIER_2] * 5)
        with pytest.raises(ValidationError):
            validate_tier_composition(picks)


class TestValidationErrorAttributes:
    """Test ValidationError has field info for frontend consumption."""

    def test_validation_error_has_field(self):
        err = ValidationError("Bad input", field="golfers")
        assert err.field == "golfers"
        assert str(err) == "Bad input"

    def test_validation_error_field_optional(self):
        err = ValidationError("Generic error")
        assert err.field is None
