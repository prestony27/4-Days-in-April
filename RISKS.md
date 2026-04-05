# Masters Pool - Risk Register

**Last Updated:** 2026-04-05
**Risk Owner:** Devil's Advocate Agent
**Severity Scale:** CRITICAL / HIGH / MEDIUM / LOW
**Likelihood Scale:** VERY LIKELY / LIKELY / POSSIBLE / UNLIKELY

---

## R0: SYSTEMIC - Schema/Code Mismatch (ACTIVE, BLOCKING)

**Status: RESOLVED (all critical files fixed as of April 4)**

All route files now use correct column names matching the schema. Remaining minor issues:
- golfers.py tier filter uses string vs INTEGER (#45)
- Email not normalized to lowercase (#46)
- cron.py `updated_at: "now()"` is a string literal, not SQL function (#47)

**Root Cause:** Schema was written by data-agent; route files were initially written referencing Planning.md instead of actual schema. Fixed after code review.

**Tasks:** #33 (in progress), #40 (done), #41 (done), #42 (done), #45, #46, #47

---

## CRITICAL RISKS (Must mitigate before launch)

### R1: Payment succeeds but team submission fails (data loss / money taken without service)
- **Severity:** CRITICAL
- **Likelihood:** LIKELY (race conditions, network errors, DB timeouts)
- **Scenario:** User pays $30 via Stripe, webhook fires, but team record fails to save or link to payment. User has paid but has no team. With real money, this is a legal and trust disaster.
- **Current Design Gap:** Planning.md shows `POST /api/submit-team` returns a `payment_url`, implying team is created first (unpaid), then payment happens, then webhook updates `payment_status`. But what if:
  - The webhook fails silently?
  - The team record is deleted/corrupted between creation and payment?
  - Stripe retries the webhook and we process it twice?
- **Mitigations:**
  1. **Use Stripe Checkout Sessions with metadata** - embed `team_id` in the Stripe session so the webhook can always find the team
  2. **Idempotent webhook handler** - use Stripe's `event.id` as idempotency key; store processed event IDs
  3. **Webhook retry handling** - Stripe retries for up to 72 hours; handler must be idempotent
  4. **Verify webhook signatures** - use `stripe.Webhook.construct_event()` to prevent spoofed webhooks
  5. **Admin reconciliation tool** - manual page to match Stripe payments to teams if automation fails
  6. **Never delete unpaid teams** - mark them, don't delete. The team record IS the receipt.

### R2: ESPN API breaks or gets blocked during tournament (April 9-12)
- **Severity:** CRITICAL
- **Likelihood:** POSSIBLE (undocumented API, no SLA, Augusta is aggressive about IP)
- **Scenario:** ESPN changes their API structure, rate-limits us, or the endpoint returns errors mid-tournament. Leaderboard goes blank. Scores stop updating. Users paid $30 each and see a broken site.
- **Current Design:** Planning.md recommends SportsData.io as primary but the team appears to be building the ESPN scraper first (Task #9, #21). If ESPN is the ONLY implemented source at launch, this is a single point of failure.
- **Mitigations:**
  1. **Manual score entry admin panel is NON-NEGOTIABLE** - must ship even if ugly. One person watching CBS can keep scores updated.
  2. **Build the `GolfDataSource` abstraction properly** - swapping data sources must be a config change, not a code change
  3. **Cache aggressively** - if API goes down, serve last-known-good data with a "Last updated X minutes ago" banner
  4. **Health check monitoring** - if cron job gets no valid data 3x in a row, send an alert (email, SMS, Slack)
  5. **Test against live data BEFORE tournament** - Valero Texas Open (April 2-5) is the perfect rehearsal. If we don't test against it, we're flying blind.

### R3: Vercel Hobby plan limitations kill us during tournament
- **Severity:** CRITICAL
- **Likelihood:** VERY LIKELY (Hobby plan has hard limits)
- **Key Constraints:**
  - **10-second function timeout** - score recalculation for all teams could exceed this
  - **Cron jobs: daily only on Hobby** - we need per-minute updates during play
  - **100 GB bandwidth/month** - probably fine but unverified
  - **Serverless function invocations** - may hit limits with polling
- **Mitigations:**
  1. **MUST use Vercel Pro plan ($20/month)** - this is non-negotiable for per-minute cron and 60s timeout
  2. **Batch score calculations** - update all teams in one function call, not one per team
  3. **External cron as backup** - set up cron-job.org or GitHub Actions to hit `/api/cron/update-scores` even if Vercel cron works, as a belt-and-suspenders approach

### R4: Stripe account holds or delayed payouts (new account risk)
- **Severity:** CRITICAL
- **Likelihood:** LIKELY (Stripe flags new accounts collecting money rapidly)
- **Scenario:** Brand new Stripe account suddenly receives 50-100+ payments of $30 in 2-3 days. Stripe's fraud detection flags the account. Funds are held for review. We can't pay out winners.
- **Mitigations:**
  1. **Set up Stripe account NOW** - don't wait until day before launch
  2. **Complete Stripe identity verification immediately**
  3. **Contact Stripe support proactively** - explain the use case, expected volume, and timeline
  4. **Consider Stripe's "Custom" account type** if available for this use case
  5. **Have a backup plan for payouts** - Venmo/Zelle manual payouts if Stripe holds funds
  6. **Don't promise instant payouts** - rules say prize distribution happens after tournament

---

## HIGH RISKS (Must address, can mitigate with workarounds)

### R5: Submission deadline race condition (5 AM EST April 9)
- **Severity:** HIGH
- **Likelihood:** POSSIBLE
- **Scenario:** Two users submit at 4:59:58 AM. One request hits the server at 4:59:59, the other at 5:00:01 due to network latency. The backend check `now < DEADLINE` accepts one and rejects the other. User who paid $30 and submitted "on time" from their perspective gets rejected.
- **Mitigations:**
  1. **Add a 60-second grace period server-side** - accept submissions until 5:01 AM but don't advertise it
  2. **Frontend countdown should stop accepting submissions 2 minutes early** (4:58 AM) to prevent last-second heartbreak
  3. **Use database timestamp, not application server time** - `NOW()` in PostgreSQL is more reliable than Python's `datetime.now()`
  4. **Log all rejected submissions near deadline** - for manual review if someone disputes

### R6: Golfer withdrawal timing ambiguity
- **Severity:** HIGH
- **Likelihood:** POSSIBLE (happens nearly every major)
- **Scenarios:**
  - **WD before Monday 9 AM (before rankings lock):** Rankings shift, tier assignments change. Do we re-tier everyone?
  - **WD between Monday 9 AM and Thursday 5 AM:** Rule 7 says user can resubmit. But what if they don't see the notification? What if they resubmit at 4:55 AM and payment doesn't clear?
  - **WD during warmup Thursday before Round 1 tee time (after 5 AM deadline):** Rule 7 says "before Round 1 begins" - is this before the GOLFER's tee time or before the FIRST tee time of the day?
  - **WD after hitting first tee shot:** Team is DQ'd per Rule 2. Clear enough.
- **Mitigations:**
  1. **Define "Round 1 begins" precisely** - recommend: the moment the first group tees off (~8 AM Thursday)
  2. **Automated email notification** when a golfer on someone's team withdraws pre-tournament
  3. **Extend resubmission window** for WD-affected teams until first tee time
  4. **Admin override** to manually handle edge cases
  5. **Document all WD decisions** in an audit log

### R7: No authentication - email-only identity is exploitable
- **Severity:** HIGH
- **Likelihood:** POSSIBLE
- **Scenarios:**
  - Anyone can check "my teams" by guessing common emails
  - Someone could submit a team under another person's email to block them from picking certain golfers
  - No way to prove identity for prize payouts
  - `/api/my-teams?email=someone@gmail.com` leaks team info with zero authentication
- **Mitigations:**
  1. **Email verification link** before team is accepted (adds complexity but prevents spoofing)
  2. **At minimum: email confirmation code** - send a 6-digit code, require it before submission
  3. **Rate limit the my-teams endpoint** aggressively
  4. **Don't expose full team details in my-teams without verification** - show team count only, require code for details
  5. **For payouts: verify identity out-of-band** (the pool is likely among friends, so this may be acceptable for MVP)

### R8: WGR data accuracy and timing
- **Severity:** HIGH
- **Likelihood:** POSSIBLE
- **Scenario:** Rules say "Rankings are locked as of 9:00 AM EST Monday, April 6th." But:
  - What if the official OWGR doesn't update until Monday afternoon?
  - What if Sunday's tournament (Valero Texas Open) finishes late and rankings shift Monday morning?
  - What if we enter rankings at 8 AM and they change at 8:30 AM?
  - A golfer ranked 10 vs 11 changes which tier they're in - this affects every team that picked them
- **Mitigations:**
  1. **Lock rankings in the database at exactly 9 AM Monday** - use a cron job or admin button
  2. **Snapshot and log the rankings** - store the exact ranking used with timestamp
  3. **Don't open submissions until rankings are locked** - the Rules already say this
  4. **Admin review before locking** - manual verification against OWGR website
  5. **Announce tier assignments to users** so they can verify before picking

### R9: Cron job silent failure
- **Severity:** HIGH
- **Likelihood:** LIKELY (no monitoring mentioned in architecture)
- **Scenario:** Score update cron job fails silently. Database has stale scores. Users see a "live" leaderboard that hasn't updated in 2 hours. Nobody knows until users complain.
- **Mitigations:**
  1. **Write `last_score_update` timestamp to `tournament_state` table on every successful run**
  2. **Frontend shows "Last updated: X minutes ago"** - users self-report if stale
  3. **Alert if `last_score_update` is older than 5 minutes during tournament hours** 
  4. **Cron job should return success/failure status** and log to a monitoring service
  5. **Dead man's switch:** External service (e.g., Cronitor, Healthchecks.io) that expects a ping every 2 minutes; alerts if missed

---

## MEDIUM RISKS (Should address if time permits)

### R10: Tiebreaker calculation errors
- **Severity:** MEDIUM
- **Likelihood:** POSSIBLE
- **Scenario:** Tie for 1st place. Tiebreaker 1 checks "better score from 51+ ranked golfer." But:
  - What if the 51+ golfer missed the cut? Is their frozen R2 score used?
  - What if both teams' 51+ golfers have same score?
  - What if a 51+ golfer was DQ'd? (Team should be DQ'd anyway, but edge case)
  - For tiebreaker 2: "combined score from two 11-30 golfers" - what if one missed cut?
- **Mitigations:**
  1. **Write explicit test cases for every tiebreaker scenario** (Task #30 partially covers this)
  2. **Use frozen score for cut golfers in tiebreakers** - document this rule
  3. **Admin override for tiebreaker disputes**

### R11: Legal/trademark risk with "Masters" branding
- **Severity:** MEDIUM
- **Likelihood:** POSSIBLE
- **Concerns:**
  - Augusta National aggressively protects the "Masters" trademark
  - Using "Masters" in a paid pool website could trigger a cease-and-desist
  - The word "pool" combined with money entry fees could be classified as gambling in some jurisdictions
  - State-by-state gambling laws vary significantly
- **Mitigations:**
  1. **Don't use "Masters" in the domain name** - use a generic name like "Golf Pool 2026"
  2. **Add disclaimer:** "This site is not affiliated with or endorsed by Augusta National Golf Club"
  3. **Keep it private/invite-only** rather than public-facing - reduces legal exposure
  4. **Frame as "contest of skill" not gambling** - fantasy sports exemptions may apply
  5. **Consult a lawyer before going public** (probably overkill for a friend group pool)

### R12: Database connection limits under load
- **Severity:** MEDIUM
- **Likelihood:** POSSIBLE
- **Scenario:** Planning.md correctly identifies that direct Postgres connections will fail at scale (50 connection limit). But if ANY code path accidentally uses direct connections instead of the Supabase REST API, we could exhaust the pool during peak tournament moments.
- **Mitigations:**
  1. **Code review: ensure NO direct psycopg2/asyncpg usage** - only `supabase-py` REST client
  2. **Use Supabase connection pooling (PgBouncer)** if direct connections are needed anywhere
  3. **Load test before tournament** - simulate 100+ concurrent users

### R13: Time zone bugs
- **Severity:** MEDIUM  
- **Likelihood:** LIKELY (timezone bugs are extremely common)
- **Scenarios:**
  - Deadline is "5 AM EST" but code uses UTC offset wrong (EST is UTC-5, EDT is UTC-4; April is EDT!)
  - `ZoneInfo("America/New_York")` is correct but someone might hardcode UTC-5 instead
  - Cron jobs in Vercel run in UTC - schedule must account for this
  - Users in different timezones see confusing countdown
- **Mitigations:**
  1. **ALWAYS use `ZoneInfo("America/New_York")` - never hardcode UTC offset** (April is EDT = UTC-4, not EST = UTC-5)
  2. **Display timezone explicitly to users:** "Deadline: 5:00 AM ET (Eastern Time) April 9"
  3. **Test deadline logic with times in EDT specifically**
  4. **Cron schedule in vercel.json must use UTC** - `*/2 * * * *` for every 2 minutes is timezone-agnostic, but any time-of-day logic in the handler must convert

### R14: No rollback plan for bad data
- **Severity:** MEDIUM
- **Likelihood:** POSSIBLE
- **Scenario:** Score update cron fetches corrupted data from ESPN (e.g., all scores reset to 0, or a golfer shows as WD incorrectly). Cron job dutifully writes this to DB. All team scores are now wrong. Teams that were winning are now losing. If we realize hours later, what do we do?
- **Mitigations:**
  1. **`score_history` table is essential, not optional** - it's marked "optional" in Planning.md but it IS the audit trail
  2. **Sanity checks before writing scores:** reject updates where >50% of scores changed by more than 5 strokes in 2 minutes
  3. **Admin endpoint to rollback to a previous score snapshot**
  4. **Never overwrite - always append** to score_history, then update current

---

## LOW RISKS (Track but don't prioritize)

### R15: Golfer at exact tier boundary
- **Severity:** LOW
- **Likelihood:** POSSIBLE
- **Detail:** A golfer ranked exactly 10, 30, or 50. Rules are clear (1-10, 11-30, 31-50, 51+) so rank 10 is Tier 1, rank 30 is Tier 2, rank 50 is Tier 3. But off-by-one bugs are classic.
- **Mitigation:** Test boundary values explicitly: ranks 10, 11, 30, 31, 50, 51.

### R16: User submits multiple browsers simultaneously
- **Severity:** LOW
- **Likelihood:** UNLIKELY
- **Detail:** User opens team builder in two tabs, picks different teams, submits both. Could they end up with 4+ teams or duplicate golfers across teams?
- **Mitigation:** Backend validation is the source of truth - always re-check team count and golfer uniqueness at submission time, not just in the frontend.

### R17: Vercel outage during tournament
- **Severity:** HIGH (if it happens)
- **Likelihood:** UNLIKELY (Vercel has good uptime)
- **Mitigation:** 
  - Have a static fallback page that says "Scores are being updated manually, check back soon"
  - Keep manual scoring spreadsheet as ultimate backup
  - Vercel status page: status.vercel.com

---

## TIMELINE RISK ASSESSMENT

**Today is April 4. Tournament starts April 9. That's 5 days.**

### What MUST ship by when:

| Deadline | What | Why |
|----------|------|-----|
| **April 5 (tomorrow)** | Stripe account created and verified | Verification can take 1-2 days |
| **April 5** | Supabase DB provisioned with schema | Everything depends on this |
| **April 5** | ESPN API client tested against Valero Texas Open | Last chance to test against live tournament |
| **April 6 (Monday)** | Rankings entry (manual or automated) | Users need to see golfers to pick teams |
| **April 6** | Team builder + submission flow working | Users need to submit teams Mon-Wed |
| **April 6** | Payment flow working end-to-end | Can't accept teams without payment |
| **April 8 (Wednesday)** | Leaderboard page working | Nice-to-have before tournament, must-have by Thursday |
| **April 8** | Score update cron tested and deployed | Must work when Round 1 starts |
| **April 9 (Thursday 5 AM)** | Submissions close automatically | Hard deadline in the rules |
| **April 9 (Thursday 8 AM)** | Live scoring operational | Tournament begins |

### What to CUT if running out of time:

1. **Cut first:** OG images, animations, pull-to-refresh, PWA features
2. **Cut second:** Automated rankings import (enter manually from OWGR)
3. **Cut third:** Pretty leaderboard (a basic table with scores is fine)
4. **Cut fourth:** Email notifications for WD
5. **NEVER cut:** Payment flow, team validation, score calculation, manual admin tools

### Fallback plan if automated scoring doesn't work:
1. One person watches the Masters broadcast
2. Updates scores via admin panel every 30 minutes
3. Leaderboard still works - just updated manually
4. This is totally viable for a small pool - don't over-engineer

---

## EDGE CASES CHECKLIST

These should each have a test case:

- [ ] Golfer ranked exactly 10 (Tier 1 boundary)
- [ ] Golfer ranked exactly 11 (Tier 2 boundary)  
- [ ] Golfer ranked exactly 30 (Tier 2 boundary)
- [ ] Golfer ranked exactly 31 (Tier 3 boundary)
- [ ] Golfer ranked exactly 50 (Tier 3 boundary)
- [ ] Golfer ranked exactly 51 (Tier 4 boundary)
- [ ] User submits 3rd team - should succeed
- [ ] User submits 4th team - should fail
- [ ] Same golfer on two teams by same user - should fail
- [ ] Same golfer on teams by different users - should succeed
- [ ] Submission at 4:59:59 AM EST April 9 - should succeed
- [ ] Submission at 5:00:01 AM EST April 9 - should fail
- [ ] All 5 golfers make the cut - normal scoring
- [ ] 1 golfer misses cut - team active, golfer score frozen
- [ ] 1 golfer withdraws during tournament - entire team DQ'd
- [ ] 1 golfer DQ'd - entire team DQ'd
- [ ] Golfer withdraws before Round 1 - resubmission allowed
- [ ] Two teams tied, tiebreaker 1 resolves it
- [ ] Two teams tied, tiebreaker 1 also tied, tiebreaker 2 resolves it
- [ ] Two teams tied through all tiebreakers - prize split
- [ ] Payment webhook received twice (idempotency)
- [ ] Payment webhook received before team creation (race condition)
- [ ] Score update with all zeros (bad data detection)
- [ ] Score update with golfer not in our DB (new alternate?)
- [ ] ESPN API returns 404 or 500
- [ ] ESPN API returns valid JSON but schema changed
- [ ] Supabase connection timeout during score update
- [ ] User's email has uppercase/lowercase variants (normalize!)

---

## IMMEDIATE ACTION ITEMS

1. **@backend-agent:** Ensure Stripe webhook handler is idempotent (R1)
2. **@backend-agent:** Build manual score entry admin endpoint NOW, not later (R2)
3. **@team-lead:** Verify we're using Vercel Pro plan (R3) 
4. **@team-lead:** Set up Stripe account TODAY and start verification (R4)
5. **@backend-agent:** Use `ZoneInfo("America/New_York")` not hardcoded UTC offset (R13) - April is EDT (UTC-4), not EST (UTC-5)
6. **@data-agent:** Test ESPN API against Valero Texas Open THIS WEEKEND (R2)
7. **@backend-agent:** Make `score_history` table mandatory, not optional (R14)
8. **@frontend-agent:** Show "Last updated" timestamp on leaderboard (R9)
9. **ALL:** Email normalization - lowercase all emails before storage and lookup
