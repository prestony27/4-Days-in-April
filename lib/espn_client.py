"""ESPN Golf API client for fetching live leaderboard data."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime

import httpx

from lib.models import GolferScore, GolferStatus, TournamentState, TournamentStatus

logger = logging.getLogger(__name__)

# ESPN tournament IDs
MASTERS_2026_ID = "401811941"
VALERO_TEXAS_OPEN_2026_ID = "401811940"

ESPN_LEADERBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard"

# Map ESPN status strings to our enum
_ESPN_STATUS_MAP: dict[str, GolferStatus] = {
    "STATUS_IN_PROGRESS": GolferStatus.IN_PROGRESS,
    "STATUS_FINAL": GolferStatus.FINAL,
    "STATUS_CUT": GolferStatus.CUT,
    "STATUS_WITHDRAWN": GolferStatus.WITHDRAWN,
    "STATUS_DISQUALIFIED": GolferStatus.DISQUALIFIED,
    "STATUS_SUSPENDED": GolferStatus.SUSPENDED,
}

_ESPN_TOURNAMENT_STATUS_MAP: dict[str, TournamentStatus] = {
    "STATUS_SCHEDULED": TournamentStatus.PRE_TOURNAMENT,
    "STATUS_IN_PROGRESS": TournamentStatus.IN_PROGRESS,
    "STATUS_SUSPENDED": TournamentStatus.SUSPENDED,
    "STATUS_FINAL": TournamentStatus.COMPLETE,
}


class GolfDataSource(ABC):
    """Abstract base class for golf data providers."""

    @abstractmethod
    async def get_leaderboard(self, tournament_id: str) -> list[GolferScore]:
        """Fetch current leaderboard scores for a tournament."""
        ...

    @abstractmethod
    async def get_tournament_state(self, tournament_id: str) -> TournamentState:
        """Fetch current tournament metadata (round, status, etc.)."""
        ...


class ESPNClient(GolfDataSource):
    """Fetches live golf scores from ESPN's public JSON API.

    Endpoint: GET https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event={id}
    """

    def __init__(self, timeout: float = 15.0):
        self._timeout = timeout

    async def _fetch_event(self, tournament_id: str) -> dict:
        """Fetch raw ESPN event JSON."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(ESPN_LEADERBOARD_URL, params={"event": tournament_id})
            resp.raise_for_status()
            data = resp.json()

        events = data.get("events", [])
        if not events:
            raise ValueError(f"No event data returned for tournament {tournament_id}")
        return events[0]

    async def get_leaderboard(self, tournament_id: str) -> list[GolferScore]:
        """Parse ESPN competitors into GolferScore models."""
        event = await self._fetch_event(tournament_id)
        competitors = event.get("competitors", [])
        now = datetime.utcnow()

        golfers: list[GolferScore] = []
        for comp in competitors:
            try:
                golfer = self._parse_competitor(comp, now)
                golfers.append(golfer)
            except Exception:
                name = comp.get("athlete", {}).get("displayName", "unknown")
                logger.warning("Failed to parse competitor: %s", name, exc_info=True)

        return golfers

    async def get_tournament_state(self, tournament_id: str) -> TournamentState:
        """Parse ESPN event status into TournamentState."""
        event = await self._fetch_event(tournament_id)

        event_status = event.get("status", {})
        status_name = event_status.get("type", {}).get("name", "STATUS_SCHEDULED")
        tournament_status = _ESPN_TOURNAMENT_STATUS_MAP.get(
            status_name, TournamentStatus.PRE_TOURNAMENT
        )

        # Determine current round from competitor data
        current_round = 0
        competitors = event.get("competitors", [])
        for comp in competitors:
            comp_status = comp.get("status", {})
            if comp_status.get("type", {}).get("name") == "STATUS_IN_PROGRESS":
                linescores = comp.get("linescores", [])
                current_round = max(current_round, len(linescores))
                break

        # If no one is in progress, infer from linescores of first competitor
        if current_round == 0 and competitors:
            linescores = competitors[0].get("linescores", [])
            current_round = len([ls for ls in linescores if ls.get("value") is not None and ls.get("value") > 0])

        return TournamentState(
            current_round=current_round,
            tournament_status=tournament_status,
            submissions_open=tournament_status == TournamentStatus.PRE_TOURNAMENT,
            cut_line=None,  # ESPN doesn't directly expose this; computed separately
            last_score_update=datetime.utcnow(),
        )

    @staticmethod
    def _parse_competitor(comp: dict, now: datetime) -> GolferScore:
        """Parse a single ESPN competitor dict into a GolferScore."""
        athlete = comp.get("athlete", {})
        status = comp.get("status", {})
        status_type = status.get("type", {})

        # Score to par from statistics
        score_to_par: int | None = None
        for stat in comp.get("statistics", []):
            if stat.get("name") == "scoreToPar":
                val = stat.get("value")
                if val is not None:
                    score_to_par = int(val)
                break

        # Round scores from linescores
        round_scores: list[int | None] = []
        for ls in comp.get("linescores", []):
            val = ls.get("value")
            if val is not None and val > 0:
                round_scores.append(int(val))
            else:
                round_scores.append(None)

        # Total strokes
        total_strokes: int | None = None
        score_val = comp.get("score", {}).get("value")
        if score_val is not None:
            total_strokes = int(score_val)

        # Thru holes
        thru: int | None = None
        thru_val = status.get("thru")
        if thru_val is not None:
            thru = int(thru_val)

        # Position
        position = status.get("position", {}).get("displayName")

        # ESPN status -> our enum
        espn_status = status_type.get("name", "STATUS_IN_PROGRESS")
        golfer_status = _ESPN_STATUS_MAP.get(espn_status, GolferStatus.IN_PROGRESS)

        return GolferScore(
            espn_id=str(athlete.get("id", comp.get("id", ""))),
            name=athlete.get("displayName", "Unknown"),
            position=position,
            score_to_par=score_to_par,
            thru=thru,
            status=golfer_status,
            round_scores=round_scores,
            total_strokes=total_strokes,
            updated_at=now,
        )
