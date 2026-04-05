"""ESPN Golf API client for fetching live leaderboard data."""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

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

    Includes rate limiting (min 120s between requests) and retry with backoff.
    """

    MIN_REQUEST_INTERVAL = 120  # seconds between ESPN requests

    def __init__(
        self,
        timeout: float = 15.0,
        max_retries: int = 3,
        client: httpx.AsyncClient | None = None,
    ):
        self._timeout = timeout
        self._max_retries = max_retries
        self._external_client = client
        self._last_request_time: float = 0

    async def _get_client(self) -> httpx.AsyncClient:
        """Return the shared client or create one with retry transport."""
        if self._external_client:
            return self._external_client
        transport = httpx.AsyncHTTPTransport(retries=self._max_retries)
        return httpx.AsyncClient(timeout=self._timeout, transport=transport)

    async def _fetch_event(self, tournament_id: str) -> dict:
        """Fetch raw ESPN event JSON with rate limiting and retry."""
        # Rate limiting: enforce minimum interval between requests
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if self._last_request_time > 0 and elapsed < self.MIN_REQUEST_INTERVAL:
            wait = self.MIN_REQUEST_INTERVAL - elapsed
            logger.info("Rate limit: waiting %.1fs before next ESPN request", wait)
            await asyncio.sleep(wait)

        client = await self._get_client()
        owns_client = self._external_client is None
        try:
            resp = await client.get(ESPN_LEADERBOARD_URL, params={"event": tournament_id})
            self._last_request_time = time.monotonic()
            resp.raise_for_status()
            data = resp.json()
        finally:
            if owns_client:
                await client.aclose()

        events = data.get("events", [])
        if not events:
            raise ValueError(f"No event data returned for tournament {tournament_id}")
        return events[0]

    @staticmethod
    def _get_competitors(event: dict) -> list[dict]:
        """Extract competitors from event, handling ESPN's nested structure."""
        competitions = event.get("competitions", [])
        if competitions:
            return competitions[0].get("competitors", [])
        return event.get("competitors", [])

    async def get_leaderboard(self, tournament_id: str) -> list[GolferScore]:
        """Parse ESPN competitors into GolferScore models."""
        event = await self._fetch_event(tournament_id)
        competitors = self._get_competitors(event)
        now = datetime.now(timezone.utc)

        golfers: list[GolferScore] = []
        parse_failures = 0
        for comp in competitors:
            try:
                golfer = self._parse_competitor(comp, now)
                golfers.append(golfer)
            except Exception:
                parse_failures += 1
                name = comp.get("athlete", {}).get("displayName", "unknown")
                logger.error("Failed to parse competitor: %s", name, exc_info=True)

        if parse_failures > 0:
            logger.error(
                "ESPN parse: %d/%d competitors failed to parse",
                parse_failures, len(competitors),
            )

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
        competitors = self._get_competitors(event)
        for comp in competitors:
            comp_status = comp.get("status", {})
            # status.period is the round number the player is in
            period = comp_status.get("period")
            if period and period > current_round:
                current_round = period
            if comp_status.get("type", {}).get("name") == "STATUS_IN_PROGRESS":
                break  # found an active player, round is reliable

        return TournamentState(
            current_round=current_round,
            tournament_status=tournament_status,
            submissions_open=tournament_status == TournamentStatus.PRE_TOURNAMENT,
            cut_line=None,  # ESPN doesn't directly expose this; computed separately
            last_score_update=datetime.now(timezone.utc),
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
