"""Tests for ESPN API client parsing logic in lib/espn_client.py.

Tests use fixture JSON data mimicking ESPN's response structure.
Focuses on _parse_competitor() since it's the core parsing logic.
"""

import pytest
from datetime import datetime

from lib.models import GolferScore, GolferStatus, TournamentStatus
from lib.espn_client import ESPNClient


# ---------------------------------------------------------------------------
# ESPN response fixtures
# ---------------------------------------------------------------------------

def _make_competitor(
    athlete_id: str = "1234",
    display_name: str = "Tiger Woods",
    score_to_par: int | None = -5,
    total_strokes: int | None = 275,
    status_name: str = "STATUS_IN_PROGRESS",
    position: str = "T2",
    thru: int | None = 12,
    round_scores: list[int | None] | None = None,
) -> dict:
    """Build an ESPN competitor dict matching their JSON structure."""
    if round_scores is None:
        round_scores = [68, 70, None, None]

    comp = {
        "athlete": {
            "id": athlete_id,
            "displayName": display_name,
        },
        "score": {
            "displayValue": str(total_strokes) if total_strokes else "",
            "value": total_strokes,
        },
        "status": {
            "type": {
                "name": status_name,
                "description": "In Progress",
            },
            "position": {
                "displayName": position,
            },
            "thru": thru,
            "displayValue": f"Thru {thru}" if thru else "F",
        },
        "statistics": [
            {
                "name": "scoreToPar",
                "displayValue": str(score_to_par) if score_to_par is not None else "E",
                "value": score_to_par,
            }
        ],
        "linescores": [
            {"value": rs} for rs in round_scores
        ],
    }
    return comp


# ---------------------------------------------------------------------------
# _parse_competitor tests
# ---------------------------------------------------------------------------


class TestParseCompetitor:
    """Tests for ESPNClient._parse_competitor() static method."""

    def test_basic_active_golfer(self):
        comp = _make_competitor(
            athlete_id="9876",
            display_name="Scottie Scheffler",
            score_to_par=-8,
            total_strokes=280,
            status_name="STATUS_IN_PROGRESS",
            position="1",
            thru=14,
            round_scores=[66, 70, None, None],
        )
        now = datetime.utcnow()
        result = ESPNClient._parse_competitor(comp, now)

        assert result.espn_id == "9876"
        assert result.name == "Scottie Scheffler"
        assert result.score_to_par == -8
        assert result.total_strokes == 280
        assert result.status == GolferStatus.IN_PROGRESS
        assert result.position == "1"
        assert result.thru == 14
        assert result.round_scores == [66, 70, None, None]

    def test_finished_golfer(self):
        comp = _make_competitor(
            status_name="STATUS_FINAL",
            score_to_par=-14,
            total_strokes=274,
            thru=None,
            round_scores=[68, 66, 70, 70],
        )
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())

        assert result.status == GolferStatus.FINAL
        assert result.score_to_par == -14
        assert result.round_scores == [68, 66, 70, 70]

    def test_missed_cut_golfer(self):
        comp = _make_competitor(
            status_name="STATUS_CUT",
            score_to_par=6,
            total_strokes=150,
            thru=None,
            round_scores=[74, 76, None, None],
        )
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())

        assert result.status == GolferStatus.CUT
        assert result.score_to_par == 6
        assert result.made_cut is False
        assert len([s for s in result.round_scores if s is not None]) == 2

    def test_withdrawn_golfer(self):
        comp = _make_competitor(
            status_name="STATUS_WITHDRAWN",
            score_to_par=None,
            total_strokes=None,
            thru=None,
            round_scores=[72, None, None, None],
        )
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())

        assert result.status == GolferStatus.WITHDRAWN
        assert result.is_eliminated is True
        assert result.is_active is False

    def test_disqualified_golfer(self):
        comp = _make_competitor(
            status_name="STATUS_DISQUALIFIED",
            score_to_par=None,
            total_strokes=None,
        )
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())

        assert result.status == GolferStatus.DISQUALIFIED
        assert result.is_eliminated is True

    def test_suspended_golfer(self):
        comp = _make_competitor(
            status_name="STATUS_SUSPENDED",
            score_to_par=-3,
            thru=10,
        )
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())

        assert result.status == GolferStatus.SUSPENDED
        assert result.is_active is True

    def test_unknown_status_defaults_to_in_progress(self):
        comp = _make_competitor(status_name="STATUS_UNKNOWN_FUTURE")
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.status == GolferStatus.IN_PROGRESS

    def test_missing_score_to_par(self):
        """Golfer with no statistics should have score_to_par=None."""
        comp = _make_competitor()
        comp["statistics"] = []
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.score_to_par is None

    def test_missing_athlete_data(self):
        """Competitor with minimal athlete info should still parse."""
        comp = _make_competitor()
        comp["athlete"] = {}
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.name == "Unknown"

    def test_missing_position(self):
        comp = _make_competitor()
        comp["status"]["position"] = {}
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.position is None

    def test_null_thru(self):
        comp = _make_competitor(thru=None)
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.thru is None

    def test_zero_value_linescores_treated_as_none(self):
        """ESPN uses 0 for unplayed rounds — our parser should map to None."""
        comp = _make_competitor(round_scores=[68, 70, 0, 0])
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        # Per espn_client.py: val > 0 → int, else → None
        assert result.round_scores == [68, 70, None, None]

    def test_empty_linescores(self):
        comp = _make_competitor()
        comp["linescores"] = []
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.round_scores == []

    def test_score_to_par_even(self):
        """Even par (0) should parse correctly, not as falsy/None."""
        comp = _make_competitor(score_to_par=0)
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.score_to_par == 0

    def test_positive_score_to_par(self):
        comp = _make_competitor(score_to_par=5)
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.score_to_par == 5

    def test_espn_id_from_athlete(self):
        """ESPN ID should come from athlete.id."""
        comp = _make_competitor(athlete_id="5555")
        comp["id"] = "9999"  # fallback ID
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.espn_id == "5555"

    def test_espn_id_fallback_to_comp_id(self):
        """If athlete.id missing, fall back to comp.id."""
        comp = _make_competitor()
        del comp["athlete"]["id"]
        comp["id"] = "fallback_id"
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.espn_id == "fallback_id"


class TestParseCompetitorEdgeCases:
    """Malformed/unusual ESPN data handling."""

    def test_missing_score_object(self):
        """No score object at all."""
        comp = _make_competitor()
        del comp["score"]
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.total_strokes is None

    def test_missing_status_type(self):
        """Status without type subobject."""
        comp = _make_competitor()
        comp["status"]["type"] = {}
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        # Should default to IN_PROGRESS
        assert result.status == GolferStatus.IN_PROGRESS

    def test_statistics_with_wrong_name(self):
        """Statistics array without scoreToPar entry."""
        comp = _make_competitor()
        comp["statistics"] = [{"name": "earnings", "value": 1000000}]
        result = ESPNClient._parse_competitor(comp, datetime.utcnow())
        assert result.score_to_par is None
