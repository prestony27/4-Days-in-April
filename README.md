# Four Days in April 2026 Contest

A fantasy golf contest website for the 2026 Masters Tournament (April 9-12). Users pick 5 golfers across tiered World Golf Rankings, pay a $30 entry fee, and compete for cash prizes based on combined tournament scores.

**Live Site:** https://4-days-in-april.vercel.app/

**Key Features:**
- Guided team builder wizard with tier-based golfer selection
- Multi-team cart with single checkout (submit up to 3 teams at once)
- Live tournament leaderboard with auto-polling (locked until submissions close)
- Stripe Checkout payment integration with automatic refunds
- Confirmation emails via Resend
- Pre-tournament withdrawal handling with auto-refunds
- ESPN-sourced live scoring with admin fallback
- Mobile-first responsive design

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend (Next.js) | ✅ Deployed | Live on Vercel |
| Backend (Next.js API Routes) | ✅ Deployed | 17 endpoints working |
| Database (Supabase) | ✅ Ready | Schema deployed, 91 golfers seeded |
| Stripe Payments | ✅ Configured | Test + live webhooks active |
| Email (Resend) | ✅ Configured | Confirmation emails on payment |
| Golfer Data | ✅ Seeded | 91 golfers with OWGR + ESPN IDs |

### Pre-Tournament Checklist

1. **Switch to live Stripe keys** - Update `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel
2. **Monitor submissions** - Teams visible in Supabase dashboard
3. **Handle withdrawals** - If a golfer withdraws, use `/api/admin/withdraw-golfer` to auto-refund affected teams
4. **Monitor cron** - Verify `/api/cron/update-scores` runs every 10 minutes during tournament hours (8am-8pm EDT)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| State | Zustand (client), TanStack Query (server) |
| Backend | Next.js API Routes (App Router) |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe Checkout + Webhooks |
| Email | Resend (transactional) |
| Deployment | Vercel |
| Rankings Data | DataGolf (OWGR scraping) |
| Live Scores | ESPN Leaderboard API |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)
- Stripe account (test mode)

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

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...

# App
FRONTEND_URL=http://localhost:3000
ADMIN_API_KEY=your-admin-secret
CRON_SECRET=your-cron-secret
```

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
│   ├── submit/success/page.tsx # Post-payment confirmation
│   ├── rules/page.tsx          # Full contest rules
│   └── api/                    # API route handlers
│       ├── health/route.ts
│       ├── golfers/route.ts
│       ├── leaderboard/route.ts
│       ├── submit-team/route.ts
│       ├── webhooks/payment/route.ts
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
| `/leaderboard` | `leaderboard/page.tsx` | Client | Live-updating leaderboard (locked until submission deadline) |
| `/submit` | `submit/page.tsx` | Static | Entry info page with CTA to the team builder |
| `/submit/success` | `submit/success/page.tsx` | Client | Post-payment confirmation with team details and golfer picks |
| `/rules` | `rules/page.tsx` | Static | Full contest rules rendered from constants |

### State Management

**Zustand (`src/store/team-builder.ts`)** — Client-side UI state for the team builder wizard:
- `currentStep`, `email`, `name`, `teamName`
- `selections` Map of golfer picks for current team
- `cart` Array of saved teams for batch checkout
- Actions: `selectGolfer`, `deselectGolfer`, `nextStep`, `prevStep`, `addToCart`, `removeFromCart`, `reset`

**TanStack Query (`src/providers/query-provider.tsx`)** — Server state for API data:
- Golfers list with 5-minute stale time
- Leaderboard with 30-second polling via `refetchInterval`

## Backend Architecture

### Request Flow

```
Client Request
  → Vercel Edge Network (CDN cache check)
    → Next.js Route Handler
      → Supabase REST API (database)
      → Stripe API (payments)
      → ESPN API (live scores)
```

All API routes are Next.js Route Handlers in `src/app/api/`. Each `route.ts` file exports named functions (`GET`, `POST`) that handle requests.

### Route Organization

| File | Endpoints | Purpose |
|------|-----------|---------|
| `src/app/api/golfers/route.ts` | GET `/api/golfers` | Golfer list with tier filtering |
| `src/app/api/golfers/[id]/route.ts` | GET `/api/golfers/{id}` | Single golfer details |
| `src/app/api/leaderboard/route.ts` | GET `/api/leaderboard` | Ranked teams with golfer scores |
| `src/app/api/teams/[id]/route.ts` | GET `/api/teams/{id}` | Single team detail (paid only) |
| `src/app/api/my-teams/route.ts` | GET `/api/my-teams?email=` | All teams for an email |
| `src/app/api/submit-team/route.ts` | POST `/api/submit-team` | Validate picks + create Stripe Checkout |
| `src/app/api/submit-teams/route.ts` | POST `/api/submit-teams` | Batch submit with single Stripe Checkout |
| `src/app/api/webhooks/payment/route.ts` | POST `/api/webhooks/payment` | Stripe payment confirmation + email |
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
| `src/lib/rate-limit.ts` | In-memory rate limiting for submit-team and my-teams |

## API Endpoints

### Public Endpoints

| Method | Endpoint | Cache | Rate Limit | Description |
|--------|----------|-------|------------|-------------|
| GET | `/api/golfers` | 60s CDN | — | List all golfers. Optional `?tier=1` filter |
| GET | `/api/golfers/{id}` | 60s CDN | — | Single golfer details |
| GET | `/api/leaderboard` | 30s CDN | — | Ranked teams (empty until deadline passes) |
| GET | `/api/teams/{id}` | 30s CDN | — | Single team detail (paid teams only) |
| GET | `/api/my-teams?email=` | No cache | 15/min | All teams for a given email |
| POST | `/api/submit-team` | — | 5/min | Validate picks, create team, return Stripe Checkout URL |
| POST | `/api/submit-teams` | — | 5/min | Batch submit multiple teams with single Stripe Checkout |
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
| POST | `/api/admin/upsert-golfers` | Add or update golfers (recommended for field updates) |
| POST | `/api/admin/update-score` | Manually update one golfer's score |
| POST | `/api/admin/update-scores-bulk` | Bulk score update + auto team recalculation |
| POST | `/api/admin/withdraw-golfer` | Pre-tournament withdrawal: refunds affected teams, sends notification |
| POST | `/api/admin/close-submissions` | Emergency submission close |
| POST | `/api/admin/open-submissions` | Re-open submissions |

#### Upsert Golfers (Recommended for Field Updates)

Use this endpoint to update the tournament field before the event. It handles both adding new golfers and updating existing ones in a single request, while preserving any scoring data.

```bash
curl -X POST https://4-days-in-april.vercel.app/api/admin/upsert-golfers \
  -H "Authorization: Bearer {ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "golfers": [
      { "id": "9478", "name": "Scottie Scheffler", "world_rank": 1, "tier": 1 },
      { "id": "9780", "name": "Jon Rahm", "world_rank": 2, "tier": 1 }
    ]
  }'
```

**Response:** `{ "created": 0, "updated": 2, "total": 2 }`

- **For existing golfers**: Updates `name`, `world_rank`, `tier` only. Preserves `score_to_par`, `thru`, `position`, `status`.
- **For new golfers**: Creates with provided data and default scoring values.

### Caching Strategy

Vercel Edge caches responses based on `Cache-Control` headers set by each endpoint:

- **Golfers**: `s-maxage=60, stale-while-revalidate=120` — data changes rarely
- **Leaderboard/Teams**: `s-maxage=30, stale-while-revalidate=60` — updates every 10 min via cron
- **My Teams**: `private, no-store` — user-specific, never cached
- **Submit/Webhooks/Admin**: No caching — write operations

## Payment Flow

### Single Team
```
1. User submits team → POST /api/submit-team
2. Backend validates picks (tiers, duplicates, deadline, max teams)
3. Any existing pending teams for this user are deleted (cleanup)
4. Team inserted with payment_status="pending"
5. Post-insert race condition checks (rollback if violated)
6. Stripe Checkout Session created → payment_url returned
7. User redirected to Stripe Checkout
8. Stripe sends webhook → POST /api/webhooks/payment
9. Webhook verifies signature, updates team to payment_status="completed"
10. Confirmation email sent via Resend with team details
```

### Multi-Team Cart
```
1. User builds teams in cart (frontend Zustand store)
2. User clicks "Checkout X Teams" → POST /api/submit-teams
3. Backend validates all teams + cross-team duplicate check
4. All teams inserted as pending, single Stripe Checkout with multiple line items
5. After payment, webhook marks all teams as completed
6. Single confirmation email sent with all team details
```

**Idempotency:** The webhook handler checks if `payment_status` is already `"completed"` before updating, so Stripe's 72-hour retry window is safe.

**Abandoned team cleanup:** Pending teams are automatically deleted when a user starts a new submission. This prevents golfers from being "locked" by unpaid teams.

**Local testing:** Use the Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/payment
```

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

The leaderboard is **locked until the submission deadline** to prevent users from copying other teams' picks. Before the deadline, `/api/leaderboard` returns an empty list and the frontend shows a "Not Yet Available" message with countdown.

### Duplicate Golfer Prevention

A golfer cannot appear on more than one of a user's paid teams. Validation checks only `completed` (paid) teams — pending/unpaid teams do not lock golfers. For multi-team cart submissions, duplicates are also checked across all teams in the cart before checkout. Post-insert race condition detection catches concurrent submissions.

### Pre-Tournament Withdrawals

If a golfer withdraws before the tournament starts:
1. Admin calls `POST /api/admin/withdraw-golfer` with the golfer's ID
2. System finds all completed teams containing that golfer
3. Each affected team receives an automatic $30 Stripe refund
4. Team is marked as `payment_status: "refunded"` (excluded from leaderboard and team limits)
5. Notification email sent to each affected user with refund confirmation
6. Users can submit a new team through the normal process

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

### Stripe Webhooks

**Important:** Test mode and live mode require separate webhooks with different signing secrets.

1. In Stripe dashboard, toggle to the correct mode (Test/Live)
2. Create a webhook endpoint: `https://4-days-in-april.vercel.app/api/webhooks/payment`
3. Subscribe to `checkout.session.completed` and `charge.refunded` events
4. Copy the signing secret and set `STRIPE_WEBHOOK_SECRET` in Vercel
5. When switching modes, update both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

### Resend (Email)

1. Create a Resend account at [resend.com](https://resend.com)
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key and set `RESEND_API_KEY` in Vercel environment variables
4. Confirmation emails are sent automatically after successful payment

### Supabase

1. Run migrations from `supabase/migrations/`
2. Ensure RLS policies are applied (migrations handle this)
3. Use the service role key for backend access (not the anon key)
4. Initialize tournament_state with `id = true` row

## Contest Rules Summary

1. Pick 5 golfers: 1 from ranks 1-10, 2 from 11-30, 1 from 31-50, 1 from 51+
2. Lowest combined score to par wins
3. $30 per team, max 3 teams per person
4. No duplicate golfers across your teams
5. If a golfer WDs or DQs mid-tournament, your team is disqualified
6. Submissions close 5:00 AM EDT, April 9th
7. Prizes: 1st (50%), 2nd (30%), 3rd (20%)
