# Masters Pool API Reference

Base URL: `/api`

## Public Endpoints

### GET /api/golfers

List all golfers in the tournament field.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `tier` | string/int | Filter by tier: `1`, `2`, `3`, `4` (or `tier1`, `tier2`, etc.) |

**Response:**
```json
{
  "golfers": [
    {
      "id": "10046",
      "name": "Scottie Scheffler",
      "world_rank": 1,
      "tier": 1,
      "score_to_par": -5,
      "thru": 14,
      "status": "STATUS_IN_PROGRESS",
      "round_scores": [66, 68, null, null]
    }
  ],
  "count": 87
}
```

**Cache:** `s-maxage=60, stale-while-revalidate=120`

```bash
curl https://yourdomain.com/api/golfers
curl https://yourdomain.com/api/golfers?tier=1
```

---

### GET /api/golfers/{golfer_id}

Single golfer details.

**Response:** Single golfer object (same shape as above).

**Cache:** `s-maxage=60, stale-while-revalidate=120`

```bash
curl https://yourdomain.com/api/golfers/10046
```

---

### GET /api/leaderboard

Ranked team leaderboard with tiebreaker logic applied.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Max teams to return (1-500) |
| `offset` | int | 0 | Pagination offset |

**Response:**
```json
{
  "teams": [
    {
      "rank": 1,
      "team_id": "uuid",
      "team_name": "My Masters Pick",
      "contestant_name": "John Doe",
      "total_score": -12,
      "status": "active",
      "golfers": [
        {
          "id": "10046",
          "name": "Scottie Scheffler",
          "world_rank": 1,
          "tier": 1,
          "score_to_par": -5,
          "thru": 14,
          "status": "STATUS_IN_PROGRESS",
          "round_scores": [66, 68, null, null]
        }
      ]
    }
  ],
  "total": 150,
  "last_updated": "2026-04-10T18:30:00Z"
}
```

**Tiebreaker order:** Lowest total score > lowest tier-4 (51+) golfer score > lowest combined tier-2 (11-30) scores > split prizes.

**Cache:** `s-maxage=30, stale-while-revalidate=60`

```bash
curl https://yourdomain.com/api/leaderboard
curl https://yourdomain.com/api/leaderboard?limit=10&offset=0
```

---

### GET /api/teams/{team_id}

Single team details (paid teams only).

**Response:**
```json
{
  "id": "uuid",
  "team_name": "My Masters Pick",
  "contestant_name": "John Doe",
  "total_score": -12,
  "status": "active",
  "payment_status": "completed",
  "golfers": [ ... ],
  "submitted_at": "2026-04-08T12:00:00Z"
}
```

**Cache:** `s-maxage=30, stale-while-revalidate=60`

```bash
curl https://yourdomain.com/api/teams/your-team-uuid
```

---

### GET /api/my-teams?email={email}

All teams for a given email address.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `email` | string | **Required.** Email address to look up. |

**Response:**
```json
{
  "teams": [
    {
      "id": "uuid",
      "team_name": "My Masters Pick",
      "contestant_name": "John Doe",
      "total_score": -12,
      "status": "active",
      "payment_status": "completed",
      "golfers": [ ... ],
      "submitted_at": "2026-04-08T12:00:00Z"
    }
  ],
  "count": 2
}
```

**Cache:** `private, no-store` (user-specific, never cached)

```bash
curl "https://yourdomain.com/api/my-teams?email=john@example.com"
```

---

### POST /api/submit-team

Submit a new team. Validates picks, creates team (pending payment), and returns a Stripe Checkout URL.

**Request Body:**
```json
{
  "email": "john@example.com",
  "name": "John Doe",
  "team_name": "My Masters Pick",
  "golfers": {
    "tier1": "10046",
    "tier2_a": "10330",
    "tier2_b": "10592",
    "tier3": "10895",
    "tier4": "11203"
  }
}
```

**Response (200):**
```json
{
  "team_id": "uuid",
  "payment_url": "https://checkout.stripe.com/c/pay/..."
}
```

**Error (422):**
```json
{
  "detail": {
    "message": "Submissions are closed. The deadline was 5:00 AM EST, April 9th.",
    "field": null
  }
}
```

**Validations performed:**
- Submission deadline (5:00 AM EDT, April 9, 2026)
- Manual submissions_open flag
- All golfer IDs exist in DB
- Tier composition: 1 from tier 1, 2 from tier 2, 1 from tier 3, 1 from tier 4
- Each golfer's world rank falls within their assigned tier range
- No duplicate golfers across contestant's existing teams (paid + pending)
- Max 3 teams per email

```bash
curl -X POST https://yourdomain.com/api/submit-team \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "name": "John Doe",
    "team_name": "My Masters Pick",
    "golfers": {
      "tier1": "10046",
      "tier2_a": "10330",
      "tier2_b": "10592",
      "tier3": "10895",
      "tier4": "11203"
    }
  }'
```

---

## Webhook Endpoints

### POST /api/webhooks/payment

Stripe webhook for payment events. **Do not call manually.**

**Headers:** `stripe-signature` (required)

**Handled events:**
- `checkout.session.completed` — marks team as `payment_status: "completed"`, `status: "active"`
- `charge.refunded` — marks team as `payment_status: "refunded"`

Idempotent: re-delivery of an already-completed payment is a no-op.

---

## Cron Endpoints

### GET|POST /api/cron/update-scores

Fetches live scores from ESPN API, updates golfer scores, and recalculates all team totals.

**Auth:** `Authorization: Bearer {CRON_SECRET}` (skipped if CRON_SECRET env var is unset)

**Response:**
```json
{
  "golfers_updated": 87,
  "teams_recalculated": 12,
  "tournament_round": 2,
  "tournament_status": "in_progress"
}
```

Accepts GET (Vercel Cron) and POST (manual trigger).

```bash
curl -H "Authorization: Bearer your-cron-secret" \
  https://yourdomain.com/api/cron/update-scores
```

---

## Admin Endpoints

All admin endpoints require: `Authorization: Bearer {ADMIN_API_KEY}`

### POST /api/admin/seed-golfers

Seed the tournament field with golfer data.

**Request Body:**
```json
{
  "golfers": [
    { "id": "10046", "name": "Scottie Scheffler", "world_rank": 1, "tier": 1 },
    { "id": "10330", "name": "Xander Schauffele", "world_rank": 2, "tier": 1 }
  ]
}
```

**Response:** `{ "created": 87 }`

```bash
curl -X POST https://yourdomain.com/api/admin/seed-golfers \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"golfers": [{"id": "10046", "name": "Scottie Scheffler", "world_rank": 1, "tier": 1}]}'
```

---

### POST /api/admin/update-rankings

Update golfer world rankings and tier assignments (Monday before Masters).

**Request Body:**
```json
{
  "golfers": [
    { "golfer_id": "10046", "world_rank": 1, "tier": 1 },
    { "golfer_id": "10330", "world_rank": 3, "tier": 1 }
  ]
}
```

**Response:** `{ "updated": 2 }`

---

### POST /api/admin/update-score

Manually update a single golfer's score (ESPN fallback).

**Request Body:**
```json
{
  "golfer_id": "10046",
  "score_to_par": -5,
  "thru": 14,
  "status": "STATUS_IN_PROGRESS",
  "round_scores": [66, 68, null, null],
  "position": "1",
  "total_strokes": 134
}
```

All fields except `golfer_id` are optional — only provided fields are updated.

**Valid status values:** `STATUS_IN_PROGRESS`, `STATUS_FINAL`, `STATUS_CUT`, `STATUS_WITHDRAWN`, `STATUS_DISQUALIFIED`, `STATUS_SUSPENDED`

**Response:** `{ "updated": "10046" }`

---

### POST /api/admin/update-scores-bulk

Bulk manual score update with automatic team recalculation.

**Request Body:**
```json
{
  "golfers": [
    { "golfer_id": "10046", "score_to_par": -5, "status": "STATUS_FINAL" },
    { "golfer_id": "10330", "score_to_par": -3, "thru": 16 }
  ]
}
```

**Response:** `{ "updated": 2, "teams_recalculated": 45, "errors": [] }`

---

### POST /api/admin/close-submissions

Emergency override to close team submissions.

**Response:** `{ "status": "submissions_closed" }`

### POST /api/admin/open-submissions

Re-open submissions (e.g., replacement window after pre-tournament withdrawal).

**Response:** `{ "status": "submissions_opened" }`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (full DB access) |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `FRONTEND_URL` | Frontend origin for Stripe redirect URLs |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `ADMIN_API_KEY` | Bearer token for admin endpoints |
| `CRON_SECRET` | Bearer token for cron endpoint |
