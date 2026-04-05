# The Masters Pool 2026

A fantasy golf pool website for the 2026 Masters Tournament (April 9-12). Users pick 5 golfers across tiered World Golf Rankings, pay a $30 entry fee, and compete for cash prizes based on combined tournament scores.

**Key Features:**
- Guided team builder wizard with tier-based golfer selection
- Live tournament leaderboard with auto-polling
- Stripe Checkout payment integration
- ESPN-sourced live scoring with admin fallback
- Mobile-first responsive design

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| State | Zustand (client), TanStack Query (server) |
| Backend | FastAPI (Python), Mangum (serverless adapter) |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe Checkout + Webhooks |
| Deployment | Vercel Pro (frontend + serverless Python functions) |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase project (free tier works)
- Stripe account (test mode)

### Installation

```bash
# Install frontend dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

### Environment Variables

Create a `.env.local` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
FRONTEND_URL=http://localhost:3000
ADMIN_API_KEY=your-admin-secret
CRON_SECRET=your-cron-secret
```

### Running Locally

```bash
# Start Next.js dev server
npm run dev

# Run the FastAPI backend (separate terminal)
uvicorn api.index:app --reload --port 8000
```

Open [http://localhost:3000](http://localhost:3000).

### Database Setup

Run the Supabase migration to create tables:

```bash
# Apply migrations via Supabase CLI
supabase db push
```

Or manually run the SQL files in `supabase/migrations/` in your Supabase dashboard.

## Project Structure

```
TheMasters/
├── src/app/                    # Next.js App Router pages
│   ├── page.tsx                # Landing page (countdown, rules, CTAs)
│   ├── rankings/page.tsx       # Tiered golfer rankings with search
│   ├── teams/builder/page.tsx  # Step-by-step team builder wizard
│   ├── leaderboard/page.tsx    # Live tournament leaderboard
│   ├── submit/page.tsx         # Payment info page
│   ├── submit/success/page.tsx # Post-payment confirmation
│   └── rules/page.tsx          # Full pool rules
├── src/components/
│   ├── shared/                 # Header, Footer, CountdownTimer, GolferCard, TierBadge
│   └── ui/                     # shadcn/ui components
├── src/store/                  # Zustand stores (team-builder.ts)
├── src/types/                  # TypeScript types matching API contracts
├── src/providers/              # React Query provider
├── api/                        # FastAPI backend (Vercel serverless)
│   ├── index.py                # App entrypoint with Mangum handler
│   └── routes/                 # API route modules
├── lib/                        # Shared Python modules
│   ├── models.py               # Pydantic data models
│   ├── validation.py           # Tier rules, duplicate checks, deadline
│   ├── scoring.py              # Score calculation + tiebreakers
│   ├── espn_client.py          # ESPN API client for live scores
│   ├── db.py                   # Supabase client
│   └── schema.py               # Shared schema constants
├── tests/                      # Python test suite (pytest)
├── supabase/migrations/        # Database schema SQL
└── vercel.json                 # Vercel deployment + cron config
```

## Frontend Architecture

### Next.js App Router

The frontend uses the Next.js App Router (`src/app/`). Each directory under `src/app/` maps to a URL route. Pages are React Server Components by default; those that need interactivity (state, effects, event handlers) are marked `"use client"` at the top.

| Route | File | Rendering | Purpose |
|-------|------|-----------|---------|
| `/` | `page.tsx` | Static | Landing page with countdown timer, rules overview, tier breakdown, and CTAs |
| `/rankings` | `rankings/page.tsx` | Client | Searchable, collapsible tier-grouped golfer list. Fetches from `/api/golfers` |
| `/teams/builder` | `teams/builder/page.tsx` | Client | 6-step team builder wizard (email/name, 4 tier picks, review + submit) |
| `/leaderboard` | `leaderboard/page.tsx` | Client | Live-updating leaderboard with expandable team rows and score details |
| `/submit` | `submit/page.tsx` | Static | Entry info page with CTA to the team builder |
| `/submit/success` | `submit/success/page.tsx` | Client | Post-payment confirmation (Stripe redirects here after checkout) |
| `/rules` | `rules/page.tsx` | Static | Full pool rules rendered from constants |

The root layout (`src/app/layout.tsx`) wraps all pages with:
- `<QueryProvider>` — TanStack Query context for data fetching
- `<Header>` — Sticky navigation bar with mobile hamburger menu and countdown timer
- `<Footer>` — Links and disclaimer
- `<Toaster>` — Sonner toast notifications

### Component Hierarchy

```
layout.tsx
├── QueryProvider (src/providers/query-provider.tsx)
│   ├── Header (src/components/shared/header.tsx)
│   │   └── CountdownTimer (compact mode)
│   ├── {page content}
│   ├── Footer (src/components/shared/footer.tsx)
│   └── Toaster (sonner)
```

### State Management

**Zustand (`src/store/team-builder.ts`)** — Client-side UI state for the team builder wizard:

| Field | Type | Purpose |
|-------|------|---------|
| `currentStep` | `number` | Which wizard step (0=email, 1-4=tiers, 5=review) |
| `email` | `string` | User's email for submission |
| `name` | `string` | User's display name |
| `teamName` | `string` | Name for this team entry |
| `selections` | `Map<string, TeamGolferSlot>` | Currently selected golfers keyed by ID |
| `usedGolferIds` | `Set<string>` | Golfer IDs already on user's other teams (prevents duplicates) |
| `submittedTeamCount` | `number` | How many teams user has already submitted |

Actions include `selectGolfer`, `deselectGolfer`, `nextStep`, `prevStep`, `isTierComplete`, `reset`, etc. The store enforces tier pick limits (1/2/1/1) at the selection level — if a tier is full, `selectGolfer` is a no-op.

**TanStack Query (`src/providers/query-provider.tsx`)** — Server state for API data:

- **Golfers list** (`queryKey: ["golfers"]`): Fetched once with 5-minute stale time. Used by both Rankings and Team Builder pages.
- **Leaderboard** (`queryKey: ["leaderboard"]`): Polls every 30 seconds via `refetchInterval`. Also refetches on window focus so returning users see fresh data.

**When to use which:** Zustand for ephemeral UI state that doesn't come from the server (wizard progress, form inputs, selections). TanStack Query for anything fetched from an API (golfer data, leaderboard).

### Key Components

**`CountdownTimer`** (`src/components/shared/countdown-timer.tsx`)
Displays time remaining until the submission deadline (5 AM EDT, April 9). Updates every second via `setInterval`. Has two modes: full (large numbers with labels, used on landing page) and compact (inline `Xd Xh Xm`, used in the header). Shows "Submissions Closed" when deadline passes.

**`GolferCard`** (`src/components/shared/golfer-card.tsx`)
Reusable card for displaying a golfer with rank badge, name, and tier indicator. Supports three visual states: default, selected (green ring + checkmark), and disabled (dimmed with reason text). Click handler toggles selection. Used in the team builder tier steps.

**`TierBadge`** (`src/components/shared/tier-badge.tsx`)
Color-coded badge showing tier label and rank range. Each tier has a distinct color: amber (T1), blue (T2), emerald (T3), purple (T4).

**`Header`** (`src/components/shared/header.tsx`)
Sticky header with Masters green background. Desktop: horizontal nav links + compact countdown. Mobile: hamburger menu that expands to full nav. All touch targets are minimum 44px per Apple HIG.

### Team Builder Wizard Flow

The wizard in `teams/builder/page.tsx` has 6 steps managed by the Zustand store's `currentStep`:

```
Step 0: EmailStep
  → Collects name, email, team name
  → Validates all fields before allowing "Continue"

Step 1-4: TierStep (one per tier)
  → Shows golfers for the current tier from the API
  → User taps GolferCards to select/deselect
  → Tier-full golfers are visually disabled
  → Golfers already on other teams show "Already on another team"
  → "Next Tier" button disabled until tier pick count is met
  → Selected golfers shown as removable badges above the list

Step 5: ReviewStep
  → Shows all 5 picks organized by tier with completion badges
  → Maps selections to backend format: { tier1, tier2_a, tier2_b, tier3, tier4 }
  → POSTs to /api/submit-team
  → On success, redirects to Stripe payment_url
  → Double-submit protection via isSubmitting state
```

Users can navigate back/forward between completed steps via the pill buttons at the top.

### Leaderboard Polling

The leaderboard page uses TanStack Query's `refetchInterval` for live updates:

```typescript
refetchInterval: 30_000,  // Poll every 30 seconds
refetchOnWindowFocus: true, // Immediate refresh when tab regains focus
```

The API response shape (`LeaderboardResponse`) includes:
- `teams[]` — Ranked teams with golfer details
- `total` — Total team count
- `last_updated` — Timestamp of most recent score update

Each team row is expandable (tap to toggle). Expanded view shows individual golfer scores with status badges (CUT, WD, DQ) and score-to-par coloring (red for under par, muted for over par).

### Styling

**Theme:** The app uses a custom Masters-inspired theme defined in `src/app/globals.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-masters-green` | `#006747` | Header, primary buttons, accents |
| `--color-masters-green-light` | `#008a5e` | Hover states |
| `--color-masters-green-dark` | `#004d35` | Badge text on yellow |
| `--color-masters-yellow` | `#f2c75c` | Accent/highlight (CTA buttons, date badge) |
| `--color-masters-cream` | `#faf8f0` | Page background |

The `--primary` CSS variable is set to `#006747` so all shadcn/ui components (buttons, badges, rings) automatically use Masters green.

**Tailwind CSS 4** with `@theme inline` block maps CSS variables to Tailwind utility classes (e.g., `bg-masters-green`, `text-masters-yellow`).

**shadcn/ui** components are installed in `src/components/ui/`. They're unstyled primitives that inherit from the CSS variable theme. Installed components: button, card, badge, separator, accordion, progress, input, dialog, scroll-area, sheet.

**Mobile-first approach:**
- Primary breakpoint: 640px (`sm:`)
- All touch targets: minimum 44x44px (`min-h-[44px]`)
- Header collapses to hamburger menu on mobile
- Team builder uses full-width cards on mobile, 2-column grid on desktop
- Leaderboard rows are tap-to-expand (no hover interactions)

### Frontend Development

**Adding a new page:**
1. Create a directory under `src/app/` (e.g., `src/app/my-page/`)
2. Add a `page.tsx` file — it's automatically routed to `/my-page`
3. Add `"use client"` at the top if the page needs state, effects, or event handlers
4. Add a nav link in `src/components/shared/header.tsx` if needed

**Adding a new component:**
- Shared/reusable: `src/components/shared/your-component.tsx`
- shadcn/ui: `npx shadcn@latest add [component-name]` (installs to `src/components/ui/`)

**Modifying the theme:**
- Colors: Edit the CSS variables in `src/app/globals.css` under `:root` (light) and `.dark` (dark mode)
- Custom Tailwind colors: Add entries to the `@theme inline` block in the same file
- Component styling: shadcn/ui components inherit from CSS variables — changing `--primary` changes all primary-colored components globally

**Adding a new API query:**
```typescript
// In your page or component:
import { useQuery } from "@tanstack/react-query";

const { data, isLoading, error } = useQuery({
  queryKey: ["your-key"],
  queryFn: async () => {
    const res = await fetch("/api/your-endpoint");
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  },
  staleTime: 60_000, // Cache for 1 minute
});
```

## Backend Architecture

### Request Flow

```
Client Request
  → Vercel Edge Network (CDN cache check)
    → Mangum (ASGI adapter)
      → FastAPI (CORS, rate limiting)
        → Route handler
          → Supabase REST API (database)
          → Stripe API (payments)
          → ESPN API (live scores)
```

All Python code runs as a single Vercel Serverless Function via `api/index.py`. Mangum translates between Vercel's AWS Lambda-style events and FastAPI's ASGI interface.

### Route Organization

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| `api/routes/golfers.py` | GET `/api/golfers`, `/api/golfers/{id}` | Golfer data with tier filtering |
| `api/routes/leaderboard.py` | GET `/api/leaderboard` | Ranked teams with golfer scores |
| `api/routes/teams.py` | GET `/api/teams/{team_id}` | Single team detail (paid only) |
| `api/routes/my_teams.py` | GET `/api/my-teams?email=` | All teams for an email |
| `api/routes/submit_team.py` | POST `/api/submit-team` | Validate picks + create Stripe Checkout |
| `api/routes/webhooks.py` | POST `/api/webhooks/payment` | Stripe payment confirmation |
| `api/routes/cron.py` | GET/POST `/api/cron/update-scores` | ESPN score ingestion |
| `api/routes/admin.py` | POST `/api/admin/*` | Seed, score, submissions management |

### Shared Modules

| Module | Purpose |
|--------|---------|
| `lib/models.py` | Pydantic models, enums (GolferStatus, Tier, PaymentStatus) |
| `lib/validation.py` | Submission rules: deadline, tiers, duplicates, max teams |
| `lib/scoring.py` | Score calculation, tiebreaker ranking |
| `lib/espn_client.py` | ESPN JSON API client (tournament ID `401811941`) |
| `lib/db.py` | Supabase client singleton |

## API Endpoints

### Public Endpoints

| Method | Endpoint | Cache | Rate Limit | Description |
|--------|----------|-------|------------|-------------|
| GET | `/api/golfers` | 60s CDN | — | List all golfers. Optional `?tier=1` filter (string or int) |
| GET | `/api/golfers/{id}` | 60s CDN | — | Single golfer details |
| GET | `/api/leaderboard` | 30s CDN | — | Ranked teams with golfer scores and tiebreakers |
| GET | `/api/teams/{id}` | 30s CDN | — | Single team detail (paid teams only) |
| GET | `/api/my-teams?email=` | No cache | 15/min | All teams for a given email |
| POST | `/api/submit-team` | — | 5/min | Validate picks, create team, return Stripe Checkout URL |
| GET | `/api/health` | — | — | Health check |

### Webhook / Cron Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/webhooks/payment` | Stripe signature | Payment confirmation (idempotent) |
| GET/POST | `/api/cron/update-scores` | `CRON_SECRET` | Fetch ESPN scores, recalculate teams |

### Admin Endpoints

All require `Authorization: Bearer {ADMIN_API_KEY}`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/seed-golfers` | Seed golfer data (requires `id` field — ESPN athlete ID) |
| POST | `/api/admin/update-rankings` | Update golfer world rankings and tiers |
| POST | `/api/admin/update-score` | Manually update one golfer's score |
| POST | `/api/admin/update-scores-bulk` | Bulk score update + auto team recalculation |
| POST | `/api/admin/close-submissions` | Emergency submission close |
| POST | `/api/admin/open-submissions` | Re-open submissions |

### Caching Strategy

Vercel Edge caches responses based on `Cache-Control` headers set by each endpoint:

- **Golfers**: `s-maxage=60, stale-while-revalidate=120` — data changes rarely
- **Leaderboard/Teams**: `s-maxage=30, stale-while-revalidate=60` — updates every 2 min via cron
- **My Teams**: `private, no-store` — user-specific, never cached
- **Submit/Webhooks/Admin**: No caching — write operations

## Payment Flow

```
1. User submits team → POST /api/submit-team
2. Backend validates picks (tiers, duplicates, deadline, max teams)
3. Team inserted with payment_status="pending"
4. Post-insert race condition checks (rollback if violated)
5. Stripe Checkout Session created → payment_url returned
6. User redirected to Stripe Checkout
7. Stripe sends webhook → POST /api/webhooks/payment
8. Webhook verifies signature, updates team to payment_status="completed"
```

**Idempotency:** The webhook handler checks if `payment_status` is already `"completed"` before updating, so Stripe's 72-hour retry window is safe.

**Orphan team protection:** Only 1 pending team allowed per user at a time. This prevents users from creating many unpaid teams to block golfer picks.

**Local testing:** Use the Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:8000/api/webhooks/payment
```

## Business Logic

### Tier Validation Rules

| Tier | World Ranking | Picks Required |
|------|--------------|----------------|
| 1 | 1–10 | 1 |
| 2 | 11–30 | 2 |
| 3 | 31–50 | 1 |
| 4 | 51+ | 1 |

Submission deadline: **5:00 AM EDT, April 9, 2026** (first round tee times). Enforced in `lib/validation.py` and can be overridden via admin endpoints.

### Duplicate Golfer Prevention

A golfer cannot appear on more than one of a user's teams. Checked against all non-refunded teams (both `completed` and `pending` payment status). Post-insert race condition detection catches concurrent submissions.

### Score Calculation

Team score = sum of each golfer's `score_to_par`. Tiebreakers (in order):
1. Lower total score to par
2. Better Tier 4 golfer score (best individual pick)
3. Better combined Tier 2 score

If a golfer is withdrawn (`STATUS_WITHDRAWN`) or disqualified (`STATUS_DISQUALIFIED`), their team is marked as disqualified and ranked below all active teams.

### Score Update Flow (Cron)

Every 2 minutes during the tournament:
1. Cron hits `/api/cron/update-scores`
2. ESPN API fetched for leaderboard data
3. Each golfer's `score_to_par`, `thru`, `status`, `position` updated in DB
4. `tournament_state` updated with current round and status
5. All team `total_score` values recalculated

## Backend Development

**Running locally:**
```bash
uvicorn api.index:app --reload --port 8000
```

**Adding a new endpoint:**
1. Create a route file in `api/routes/`
2. Define a `router = APIRouter(tags=["your-tag"])`
3. Add route handlers with appropriate rate limiting and cache headers
4. Import and mount the router in `api/index.py`

**Database column names for teams:**
The tier columns use specific names — always reference these exactly:
```
tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id, tier3_golfer_id, tier4_golfer_id
```

**Payment status values:** `"pending"`, `"completed"`, `"refunded"` (DB CHECK constraint).

See [API.md](./API.md) for full endpoint documentation with curl examples.

## Deployment

### Vercel

1. Connect the repository to Vercel
2. Set all environment variables in Vercel project settings
3. Deploy — Vercel handles both Next.js and Python serverless functions
4. Cron job (`/api/cron/update-scores`) runs every 2 minutes during tournament

### Stripe Webhooks

1. Create a webhook endpoint in Stripe dashboard pointing to `https://your-domain.com/api/webhooks/payment`
2. Subscribe to `checkout.session.completed` events
3. Set `STRIPE_WEBHOOK_SECRET` to the webhook signing secret

### Supabase

1. Run migrations from `supabase/migrations/`
2. Ensure RLS policies are applied (migrations handle this)
3. Use the service role key for backend access (not the anon key)

## Testing

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_validation.py
```

The test suite covers scoring logic, tiebreaker calculations, tier validation, team submission rules, and ESPN API client parsing.

## Pool Rules Summary

1. Pick 5 golfers: 1 from ranks 1-10, 2 from 11-30, 1 from 31-50, 1 from 51+
2. Lowest combined score to par wins
3. $30 per team, max 3 teams per person
4. No duplicate golfers across your teams
5. If a golfer WDs or DQs mid-tournament, your team is disqualified
6. Submissions close 5:00 AM EDT, April 9th
7. Prizes: 1st (50%), 2nd (30%), 3rd (20%)

---

## Data Layer Documentation

### Database Schema

The database runs on **Supabase (PostgreSQL)**. The full schema is in `supabase/migrations/001_initial_schema.sql`. Four tables:

#### `golfers` — Tournament field with live scoring

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | ESPN athlete ID (e.g., `"10030"`) |
| `name` | TEXT | Display name (e.g., `"Robert MacIntyre"`) |
| `world_rank` | INTEGER | World Golf Ranking position |
| `tier` | INTEGER | 1 (ranks 1-10), 2 (11-30), 3 (31-50), 4 (51+) |
| `score_to_par` | INTEGER | Current tournament score relative to par (e.g., `-14`) |
| `position` | TEXT | Leaderboard position (e.g., `"1"`, `"T2"`, `"-"` for cut) |
| `thru` | INTEGER | Holes completed in current round |
| `status` | TEXT | One of: `STATUS_IN_PROGRESS`, `STATUS_FINAL`, `STATUS_CUT`, `STATUS_WITHDRAWN`, `STATUS_DISQUALIFIED`, `STATUS_SUSPENDED` |
| `round_scores` | JSONB | Array of round strokes: `[66, 64, null, null]` |
| `total_strokes` | INTEGER | Cumulative strokes across all rounds |
| `updated_at` | TIMESTAMPTZ | Last time this row was updated |

Indexes on `tier`, `status`, and `world_rank`. Golfer IDs come from ESPN's athlete ID system.

#### `contestants` — People entering the pool

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `email` | TEXT (UNIQUE) | Contestant's email — used as identity |
| `name` | TEXT | Display name |
| `created_at` | TIMESTAMPTZ | Registration time |

Email has a unique index. The `contestants` table contains PII and is **not publicly readable** — all access goes through the backend API using the service role key.

#### `teams` — Submitted entries (max 3 per contestant)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `contestant_id` | UUID (FK) | References `contestants.id` |
| `team_name` | TEXT | User-chosen team name |
| `tier1_golfer_id` | TEXT (FK) | Golfer from tier 1 (ranks 1-10) |
| `tier2a_golfer_id` | TEXT (FK) | First golfer from tier 2 (ranks 11-30) |
| `tier2b_golfer_id` | TEXT (FK) | Second golfer from tier 2 (ranks 11-30) |
| `tier3_golfer_id` | TEXT (FK) | Golfer from tier 3 (ranks 31-50) |
| `tier4_golfer_id` | TEXT (FK) | Golfer from tier 4 (ranks 51+) |
| `total_score` | INTEGER | Sum of all 5 golfers' scores to par |
| `status` | TEXT | `active` or `disqualified` |
| `payment_status` | TEXT | `pending`, `completed`, or `refunded` |
| `payment_id` | TEXT | Stripe payment intent ID |
| `submitted_at` | TIMESTAMPTZ | Submission time |

Each golfer column is a foreign key to `golfers.id`. The 5-column design (vs. an array) enables referential integrity at the database level. The 3-team limit per contestant is enforced at the application layer with a post-insert race condition check.

#### `tournament_state` — Single-row global metadata

| Column | Type | Description |
|--------|------|-------------|
| `id` | BOOLEAN (PK) | Always `true` — constraint enforces single row |
| `current_round` | INTEGER | 0 (pre-tournament), 1-4 during play |
| `tournament_status` | TEXT | `pre_tournament`, `in_progress`, `suspended`, `complete` |
| `submissions_open` | BOOLEAN | Whether team submissions are accepted |
| `cut_line` | INTEGER | Score to par where cut falls (after R2) |
| `last_score_update` | TIMESTAMPTZ | When scores were last refreshed |

The `id = true` pattern with a CHECK constraint guarantees exactly one row. Query with `.eq("id", True)`.

#### Row Level Security (RLS)

All tables have RLS enabled:

| Table | Public Read | Public Write | Service Role |
|-------|------------|-------------|-------------|
| `golfers` | Yes | No | Full access |
| `tournament_state` | Yes | No | Full access |
| `teams` | Yes | No | Full access |
| `contestants` | **No** (PII) | No | Full access |

The backend uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS for writes.

#### Relationships

```
contestants (1) ──< teams (many)
                       │
                       ├── tier1_golfer_id  ──> golfers
                       ├── tier2a_golfer_id ──> golfers
                       ├── tier2b_golfer_id ──> golfers
                       ├── tier3_golfer_id  ──> golfers
                       └── tier4_golfer_id  ──> golfers
```

---

### ESPN API Integration

Live scores come from ESPN's public JSON API. Client: `lib/espn_client.py`.

#### Endpoint

```
GET https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event={tournamentId}
```

| Tournament | ID |
|---|---|
| Valero Texas Open (testing) | `401811940` |
| **Masters Tournament** | **`401811941`** |

#### Response Structure

Competitors are under `events[0].competitions[0].competitors[]`:

```
competitor
├── athlete.id                      → ESPN athlete ID (used as golfer.id)
├── athlete.displayName             → "Robert MacIntyre"
├── score.value                     → Total strokes (e.g., 138.0)
├── status
│   ├── position.displayName        → "1", "T2", "T15", "-"
│   ├── thru                        → Holes completed (integer)
│   ├── period                      → Current round number
│   └── type.name                   → "STATUS_IN_PROGRESS", "STATUS_CUT", etc.
├── statistics[0]
│   ├── name                        → "scoreToPar"
│   └── value                       → Numeric score to par (-6.0)
└── linescores[]
    └── [i].value                   → Round strokes (66, 64, ...)
```

#### Parsing Logic

`ESPNClient._parse_competitor()` maps each competitor to a `GolferScore` model:

1. **Score to par**: From `statistics[0]` where `name == "scoreToPar"`
2. **Round scores**: From `linescores[].value` as array `[66, 64, null, null]`
3. **Status**: ESPN strings mapped to `GolferStatus` enum
4. **Position**: From `status.position.displayName`

#### Rate Limiting and Retry

- **Rate limit**: 120s minimum between requests (configurable via `MIN_REQUEST_INTERVAL`)
- **Retry**: `httpx.AsyncHTTPTransport(retries=3)` for transient failures
- **Connection reuse**: Accepts optional shared `httpx.AsyncClient`; creates and closes one per request otherwise
- **Error logging**: Parse failures logged at ERROR with summary count

#### GolfDataSource ABC

```python
class GolfDataSource(ABC):
    async def get_leaderboard(self, tournament_id: str) -> list[GolferScore]: ...
    async def get_tournament_state(self, tournament_id: str) -> TournamentState: ...

class ESPNClient(GolfDataSource): ...      # Primary — free, unofficial
# Future: SportsDataIO, ManualEntry implementations
```

#### Testing Against Live Tournaments

```python
import asyncio
from lib.espn_client import ESPNClient, VALERO_TEXAS_OPEN_2026_ID

async def test():
    client = ESPNClient()
    client.MIN_REQUEST_INTERVAL = 0  # disable rate limit for testing
    golfers = await client.get_leaderboard(VALERO_TEXAS_OPEN_2026_ID)
    print(f"Golfers: {len(golfers)}")
    for g in sorted(golfers, key=lambda g: g.score_to_par or 999)[:5]:
        print(f"  {g.position:>4} {g.name:<25} {g.score_to_par:>+3}")

asyncio.run(test())
```

---

### Data Models (Pydantic)

All models in `lib/models.py`, shared between backend and data layer.

#### `GolferScore`

| Field | Type | Maps to DB |
|-------|------|-----------|
| `espn_id` | str | `golfers.id` |
| `name` | str | `golfers.name` |
| `world_rank` | int \| None | `golfers.world_rank` |
| `tier` | Tier \| None | `golfers.tier` (1-4) |
| `score_to_par` | int \| None | `golfers.score_to_par` |
| `position` | str \| None | `golfers.position` |
| `thru` | int \| None | `golfers.thru` |
| `status` | GolferStatus | `golfers.status` |
| `round_scores` | list[int \| None] | `golfers.round_scores` (JSONB) |
| `total_strokes` | int \| None | `golfers.total_strokes` |

Key computed properties:
- `made_cut` — True unless `STATUS_CUT`
- `is_active` — True for `IN_PROGRESS`, `FINAL`, `SUSPENDED`
- `is_eliminated` — True for `WITHDRAWN` or `DISQUALIFIED` (causes team DQ)

#### Other Models

- **`Team`** — 5 golfers via `TeamGolferSlot` entries. `validate_tier_composition()` checks 1/2/1/1 rule. Accessors: `tier_1_golfer`, `tier_2_golfers`, `tier_3_golfer`, `tier_4_golfer`.
- **`Contestant`** — `id`, `email`, `name`, `created_at`.
- **`TournamentState`** — `current_round` (0-4), `tournament_status`, `submissions_open`, `cut_line`, `last_score_update`.

#### Enums

| Enum | Values | Used In |
|------|--------|---------|
| `GolferStatus` | `IN_PROGRESS`, `FINAL`, `CUT`, `WITHDRAWN`, `DISQUALIFIED`, `SUSPENDED` | `golfers.status` |
| `TournamentStatus` | `PRE_TOURNAMENT`, `IN_PROGRESS`, `SUSPENDED`, `COMPLETE` | `tournament_state` |
| `Tier` | `1`, `2`, `3`, `4` | `golfers.tier` |
| `PaymentStatus` | `PENDING`, `COMPLETED`, `REFUNDED` | `teams.payment_status` |
| `TeamStatus` | `ACTIVE`, `DISQUALIFIED` | `teams.status` |

---

### Score Calculation

Lives in `lib/scoring.py`. Rules from `Rules.md`.

#### Team Score

Sum of all 5 golfers' `score_to_par`. Lower is better.

```python
# Example: -10 + -5 + -3 + 0 + 2 = -16
```

#### DQ/WD Handling

If any golfer has `STATUS_WITHDRAWN` or `STATUS_DISQUALIFIED`, the entire team is disqualified (`total_score = None`, sorts to bottom, no rank).

#### Missed Cut

Golfers with `STATUS_CUT` have their `score_to_par` frozen at their 36-hole total by ESPN. The score still counts — no special code needed.

#### Tiebreaker Logic

Applied in order when teams share the same total:

1. **Tier 4 golfer score** — lower wins
2. **Tier 2 combined score** — lower combined score from the two 11-30 ranked golfers wins
3. **Split** — tied teams share position and split prize money

```python
sort_key = (0, total_score, tier4_score, tier2_combined_score)
# DQ'd teams: (1, 0, 0, 0) — always sort last
```

Tied teams get the same rank. DQ'd teams don't consume rank positions.

#### `_recalculate_teams()` (in `api/routes/cron.py`)

Called after every score update. For each paid team: reads 5 golfer scores, checks WD/DQ, sums `score_to_par`, writes only if changed.

---

### Cron Job: Score Updates

Endpoint: `/api/cron/update-scores` — called by Vercel Cron every 2 minutes.

#### Flow

1. Fetch from ESPN via `ESPNClient.get_leaderboard(MASTERS_2026_ID)`
2. Upsert tournament state (round, status, timestamp)
3. Match ESPN golfers to DB by lowercase name
4. Update each golfer: `score_to_par`, `position`, `thru`, `status`, `round_scores`, `total_strokes`, `updated_at`
5. Recalculate all paid team scores

#### Vercel Cron Config (`vercel.json`)

```json
{"crons": [{"path": "/api/cron/update-scores", "schedule": "*/2 * * * *"}]}
```

Accepts GET (Vercel Cron) and POST. Auth: `Authorization: Bearer {CRON_SECRET}`.

#### Manual Fallback

If ESPN goes down, use admin endpoints (`/api/admin/update-score` or `/api/admin/update-scores-bulk`). See Operations section below for detailed instructions.

---

### Supabase Setup

#### 1. Create a Project

Go to [supabase.com](https://supabase.com), create a free project. From **Settings > API**, get:
- `SUPABASE_URL` — project URL (e.g., `https://abc123.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — full access key (bypasses RLS). Do **not** use the anon key for backend.

#### 2. Run Migrations

**Option A: Supabase CLI**
```bash
npm install -g supabase
supabase link --project-ref your-project-ref
supabase db push
```

**Option B: SQL Editor** — paste `supabase/migrations/001_initial_schema.sql` in the Supabase dashboard SQL Editor and run.

#### 3. Verify

- **Table Editor**: 4 tables with correct columns
- **tournament_state**: 1 seeded row
- **Authentication > Policies**: RLS policies visible

#### 4. Seed Golfer Data

```bash
curl -X POST https://your-domain.com/api/admin/seed-golfers \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"golfers": [
    {"name": "Scottie Scheffler", "world_rank": 1, "tier": 1},
    {"name": "Xander Schauffele", "world_rank": 2, "tier": 1}
  ]}'
```

Update rankings on Monday before the Masters with `/api/admin/update-rankings`.

#### 5. Dashboard Monitoring

During the tournament:
- **golfers** table: sort by `score_to_par` for leaderboard
- **teams** table: filter `payment_status = completed` for active entries
- **tournament_state**: check `last_score_update` to verify cron is running

---

## Operations During Tournament (April 9-12)

### What to Monitor

| Check | How | Frequency |
|-------|-----|-----------|
| Scores updating | Leaderboard shows "Last updated: X min ago" | Every 10 min during play |
| Cron job running | `GET /api/cron/update-scores` returns `golfers_updated > 0` | Every 10 min |
| Payments processing | Check Stripe dashboard for recent charges | After each submission |
| No errors | Vercel Functions logs (vercel.com dashboard > Functions) | Every 30 min |

**Active play hours (EDT):** Approximately 8:00 AM - 7:00 PM, Thursday-Sunday.

**How to know if something is broken:**
- Leaderboard "Last updated" timestamp stops advancing during play hours
- Users report scores not changing
- Vercel Functions tab shows 5xx errors or timeouts
- Stripe dashboard shows failed webhook deliveries

### Who Should Be On-Call

Designate one person to:
- Monitor the leaderboard every 30 minutes during active play
- Have access to the admin API key for manual score entry
- Be reachable by phone/text if users report issues
- Have CBS/ESPN Masters broadcast available as score backup

### Admin Endpoints Quick Reference

All admin calls require header: `Authorization: Bearer {ADMIN_API_KEY}`

**Update a single golfer's score:**
```bash
curl -X POST https://your-domain.com/api/admin/update-score \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "golfer_id": "12345",
    "score_to_par": -5,
    "thru": 14,
    "status": "STATUS_IN_PROGRESS",
    "round_scores": [68, 70, null, null],
    "position": "T3"
  }'
```

**Bulk update scores (for manual fallback):**
```bash
curl -X POST https://your-domain.com/api/admin/update-scores-bulk \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "golfers": [
      {"golfer_id": "123", "score_to_par": -8, "thru": 18, "status": "STATUS_FINAL"},
      {"golfer_id": "456", "score_to_par": -3, "thru": 12, "status": "STATUS_IN_PROGRESS"}
    ]
  }'
```

The bulk endpoint automatically recalculates all team scores after updating.

**Valid status values:** `STATUS_IN_PROGRESS`, `STATUS_FINAL`, `STATUS_CUT`, `STATUS_WITHDRAWN`, `STATUS_DISQUALIFIED`, `STATUS_SUSPENDED`

**Close submissions (emergency):**
```bash
curl -X POST https://your-domain.com/api/admin/close-submissions \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

**Re-open submissions (e.g., after a pre-tournament withdrawal):**
```bash
curl -X POST https://your-domain.com/api/admin/open-submissions \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

---

## Troubleshooting

### ESPN API not returning data

**Symptoms:** Leaderboard "Last updated" is stale, cron returns `golfers_updated: 0`.

1. **Check if ESPN API is responding:**
   ```bash
   curl "https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=401811941"
   ```
   If this returns empty or errors, ESPN's API is down.

2. **Check Vercel function logs** for `ESPN API fetch failed` errors.

3. **Verify the tournament ID:** The 2026 Masters ID is `401811941`. If ESPN changes their IDs, update `MASTERS_2026_ID` in `lib/espn_client.py`.

4. **Fallback:** Switch to manual score entry using admin endpoints (see above). One person watches the broadcast and updates scores every 15-30 minutes.

### Stripe webhook not firing

**Symptoms:** Users pay but their team stays `payment_status: "pending"`.

1. **Check Stripe Dashboard > Developers > Webhooks** for failed deliveries.

2. **Verify the webhook URL** is `https://your-domain.com/api/webhooks/payment` (include the full `/api/` prefix).

3. **Verify the webhook secret** matches `STRIPE_WEBHOOK_SECRET` in Vercel env vars. Stripe regenerates the secret if you recreate the endpoint.

4. **Check subscribed events:** Must include `checkout.session.completed`.

5. **Manual fix:** If a payment succeeded in Stripe but the team is still pending, you can update the team directly in the Supabase dashboard:
   ```sql
   UPDATE teams SET payment_status = 'completed', status = 'active'
   WHERE id = 'team-uuid-here';
   ```

### Cron job not running

**Symptoms:** Scores never update automatically.

1. **Verify Vercel Pro plan** is active. Hobby plan only supports daily cron, not per-minute.

2. **Check Vercel Dashboard > Settings > Cron Jobs** to see if the job is registered and its last run status.

3. **Test manually:**
   ```bash
   curl -X GET https://your-domain.com/api/cron/update-scores \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
   If this works, the endpoint is fine and the issue is Vercel's cron scheduling.

4. **External cron backup:** Set up [cron-job.org](https://cron-job.org) to hit the endpoint every 2 minutes as a belt-and-suspenders approach.

### Team submission failing

**Symptoms:** Users get errors when trying to submit a team.

| Error | Cause | Fix |
|-------|-------|-----|
| "Submissions are closed" | Past deadline or manually closed | Check `tournament_state.submissions_open` in Supabase |
| "does not belong in Tier X" | Golfer's WGR doesn't match tier | Verify golfer rankings in DB match current WGR |
| "already on another of your teams" | Duplicate golfer across user's teams | Expected behavior per rules |
| "Maximum of 3 teams" | User has 3 teams (paid + pending) | Expected behavior per rules |
| "Payment service error" | Stripe API issue | Check [status.stripe.com](https://status.stripe.com) |

---

## Emergency Procedures

### If ESPN goes down during the tournament

**Impact:** Automatic score updates stop. Leaderboard freezes.

**Response time:** Act within 15 minutes of detection.

**Steps:**
1. Confirm ESPN is down by testing the API URL directly (see Troubleshooting)
2. Open the Masters broadcast on CBS/ESPN TV or masters.com
3. Use `/api/admin/update-scores-bulk` to push scores manually every 15-30 minutes
4. The leaderboard will update normally -- users won't know the difference
5. Continue monitoring. If ESPN comes back, the cron job resumes automatically.

### If Stripe fails during submissions

**Impact:** Users can build teams but can't pay.

**Steps:**
1. Check [status.stripe.com](https://status.stripe.com) for outages
2. Short outage: Tell users to try again in a few minutes. Teams are saved as "pending."
3. Extended outage before deadline: Consider extending deadline via `/api/admin/open-submissions`
4. If payments succeeded in Stripe but webhook failed: Manually update team status in Supabase (see Troubleshooting)

### If Vercel has an outage

**Impact:** Entire site is down.

**Steps:**
1. Check [status.vercel.com](https://status.vercel.com)
2. During submission period: Communicate deadline extension to users
3. During tournament: Scores are cached in Supabase and will be correct when the site comes back. No data is lost.
4. Leaderboard-only fallback: Query Supabase directly and share results manually

### If a golfer withdraws before Round 1

**Impact:** Teams with that golfer need to resubmit per Rule 7.

**Steps:**
1. Identify affected teams by querying Supabase for teams containing the golfer's ID
2. Notify affected users (check their email in the contestants table)
3. Re-open submissions if needed: `POST /api/admin/open-submissions`
4. Set a new resubmission deadline (communicate to users)
5. If no resubmission received, issue refund through Stripe dashboard

---

## Known Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| ESPN API is undocumented | Could break without warning | Manual score entry fallback |
| Vercel function timeout (60s on Pro) | Large score recalculations could timeout | Batch operations are optimized |
| Supabase free tier: 500 MB storage | Unlikely to be an issue | Monitor in Supabase dashboard |
| Polling only (no real-time push) | Leaderboard updates every 30s, not instant | Golf scores change slowly; acceptable |
| Email-based identity (no auth) | Cannot fully verify user identity | Acceptable for friend-group pool; verify identity for payouts |
| Single ESPN data source | No cross-validation of scores | Admin can manually correct if needed |

---

## Security Considerations

### Required Environment Variables

All of these **must** be set in production:

| Variable | Purpose | Where to get it |
|----------|---------|----------------|
| `SUPABASE_URL` | Database connection | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend DB access (bypasses RLS) | Supabase > Settings > API |
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls | Stripe > Developers > API keys |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures | Stripe > Developers > Webhooks |
| `ADMIN_API_KEY` | Protect admin endpoints | Generate random string (32+ chars) |
| `CRON_SECRET` | Protect cron endpoint | Generate random string (32+ chars) |
| `FRONTEND_URL` | Stripe redirect URLs | Your deployed domain |

### Security Measures in Place

- Stripe webhook signature verification prevents spoofed payment confirmations
- Admin endpoints require API key; cron endpoint requires separate secret
- Supabase RLS: contestants table (emails) is not publicly readable
- Email normalization prevents duplicate accounts via case variations
- Post-insert race condition checks prevent duplicate golfers or exceeding team limits
- Supabase client uses parameterized queries (no SQL injection)

### What NOT to Do

- **Never expose `ADMIN_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`** in frontend code, logs, or error messages
- **Never use the Supabase anon key** for backend operations
- **Never disable webhook signature verification** -- use Stripe CLI to forward events locally for testing
- **Never commit `.env.local`** to version control

For the full risk analysis, see [RISKS.md](./RISKS.md).
