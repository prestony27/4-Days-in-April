# Four Days in April 2026 Contest

A fantasy golf contest website for the 2026 Masters Tournament (April 9-12). Users pick 5 golfers across tiered World Golf Rankings, pay a $30 entry fee, and compete for cash prizes based on combined tournament scores.

**Live Site:** https://4-days-in-april.vercel.app/

**Key Features:**
- **Invite-only access** — Private contest restricted to invited participants
- Guided team builder wizard with tier-based golfer selection
- Multi-team cart with single checkout (submit up to 3 teams at once)
- Live tournament leaderboard with auto-polling
- Venmo payment with manual verification
- Confirmation emails via Resend
- ESPN-sourced live scoring with admin fallback
- Mobile-first responsive design

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend (Next.js) | ✅ Deployed | Live on Vercel |
| Backend (Next.js API Routes) | ✅ Deployed | 17 endpoints working |
| Database (Supabase) | ✅ Ready | Schema deployed, 91 golfers seeded |
| Payments (Venmo) | ✅ Manual | QR code + manual verification |
| Email (Resend) | ✅ Configured | Confirmation emails on submission |
| Golfer Data | ✅ Seeded | 91 golfers with OWGR + ESPN IDs |

### Pre-Tournament Checklist

1. **Verify Venmo payments** - Export Venmo transactions and update `payment_status` to `completed` in Supabase for paid entries
2. **Remove unpaid entries** - Delete teams with `payment_status = 'pending'` that haven't paid
3. **Handle withdrawals** - If a golfer withdraws, manually refund affected users via Venmo
4. **Monitor cron** - Verify `/api/cron/update-scores` runs every 10 minutes during tournament hours (8am-8pm EDT)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| State | Zustand (client), TanStack Query (server) |
| Backend | Next.js API Routes (App Router) |
| Database | Supabase (PostgreSQL) |
| Payments | Venmo (manual verification) |
| Email | Resend (transactional) |
| Deployment | Vercel |
| Rankings Data | DataGolf (OWGR scraping) |
| Live Scores | ESPN Leaderboard API |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email (Resend)
RESEND_API_KEY=re_...

# App
FRONTEND_URL=http://localhost:3000
ADMIN_API_KEY=your-admin-secret
CRON_SECRET=your-cron-secret

# Invite Codes (JSON array of valid codes)
INVITE_CODES=["YourInviteCode"]
```

### Invite Code Management

This is a private, invite-only contest. Valid invite codes are stored in the `INVITE_CODES` environment variable as a JSON array:

```env
# Single code
INVITE_CODES=["OGNoahBaker"]

# Multiple codes
INVITE_CODES=["Code1","Code2","Code3"]
```

- Codes are case-insensitive
- Users are locked out for 15 minutes after 5 failed attempts
- Codes are validated on both frontend and backend

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database Setup

Run the Supabase migration to create tables:

```bash
# Apply migrations via Supabase CLI
supabase db push
```

Or manually run the SQL files in `supabase/migrations/` in your Supabase dashboard.

Initialize the tournament state (required):
```sql
INSERT INTO tournament_state (id, current_round, tournament_status, submissions_open)
VALUES (true, 0, 'pre_tournament', true)
ON CONFLICT (id) DO NOTHING;
```

## Project Structure

```
TheMasters/
├── src/app/                    # Next.js App Router pages
│   ├── page.tsx                # Landing page (countdown, rules, CTAs)
│   ├── rankings/page.tsx       # Tiered golfer rankings with search
│   ├── teams/builder/page.tsx  # Step-by-step team builder wizard
│   ├── leaderboard/page.tsx    # Live tournament leaderboard
│   ├── submit/page.tsx         # Payment info page
│   ├── submit/payment/page.tsx # Venmo QR code and payment instructions
│   ├── submit/success/page.tsx # Post-submission confirmation
│   ├── rules/page.tsx          # Full contest rules
│   └── api/                    # API route handlers
│       ├── health/route.ts
│       ├── golfers/route.ts
│       ├── leaderboard/route.ts
│       ├── submit-team/route.ts
│       ├── submit-teams/route.ts
│       ├── cron/update-scores/route.ts
│       └── admin/              # Admin endpoints
├── src/components/
│   ├── shared/                 # Header, Footer, CountdownTimer, GolferCard, TierBadge
│   └── ui/                     # shadcn/ui components
├── src/lib/                    # Shared backend modules
│   ├── db.ts                   # Supabase client singleton
│   ├── schema.ts               # Table names, column constants
│   ├── validation.ts           # Tier rules, duplicate checks, deadline
│   ├── scoring.ts              # Score calculation + tiebreakers
│   ├── score-pipeline.ts       # Unified scoring for leaderboard/cron/admin
│   ├── espn-client.ts          # ESPN API client for live scores
│   ├── email.ts                # Resend client for confirmation emails
│   ├── auth.ts                 # Admin/cron auth helpers
│   └── rate-limit.ts           # Request rate limiting
├── src/store/                  # Zustand stores (team-builder.ts)
├── src/types/                  # TypeScript types
├── src/providers/              # React Query provider
├── supabase/migrations/        # Database schema SQL
└── vercel.json                 # Vercel cron config
```

## Frontend Architecture

### Next.js App Router

The frontend uses the Next.js App Router (`src/app/`). Each directory under `src/app/` maps to a URL route. Pages are React Server Components by default; those that need interactivity (state, effects, event handlers) are marked `"use client"` at the top.

| Route | File | Rendering | Purpose |
|-------|------|-----------|---------|
| `/` | `page.tsx` | Static | Landing page with countdown timer, rules overview, tier breakdown, and CTAs |
| `/rankings` | `rankings/page.tsx` | Client | Searchable, collapsible tier-grouped golfer list. Fetches from `/api/golfers` |
| `/teams/builder` | `teams/builder/page.tsx` | Client | 6-step team builder wizard with multi-team cart support |
| `/leaderboard` | `leaderboard/page.tsx` | Client | Shows entries before deadline, full leaderboard after |
| `/submit` | `submit/page.tsx` | Static | Entry info page with CTA to the team builder |
| `/submit/payment` | `submit/payment/page.tsx` | Client | Venmo QR code and payment instructions |
| `/submit/success` | `submit/success/page.tsx` | Client | Post-submission confirmation with team details |
| `/rules` | `rules/page.tsx` | Static | Full contest rules rendered from constants |

### State Management

**Zustand (`src/store/team-builder.ts`)** — Client-side UI state for the team builder wizard:
- `currentStep`, `email`, `name`, `teamName`
- `selections` Map of golfer picks for current team
- `cart` Array of saved teams for batch checkout
- Actions: `selectGolfer`, `deselectGolfer`, `nextStep`, `prevStep`, `addToCart`, `removeFromCart`, `reset`

**TanStack Query (`src/providers/query-provider.tsx`)** — Server state for API data:
- Golfers list with 5-minute stale time
- Leaderboard with 2-minute polling via `refetchInterval`

## Backend Architecture

### Request Flow

```
Client Request
  → Vercel Edge Network (CDN cache check)
    → Next.js Route Handler
      → Supabase REST API (database)
      → ESPN API (live scores)
```

All API routes are Next.js Route Handlers in `src/app/api/`. Each `route.ts` file exports named functions (`GET`, `POST`) that handle requests.

### Route Organization

| File | Endpoints | Purpose |
|------|-----------|---------|
| `src/app/api/golfers/route.ts` | GET `/api/golfers` | Golfer list with tier filtering |
| `src/app/api/golfers/[id]/route.ts` | GET `/api/golfers/{id}` | Single golfer details |
| `src/app/api/leaderboard/route.ts` | GET `/api/leaderboard` | Entries (pre-deadline) or ranked teams (post-deadline) |
| `src/app/api/teams/[id]/route.ts` | GET `/api/teams/{id}` | Single team detail |
| `src/app/api/submit-team/route.ts` | POST `/api/submit-team` | Validate picks, create team, send confirmation email |
| `src/app/api/submit-teams/route.ts` | POST `/api/submit-teams` | Batch submit multiple teams |
| `src/app/api/cron/update-scores/route.ts` | GET/POST `/api/cron/update-scores` | ESPN score ingestion |
| `src/app/api/admin/*/route.ts` | POST `/api/admin/*` | Seed, score, submissions management |

### Shared Modules

| Module | Purpose |
|--------|---------|
| `src/lib/db.ts` | Supabase client singleton |
| `src/lib/schema.ts` | Table names, column constants, valid enum values |
| `src/lib/validation.ts` | Submission rules: deadline, tiers, duplicates, max teams |
| `src/lib/scoring.ts` | Pure score calculation and tiebreaker logic |
| `src/lib/score-pipeline.ts` | Unified scoring pipeline for leaderboard, cron, and admin |
| `src/lib/espn-client.ts` | ESPN JSON API client (tournament ID `401811941`) |
| `src/lib/email.ts` | Resend client for confirmation emails |
| `src/lib/auth.ts` | Admin and cron Bearer token verification |
| `src/lib/rate-limit.ts` | Distributed rate limiting via Upstash Redis |

## API Endpoints

### Public Endpoints

| Method | Endpoint | Cache | Rate Limit | Description |
|--------|----------|-------|------------|-------------|
| GET | `/api/golfers` | 60s CDN | — | List all golfers. Optional `?tier=1` filter |
| GET | `/api/golfers/{id}` | 60s CDN | — | Single golfer details |
| GET | `/api/leaderboard` | 60s/30s CDN | — | Entries (pre-deadline) or full leaderboard (post-deadline) |
| GET | `/api/teams/{id}` | 30s CDN | — | Single team detail |
| POST | `/api/submit-team` | — | 5/min | Validate picks, create team, send confirmation email |
| POST | `/api/submit-teams` | — | 5/min | Batch submit multiple teams |
| GET | `/api/health` | — | — | Health check |

### Cron Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/cron/update-scores` | `CRON_SECRET` | Fetch ESPN scores, recalculate teams |

### Admin Endpoints

All require `Authorization: Bearer {ADMIN_API_KEY}`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/seed-golfers` | Seed golfer data (requires `id` field — ESPN athlete ID) |
| POST | `/api/admin/update-rankings` | Update golfer world rankings and tiers |
| POST | `/api/admin/upsert-golfers` | Add or update golfers (recommended for field updates) |
| POST | `/api/admin/update-score` | Manually update one golfer's score |
| POST | `/api/admin/update-scores-bulk` | Bulk score update + auto team recalculation |
| POST | `/api/admin/close-submissions` | Emergency submission close |
| POST | `/api/admin/open-submissions` | Re-open submissions |

### Caching Strategy

Vercel Edge caches responses based on `Cache-Control` headers set by each endpoint:

- **Golfers**: `s-maxage=60, stale-while-revalidate=120` — data changes rarely
- **Leaderboard/Teams**: `s-maxage=30, stale-while-revalidate=60` — updates every 10 min via cron
- **Submit/Admin**: No caching — write operations

## Payment Flow

Payment is handled via **Venmo with manual verification**.

### Submission Flow
```
1. User submits team → POST /api/submit-team
2. Backend validates picks (tiers, duplicates, deadline, max 3 teams)
3. Team inserted with payment_status="pending"
4. Confirmation email sent with Venmo payment instructions
5. User redirected to /submit/payment (Venmo QR code)
6. User pays via Venmo to @pyoung with note "4DIA"
7. User clicks "I've Completed Payment" → /submit/success
```

### Manual Payment Verification

Before the tournament starts, the admin must:
1. Export Venmo transactions
2. Match payments to submitted teams
3. Update `payment_status` to `"completed"` in Supabase for paid entries
4. Delete or refund entries that haven't paid

### Multi-Team Cart

Users can build up to 3 teams in their cart and submit them together. Each team costs $30.

**Team limits:** Each email can have a maximum of 3 teams total (regardless of payment status).

## Business Logic

### Tier Validation Rules

| Tier | World Ranking | Picks Required |
|------|--------------|----------------|
| 1 | 1–10 | 1 |
| 2 | 11–30 | 2 |
| 3 | 31–50 | 1 |
| 4 | 51+ | 1 |

Submission deadline: **5:00 AM EDT, April 9, 2026** (first round tee times). Enforced in `src/lib/validation.ts` and can be overridden via admin endpoints.

### Leaderboard Visibility

**Before the deadline:** The leaderboard shows an "Entries" view with team names and contestant names only. Golfer picks are hidden to prevent copying.

**After the deadline:** The full leaderboard is revealed with:
- Team rankings and scores
- Expandable rows showing each team's golfer picks
- Live score updates during the tournament

### Duplicate Golfer Prevention

A golfer cannot appear on more than one of a user's teams. Since payments are verified manually, validation checks **all teams for that user regardless of payment status** (both pending and completed). This prevents users from submitting duplicate golfers while awaiting payment verification. For multi-team cart submissions, duplicates are also checked across all teams in the cart before submission.

### Score Calculation

Team score = sum of each golfer's `score_to_par`. Tiebreakers (in order):
1. Lower total score to par
2. Better Tier 4 golfer score (best individual pick)
3. Better combined Tier 2 score

If a golfer is withdrawn (`STATUS_WITHDRAWN`) or disqualified (`STATUS_DISQUALIFIED`), their team is marked as disqualified and ranked below all active teams.

### Score Update Flow (Cron)

Every 10 minutes during tournament hours (8am-8pm EDT):
1. Cron hits `/api/cron/update-scores`
2. ESPN API fetched for leaderboard data
3. Each golfer's `score_to_par`, `thru`, `status`, `position` updated in DB
4. `tournament_state` updated with current round and status
5. All team `total_score` values recalculated via shared scoring pipeline

## Development

### Adding a new API endpoint

1. Create a directory under `src/app/api/` (e.g., `src/app/api/my-endpoint/`)
2. Add a `route.ts` file with exported `GET`, `POST`, etc. functions
3. Use `src/lib/db.ts` for database access
4. Add appropriate cache headers and rate limiting

Example:
```typescript
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = getSupabase();
  const { data, error } = await db.from("table").select("*");
  
  return Response.json(data, {
    headers: { "Cache-Control": "public, s-maxage=60" },
  });
}
```

### Database column names for teams

The tier columns use specific names — always reference these exactly:
```
tier1_golfer_id, tier2a_golfer_id, tier2b_golfer_id, tier3_golfer_id, tier4_golfer_id
```

**Payment status values:** `"pending"`, `"completed"`, `"refunded"` (DB CHECK constraint).

## Deployment

### Vercel

1. Connect the repository to Vercel
2. Set Framework Preset to **Next.js**
3. Set all environment variables in Vercel project settings
4. Deploy — Vercel handles everything automatically
5. Cron job (`/api/cron/update-scores`) runs every 10 minutes during tournament hours (8am-8pm EDT)

### Resend (Email)

1. Create a Resend account at [resend.com](https://resend.com)
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key and set `RESEND_API_KEY` in Vercel environment variables
4. Confirmation emails are sent automatically when teams are submitted

### Supabase

1. Run migrations from `supabase/migrations/`
2. Ensure RLS policies are applied (migrations handle this)
3. Use the service role key for backend access (not the anon key)
4. Initialize tournament_state with `id = true` row

## Scaling for High Traffic

This section documents the scalability configurations for handling 3,000+ concurrent users.

### Upstash Redis (Distributed Rate Limiting)

The app uses Upstash Redis for distributed rate limiting across serverless instances.

**Setup:**
1. Create an Upstash account at [upstash.com](https://upstash.com)
2. Create a new Redis database (free tier: 10,000 requests/day)
3. Add environment variables to Vercel:
   - `UPSTASH_REDIS_REST_URL` - Your Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN` - Your Upstash REST token

**Rate Limits:**
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/submit-team` | 5 requests | 1 minute |
| `/api/submit-teams` | 5 requests | 1 minute |
| Invite code validation | 5 failed attempts | 15-minute lockout |

### Supabase Connection Pooling

Enable connection pooling for high-concurrency database access.

**Setup:**
1. Go to Supabase Dashboard > Settings > Database
2. Under "Connection pooling", enable **Transaction mode**
3. Copy the pooler connection string (uses port 6543)
4. Add `SUPABASE_POOLER_URL` to Vercel environment variables

### Validation and Payment Status

Since payments are verified manually via Venmo, all submission validation (duplicate golfers, max teams) checks **all teams regardless of payment status**. This ensures users cannot submit duplicate golfers while their previous teams are still in "pending" status awaiting payment verification.

### Database Constraints

The app uses database-level triggers as a secondary safety net for race conditions:

1. **Max 3 teams trigger** (`enforce_max_completed_teams`): Prevents more than 3 completed teams per contestant. Fires when `payment_status` changes to `completed`.

2. **Duplicate golfer trigger** (`enforce_no_duplicate_golfers`): Prevents the same golfer appearing on multiple completed teams for one contestant.

**Note:** Application-level validation is the primary enforcement and checks all teams. Database triggers provide additional protection for paid teams only.

### Pre-computed Leaderboard Rankings

Rankings are pre-computed in PostgreSQL rather than calculated in JavaScript:

- **Migration:** `003_leaderboard_ranking.sql` adds `rank`, `tier4_score`, `tier2_combined_score` columns
- **Function:** `update_team_rankings()` uses PostgreSQL window functions for efficient ranking
- **Cron:** Rankings are recalculated after each score update

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_POOLER_URL` | Recommended | Supabase connection pooler URL (port 6543) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key for admin access |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |
| `RESEND_API_KEY` | Yes | Resend API key for emails |
| `FRONTEND_URL` | Yes | Frontend URL for redirects |
| `ADMIN_API_KEY` | Yes | Admin API authentication |
| `CRON_SECRET` | Yes | Cron job authentication |
| `INVITE_CODES` | Yes | JSON array of valid invite codes |

## Contest Rules Summary

1. Pick 5 golfers: 1 from ranks 1-10, 2 from 11-30, 1 from 31-50, 1 from 51+
2. Lowest combined score to par wins
3. $30 per team, max 3 teams per person
4. No duplicate golfers across your teams
5. If a golfer WDs or DQs mid-tournament, your team is disqualified
6. Submissions close 5:00 AM EDT, April 9th
7. Prizes: 1st (50%), 2nd (30%), 3rd (20%)
