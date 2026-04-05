"""Root FastAPI app — all API routes are mounted here.

Vercel routes all /api/* requests to this single handler via Mangum.
"""

import logging
import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# Ensure project root is on the path so `lib.*` imports resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routes.golfers import router as golfers_router
from api.routes.teams import router as teams_router
from api.routes.leaderboard import router as leaderboard_router
from api.routes.submit_team import router as submit_router
from api.routes.my_teams import router as my_teams_router
from api.routes.webhooks import router as webhooks_router
from api.routes.cron import router as cron_router
from api.routes.admin import router as admin_router

# ── Startup env validation ───────────────────────────────────────────
_VERCEL = os.environ.get("VERCEL", "")

if _VERCEL:
    # In production (Vercel): warn about missing critical env vars
    _REQUIRED = {
        "STRIPE_SECRET_KEY": "Stripe payments will fail",
        "STRIPE_WEBHOOK_SECRET": "Payment webhooks will be rejected",
        "SUPABASE_URL": "All database operations will fail",
        "SUPABASE_SERVICE_ROLE_KEY": "All database operations will fail",
        "CRON_SECRET": "Cron endpoint will return 500",
        "ADMIN_API_KEY": "Admin endpoints will return 500",
    }
    _WARNINGS = {
        "FRONTEND_URL": "Stripe redirects will go to localhost:3000",
        "ALLOWED_ORIGINS": "CORS will only allow localhost:3000",
    }
    for var, impact in _REQUIRED.items():
        if not os.environ.get(var):
            logger.error("MISSING ENV VAR %s — %s", var, impact)
    for var, impact in _WARNINGS.items():
        if not os.environ.get(var):
            logger.warning("MISSING ENV VAR %s — %s", var, impact)

# ── Rate limiter ─────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Four Days in April API", version="1.0.0")
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )


# CORS — allow the frontend origin
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "stripe-signature"],
)

# Mount routers
app.include_router(golfers_router, prefix="/api")
app.include_router(teams_router, prefix="/api")
app.include_router(leaderboard_router, prefix="/api")
app.include_router(submit_router, prefix="/api")
app.include_router(my_teams_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(cron_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Mangum handler for Vercel serverless
handler = Mangum(app, lifespan="off")
