# Masters Pool Website - Architecture Planning

## Overview
A website to host a Masters Pool competition with live scoring, team submissions, and payment processing.

**Tech Stack Decisions:**
- Frontend: React/Next.js
- Backend: Python
- Hosting: Vercel
- Auth: Email-based (no accounts)

---

## 1. Data Sources

### World Golf Rankings
*Agent: Data Source Research*

**Purpose:** Need rankings data on Monday before Masters (April 6, 2026) to categorize golfers into tiers (1-10, 11-30, 31-50, 51+).

#### Option 1: Official OWGR (owgr.com)
- **Status:** The Official World Golf Ranking does NOT provide a public API
- **Access Method:** Rankings are published weekly on owgr.com as viewable data
- **Update Frequency:** Updated every Monday
- **Data Available:** Full rankings with points, events played, average points
- **Pros:** Authoritative source, free to view, updated on our needed schedule (Monday)
- **Cons:** No API - would require web scraping or manual data entry
- **Scraping Concerns:** Terms of service likely prohibit automated scraping; legal risk for commercial use

#### Option 2: SportsData.io (formerly FantasyData)
- **API Available:** Yes - Golf API includes world rankings
- **Endpoints:** Player profiles, world rankings, tournament data
- **Pricing Tiers (NEEDS VERIFICATION - pricing may have changed):**
  - Trial: Free, limited calls
  - Developer: ~$25-50/month
  - Professional: ~$100-300/month
  - Enterprise: Custom pricing
- **Pros:** Well-documented REST API, JSON responses, reliable uptime
- **Cons:** Paid service, may have call limits on lower tiers
- **Recommendation:** Strong candidate - verify current pricing at sportsdata.io

#### Option 3: TheRundown API
- **API Available:** Yes - covers golf among other sports
- **Pricing (NEEDS VERIFICATION):**
  - Free tier with limited requests
  - Paid tiers scale with usage
- **Pros:** Multi-sport coverage if needed for future expansion
- **Cons:** Golf may not be their primary focus; data quality uncertain
- **Recommendation:** Investigate as backup option

#### Option 4: ESPN Hidden API
- **Status:** ESPN has undocumented/unofficial APIs
- **Access:** Can be reverse-engineered from their website
- **Pros:** Free to access, comprehensive data
- **Cons:** Unofficial - can break without notice; may violate ToS; no support
- **Risk Level:** HIGH - not recommended for production reliance

#### Option 5: PGA Tour API / DataGolf
- **PGA Tour:** Does not offer public API access
- **DataGolf (datagolf.com):** 
  - Offers golf analytics API
  - Includes rankings and historical data
  - Paid service - pricing requires inquiry
  - Popular with golf analytics community
- **Recommendation:** Worth investigating for comprehensive golf data

#### Option 6: Manual Entry / Hybrid Approach
- **Method:** Manually enter field list + rankings on Monday before Masters
- **Pros:** Zero API cost, no dependencies, full control
- **Cons:** Labor intensive, error-prone, doesn't scale
- **Recommendation:** Viable fallback for MVP given Masters is single event

**WGR RECOMMENDATION:** 
1. Primary: SportsData.io (if budget allows, ~$50-100/month)
2. Backup: Manual entry from OWGR website (free, for MVP)
3. Investigate: DataGolf for golf-specific quality data

### Live Masters Scoring
*Agent: Data Source Research*

**Purpose:** Real-time tournament scores during Masters (April 9-12, 2026) for live leaderboard calculations.
**Requirements:** Frequent updates (ideally every 1-5 minutes during play), hole-by-hole scoring preferred.

#### Option 1: Masters.com / Augusta National Official Data
- **Status:** Augusta National is notoriously protective of their data and brand
- **Official API:** None publicly available
- **Website Data:** masters.com provides live scoring during tournament
- **Media Partnerships:** Licensed data goes to CBS Sports, ESPN, etc.
- **Pros:** Would be authoritative
- **Cons:** No public access; likely impossible to obtain license for small project
- **Scraping Risk:** EXTREMELY HIGH - Augusta National actively protects IP; legal action likely

#### Option 2: SportsData.io Golf API (Live Scores)
- **Live Scoring:** Yes - provides real-time tournament scores
- **Update Frequency:** Near real-time during active play
- **Data Includes:** Leaderboard, hole-by-hole, player scores
- **Coverage:** Major tournaments including The Masters
- **Pricing:** Same tiers as rankings (bundled)
- **Pros:** Single provider for both needs; reliable; well-documented
- **Cons:** Cost; verify Masters-specific coverage

#### Option 3: TheRundown API (Live Scores)
- **Live Scoring:** Yes - offers live golf odds and scores
- **Update Frequency:** Good for betting-related updates
- **Pros:** Competitive pricing
- **Cons:** May focus more on odds than detailed scoring

#### Option 4: ESPN/CBS Hidden APIs
- **Status:** Both broadcast Masters and have live data
- **Access:** Undocumented endpoints can be reverse-engineered
- **Example ESPN Endpoint:** espn.com/golf/leaderboard (underlying JSON)
- **Pros:** Free, detailed data, hole-by-hole available
- **Cons:** 
  - Unofficial - can change without warning
  - Rate limiting may apply
  - Violates Terms of Service
  - Could be blocked mid-tournament
- **Risk Level:** HIGH - tournament runs 4 days; failure would be catastrophic

#### Option 5: RapidAPI Golf Endpoints
- **Various Providers:** Multiple golf APIs available on RapidAPI marketplace
- **Pricing:** Varies - often freemium with paid tiers
- **Quality:** Inconsistent - need to verify Masters coverage
- **Pros:** Easy to switch providers; marketplace model
- **Cons:** Variable data quality; may not cover majors well

#### Option 6: The Golf Channel / NBC Sports
- **Status:** No public API
- **Potential:** Could have undocumented endpoints
- **Recommendation:** Not a reliable option

#### Option 7: Polling + Caching Strategy
- **Approach:** Regardless of source, implement smart polling
- **During Play:** Poll every 2-3 minutes
- **Between Rounds:** Poll every 15-30 minutes
- **Cache Layer:** Serve cached data; reduces API calls and costs
- **Failover:** Have manual override capability if API fails

**LIVE SCORING RECOMMENDATION:**
1. Primary: SportsData.io (same provider as rankings - simplifies integration)
2. Risk Mitigation: Build manual score entry admin panel as emergency backup
3. Architecture: Implement polling + caching to minimize API calls

**CRITICAL CONCERN:** Live scoring is the highest-risk data dependency. If API fails during tournament, the entire user experience breaks. Must have contingency plan.

---

### Data Source Summary & Recommendations

#### Recommended Primary Solution: SportsData.io
| Aspect | Details |
|--------|---------|
| Provider | SportsData.io (formerly FantasyData) |
| Coverage | World rankings + live tournament scoring |
| Reliability | Commercial-grade SLA |
| Estimated Cost | $50-150/month (VERIFY CURRENT PRICING) |
| Integration | REST API, JSON responses, good documentation |

**Why SportsData.io:**
- Single provider for both data needs reduces complexity
- Commercial service = reliability + support
- Legal and TOS-compliant
- Well-documented with SDKs available

#### Alternative: Hybrid Free Approach (Higher Risk)
| Component | Source | Risk |
|-----------|--------|------|
| WGR Data | Manual entry from OWGR.com | Low (one-time task) |
| Live Scores | ESPN hidden API | HIGH |

**Why this is risky:** Undocumented APIs can break mid-tournament. For a fantasy pool with real money, this is not advisable.

#### Web Scraping Assessment
| Source | Legal Risk | Technical Risk | Recommendation |
|--------|------------|----------------|----------------|
| OWGR.com | Medium | Low | Avoid - use manual entry instead |
| Masters.com | VERY HIGH | High | DO NOT ATTEMPT - Augusta litigates |
| ESPN.com | Medium | Medium | Avoid for production |
| PGATour.com | Medium | Medium | Avoid for production |

**Legal Concerns with Scraping:**
- Violates Terms of Service of most sports sites
- CFAA (Computer Fraud and Abuse Act) considerations
- Augusta National has history of aggressive IP protection
- For commercial/paid pool, legal risk increases

#### Cost-Benefit Analysis

**Paid API Route (~$100-150/month):**
- Pros: Legal, reliable, supported, professional
- Cons: Monthly cost
- Break-even: With 50+ participants at $20 entry, easily covered

**Free/Scraping Route ($0):**
- Pros: No direct cost
- Cons: Legal risk, reliability issues, could fail during tournament
- Hidden Cost: Development time for scraping + maintenance

**FINAL RECOMMENDATION:** Budget for SportsData.io or similar paid API. The Masters tournament is 4 days long - having reliable data is worth the cost. Build manual admin entry as emergency fallback.

---

### ESPN Scraping (Testing/Development Alternative)

**Purpose:** Free alternative to paid API for initial development and testing. May be used as backup data source.

**Test URL:** `https://www.espn.com/golf/leaderboard?tournamentId=401811940`

**Implementation Approach:**
1. Fetch the ESPN leaderboard page
2. Parse HTML or find underlying JSON data (ESPN often embeds JSON in script tags)
3. Extract: player name, position, score to par, thru, round scores, status (CUT/WD/DQ)

**Potential Data Extraction Methods:**
- **HTML Scraping:** BeautifulSoup/lxml to parse the rendered table
- **Hidden JSON:** ESPN embeds `window.espn.scoreboardData` or similar in `<script>` tags - cleaner if available
- **XHR Endpoints:** Browser DevTools may reveal underlying API calls (e.g., `/apis/site/v2/sports/golf/...`)

**Risk Acknowledgment (Updated - JSON API is lower risk than HTML scraping):**
| Risk | Severity | Mitigation |
|------|----------|------------|
| ToS violation | Medium | Unofficial API; have SportsData.io as backup |
| Format changes without notice | Medium | JSON schema more stable than HTML; build schema validation |
| Rate limiting/blocking | Low-Medium | Cache aggressively; limit to 1 request per 2 min |
| Data inconsistency | Low | ESPN is authoritative source for most broadcasts |
| API endpoint removed | Medium | Keep SportsData.io integration ready to swap |

**Development Plan:**
1. Build scraper against test URL during development
2. Test reliability over multiple days
3. Decision point before tournament: Use ESPN scraper OR SportsData.io
4. Keep both implementations; can switch if one fails

**Recommended Architecture:**
```python
# Abstract data source - can swap implementations
class GolfDataSource:
    async def get_leaderboard(self) -> list[GolferScore]: ...

class ESPNScraper(GolfDataSource): ...      # Free, risky
class SportsDataIO(GolfDataSource): ...     # Paid, reliable
class ManualEntry(GolfDataSource): ...      # Emergency fallback
```

**ESPN API Endpoint (Discovered):**

```
GET https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event={tournamentId}
```

**Test URL:** `?event=401811940` (Valero Texas Open 2026)

**Response Structure:**
```python
# Tournament info
event.id
event.name
event.status.type.name  # "STATUS_IN_PROGRESS", "STATUS_FINAL", etc.

# Player/Competitor data
competitors[].athlete.displayName      # "Robert MacIntyre"
competitors[].athlete.id               # Unique player ID
competitors[].score.displayValue       # Total score display
competitors[].score.value              # Total score numeric

# Position & Status
competitors[].status.position.displayName  # "1", "T2", "T15"
competitors[].status.thru                  # Holes completed (numeric)
competitors[].status.displayValue          # "Thru 6", "F" (finished)
competitors[].status.type.name             # "STATUS_IN_PROGRESS", "STATUS_CUT"
competitors[].status.description           # "In Progress", "Missed Cut", "Withdrawn"

# Round scores
competitors[].linescores[0].value      # R1 strokes (66)
competitors[].linescores[1].value      # R2 strokes (64)
competitors[].linescores[2].value      # R3 strokes
competitors[].linescores[3].value      # R4 strokes

# Score to par (what we need for team scoring)
competitors[].statistics[0].value         # -14 (numeric)
competitors[].statistics[0].displayValue  # "-14" (string)
# Note: statistics[0] is always "scoreToPar"
```

**Status Values for DQ/WD/CUT:**
| status.type.name | status.description | Meaning |
|------------------|-------------------|---------|
| STATUS_IN_PROGRESS | In Progress | Currently playing |
| STATUS_CUT | Missed Cut | Eliminated after R2 |
| STATUS_WITHDRAWN | Withdrawn | WD from tournament |
| STATUS_DISQUALIFIED | Disqualified | DQ'd |
| STATUS_SUSPENDED | Suspended | Weather delay |
| STATUS_FINAL | Finished | Completed tournament |

**Tournament IDs (ESPN):**
| Event | ID | Dates |
|-------|-----|-------|
| Valero Texas Open (testing) | 401811940 | April 2-5, 2026 |
| **Masters Tournament** | **401811941** | **April 9-12, 2026** |
| PGA Championship | 401811947 | May 14-17, 2026 |
| U.S. Open | 401811952 | June 18-21, 2026 |

**Masters API URL:**
```
https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=401811941
```

**Action Items:**
- [x] ~~Inspect ESPN page source for embedded JSON vs HTML parsing needs~~ Found clean JSON API
- [x] ~~Identify tournament ID for 2026 Masters~~ **401811941**
- [ ] Build ESPN API client with test coverage
- [ ] Test reliability during remainder of Valero Texas Open (401811940)
- [ ] Verify Masters leaderboard API works when tournament starts

---

## 2. Frontend Architecture

*Agent: Frontend Planning*

### 2.1 Page Structure (Next.js App Router)

```
app/
├── page.tsx                    # Home/Landing page
├── layout.tsx                  # Root layout with header/footer
├── rankings/
│   └── page.tsx               # World Golf Rankings display (tiered view)
├── teams/
│   ├── page.tsx               # Team management hub (view existing teams)
│   └── builder/
│       └── page.tsx           # Team builder interface
├── leaderboard/
│   └── page.tsx               # Live tournament leaderboard
├── submit/
│   └── page.tsx               # Payment flow & submission confirmation
└── api/                       # (Handled by Python backend on Vercel)
```

### 2.2 Component Architecture

**Shared/UI Components:**
- `Header` - Navigation with deadline countdown timer
- `Footer` - Rules link, contact info
- `TierBadge` - Visual indicator for golfer tier (1-10, 11-30, 31-50, 51+)
- `GolferCard` - Reusable golfer display with rank, name, selection state
- `TeamCard` - Summary view of a submitted team
- `CountdownTimer` - Deadline countdown (5 AM EST April 9th)
- `LoadingSpinner` / `Skeleton` - Loading states
- `Toast` - Notifications for actions

**Feature Components:**

*Rankings Page:*
- `TieredRankingsView` - Container with collapsible tier sections
- `TierSection` - Single tier with golfer list
- `GolferRow` - Golfer info with "Add to Team" action

*Team Builder:*
- `TeamBuilderWizard` - Main container managing selection state
- `TierSelector` - Shows available golfers for each tier
- `SelectedTeamSummary` - Sidebar/bottom showing current 5 picks
- `TeamSlot` - Individual slot showing selected golfer or empty state
- `ValidationMessages` - Real-time feedback on tier rules
- `DuplicateWarning` - Alert when golfer already on another team

*Leaderboard:*
- `LeaderboardTable` - Main table with sorting
- `TeamRow` - Expandable row showing team details and golfer scores
- `GolferScoreRow` - Individual golfer with current score, position
- `LiveIndicator` - Pulsing dot showing real-time updates active
- `CutLineIndicator` - Visual separator at cut line
- `ScoreChangeAnimation` - Subtle animation when scores update

*Payment/Submit:*
- `TeamReviewCard` - Final review before payment
- `PaymentForm` - Stripe Elements integration
- `SubmissionConfirmation` - Success state with team summary
- `EmailCapture` - Input for email association with submission

### 2.3 State Management Recommendation

**Recommended: Zustand (lightweight) + React Query (server state)**

Rationale:
- Zustand: Simple, minimal boilerplate, perfect for client-side UI state
- React Query (TanStack Query): Handles caching, refetching, optimistic updates for API data

**State Domains:**

1. **Team Builder State (Zustand):**
   - `selectedGolfers: Map<tier, golfer>` - Current picks by tier
   - `currentTeamIndex: number` - Which of the 3 teams being edited
   - `userEmail: string` - For submission association
   - `existingTeams: Team[]` - Previously submitted teams (for duplicate checking)

2. **Server State (React Query):**
   - Rankings data (cache for session, refetch on mount)
   - Leaderboard data (frequent polling during tournament)
   - Submission status
   - User's teams (by email lookup)

**Alternative Considered:**
- React Context: Would work but requires more boilerplate for complex state
- Redux: Overkill for this application size
- Jotai/Recoil: Good options but Zustand has better DX for this use case

### 2.4 Real-Time Updates Strategy

**Recommendation: Polling with React Query**

For the live leaderboard during the tournament:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| WebSockets | True real-time, efficient | Complex setup, Vercel limitations, overkill for golf pace | Not recommended |
| Server-Sent Events (SSE) | Simpler than WS, one-way | Vercel serverless limitations, connection management | Possible but complex |
| Polling (React Query) | Simple, works on Vercel, reliable | Slightly delayed, more requests | **Recommended** |

**Polling Implementation:**
- During tournament: Poll every 30-60 seconds (golf scores don't change rapidly)
- Pre-tournament: Poll rankings every 5 minutes or on page focus
- Use `refetchInterval` in React Query with conditional logic
- Implement `refetchOnWindowFocus` for immediate updates when user returns

**Smart Polling Logic:**
```
- Tournament not started: No polling needed
- Tournament active (7am-7pm EST): Poll every 30 seconds
- Tournament active (off hours): Poll every 2 minutes
- Tournament finished: Stop polling
```

**Note on Supabase Realtime:**
The backend recommends Supabase which has built-in realtime subscriptions. Consider using Supabase Realtime as an alternative to polling - it pushes changes to connected clients. This would provide true real-time updates without WebSocket complexity since Supabase handles it.

### 2.5 Mobile-First Design Strategy

**Critical: Heavy mobile usage expected during tournament viewing**

**Responsive Breakpoints:**
- Mobile: < 640px (primary design target)
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile UX Priorities:**

1. **Leaderboard (most used on mobile):**
   - Sticky header with user's team position
   - Collapsible team rows (tap to expand)
   - Horizontal swipe for additional columns
   - Large touch targets (min 44px)
   - Pull-to-refresh gesture

2. **Team Builder:**
   - Bottom sheet pattern for golfer selection
   - Fixed bottom bar showing selected team
   - Step-by-step tier selection (not all at once)
   - Clear "back" and "next" navigation

3. **Rankings:**
   - Accordion-style tier collapse
   - Search/filter at top (sticky)
   - Tap golfer to see details + add action

**Touch Considerations:**
- Minimum touch target: 44x44px (Apple HIG)
- Avoid hover-only interactions
- Use native select elements where appropriate
- Consider haptic feedback for selections (if PWA)

### 2.6 Team Builder UX - Enforcing Rules

**Tier Rule Enforcement:**

1. **Visual Tier Separation:**
   - Clear section headers: "Tier 1 (Rank 1-10): Pick 1"
   - Progress indicator showing completed/remaining picks per tier
   - Grayed out tiers that are complete

2. **Selection Flow Options:**

   *Option A: Guided Wizard (Recommended for mobile)*
   - Step through each tier sequentially
   - Can't proceed until tier requirement met
   - Progress bar: "Step 2 of 4: Select 2 golfers from ranks 11-30"
   - Allows going back to change previous selections
   - Best for mobile: focused, less overwhelming

   *Option B: Free-form with Validation (Better for desktop)*
   - All tiers visible, user picks in any order
   - Real-time validation messages
   - Submit disabled until valid
   - Power users can work faster

   **Recommendation:** Implement Option A (wizard) as primary, consider responsive switch to Option B on larger screens.

3. **Duplicate Golfer Prevention (across user's teams):**
   - On initial email entry, fetch user's existing teams via `/api/my-teams?email=...`
   - Golfers already on user's teams show "Already on Team 1" badge
   - Disable selection with tooltip explanation
   - Different visual state (strikethrough, grayed, red border)
   - Frontend enforces for UX, backend validates for security

4. **Validation Feedback:**
   - Green checkmarks on completed tiers
   - Red warnings for violations
   - "Submit Team" button disabled until all rules pass
   - Clear error messages: "You need 2 golfers from Tier 2 (11-30)"

### 2.7 Next.js Features to Leverage

**App Router Benefits:**
- Server Components for initial rankings load (faster, SEO)
- Streaming for leaderboard (show UI while data loads)
- Route groups for layout organization
- Parallel routes for modals (team details overlay)

**Specific Implementations:**

| Feature | Next.js Approach |
|---------|------------------|
| Rankings page | Server Component, cached fetch, revalidate on demand |
| Team builder | Client Component (heavy interactivity) |
| Leaderboard | Hybrid - Server Component shell, Client Component for live data |
| Payment page | Client Component (Stripe Elements) |
| API routes | Proxied to Python backend `/api/*` |

**Caching Strategy:**
- Rankings: `revalidate: 300` (5 minutes) or on-demand with `revalidatePath`
- Static assets: Vercel Edge caching
- Leaderboard: No server cache (client handles polling)

**Metadata:**
- Dynamic OG images for social sharing ("My Masters Pool Team")
- Proper meta tags for each page
- JSON-LD structured data for SEO

### 2.8 Third-Party Libraries (Recommended)

| Purpose | Library | Rationale |
|---------|---------|-----------|
| State Management | Zustand | Lightweight, simple API, ~1kb |
| Server State | TanStack Query | Caching, polling, mutations, devtools |
| Styling | Tailwind CSS | Rapid development, mobile-first utilities |
| UI Components | shadcn/ui | Accessible, customizable, Tailwind-based, copy-paste |
| Forms | React Hook Form | Performance, validation |
| Validation | Zod | Type-safe schemas, pairs with RHF, shared with backend types |
| Payments | @stripe/stripe-js | Official Stripe Elements |
| Animations | Framer Motion | Score change animations, transitions |
| Date/Time | date-fns | Countdown timer, deadline formatting, timezone handling |
| Toast/Notifications | Sonner | Modern, accessible, lightweight |

### 2.9 Performance Considerations

- **Bundle size:** Use dynamic imports for Stripe, heavy components
- **Images:** Next.js Image component for golfer photos (if used)
- **Fonts:** Next.js font optimization (next/font)
- **Initial load:** Server Components for above-fold content
- **Leaderboard:** Virtualized list if many teams (tanstack/react-virtual)
- **Code splitting:** Route-based automatic splitting with App Router

### 2.10 User Flow Summary

```
1. Landing Page
   |-- See countdown timer, entry info, rules summary
   |-- CTA: "Build Your Team" or "View Leaderboard"

2. Email Entry (if building team)
   |-- Enter email to start or continue
   |-- Fetch existing teams for duplicate check
   |-- Show count: "You have X/3 teams submitted"

3. Team Builder (Wizard Flow)
   |-- Step 1: Pick 1 from Tier 1 (ranks 1-10)
   |-- Step 2: Pick 2 from Tier 2 (ranks 11-30)
   |-- Step 3: Pick 1 from Tier 3 (ranks 31-50)
   |-- Step 4: Pick 1 from Tier 4 (ranks 51+)
   |-- Review: Confirm 5 selections

4. Payment
   |-- Stripe checkout for $30
   |-- Webhook updates payment_status

5. Confirmation
   |-- Team submitted successfully
   |-- Option to build another team (up to 3)
   |-- Link to leaderboard

6. Leaderboard (During Tournament)
   |-- See all teams ranked by total score
   |-- Expand to see individual golfer scores
   |-- Filter: "My Teams" (by email lookup)
   |-- Live indicator, last updated timestamp
```

---

## 3. Backend Architecture

*Agent: Backend Planning*

### 3.1 Framework Recommendation: FastAPI

**Recommendation: FastAPI** over Flask or Django

**Justification:**
1. **Vercel Compatibility**: FastAPI works well with Vercel's serverless Python functions. Each endpoint can be deployed as an independent serverless function.
2. **Performance**: FastAPI is built on Starlette and uses async/await natively, which is ideal for I/O-bound operations like fetching live scoring data from external APIs.
3. **Automatic API Documentation**: Built-in Swagger/OpenAPI docs are helpful for debugging and frontend integration.
4. **Pydantic Integration**: Type validation for request/response bodies aligns well with validating team submissions (tier rules, duplicate golfer checks).
5. **Lightweight**: Unlike Django, FastAPI doesn't bring ORM/admin overhead we don't need.

**Why NOT Django:**
- Overkill for this use case (no user accounts, no admin panel needed)
- Django's ORM and middleware add cold-start latency in serverless
- Vercel's serverless model doesn't suit Django's monolithic architecture

**Why NOT Flask:**
- No native async support (would need Quart or workarounds)
- Manual validation required; FastAPI's Pydantic is cleaner
- Flask would work, but FastAPI is better suited for modern API-first apps

---

### 3.2 Vercel Python Support & Limitations

**Key Characteristics:**
- **Runtime**: Python 3.9, 3.10, 3.11, 3.12 supported
- **Function Location**: `/api/` directory (e.g., `/api/submit.py` becomes `/api/submit` endpoint)
- **Execution Limits (Hobby Plan)**: 
  - 10 second timeout (Pro: 60 seconds, Enterprise: 900 seconds)
  - 1024 MB memory (configurable up to 3008 MB on Pro)
  - 50 MB deployment size limit per function
- **Cold Starts**: Serverless functions have cold starts (1-3 seconds for Python)
- **No Persistent State**: Functions are stateless; need external database/cache
- **No Background Jobs**: Vercel functions must return within timeout; no cron jobs natively

**Vercel-Specific Considerations:**
1. **Cron Jobs**: Vercel supports `vercel.json` cron configuration (limited on Hobby plan)
2. **Edge Functions**: Python not supported on Edge Runtime (only JS/TS)
3. **Dependencies**: Use `requirements.txt` in `/api/` folder

**Implications for This Project:**
- Live score polling cannot run as a background daemon; must use external cron (Vercel Cron, GitHub Actions, or external service)
- Each API endpoint is an independent function (good for isolation, adds cold start latency)
- Consider Pro plan for longer timeouts during score recalculation

---

### 3.3 Database Recommendation: Supabase (PostgreSQL)

**Recommended Database: Supabase**

**Justification:**
- Full PostgreSQL with Row-Level Security
- Built-in REST API (backup if Python functions fail)
- Generous free tier (500 MB, unlimited API requests)
- Real-time subscriptions for live leaderboard updates (can push to frontend)
- Better developer experience than Vercel Postgres for this use case
- Python client library available (`supabase-py`)

**Alternatives Considered:**
| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Vercel Postgres | Tight Vercel integration | Limited free tier, fewer features | Good but Supabase better |
| PlanetScale | Serverless MySQL, great scaling | MySQL (not PostgreSQL), less suited for JSONB | Pass |
| Neon | Serverless PostgreSQL, branching | Newer, smaller community | Viable alternative |
| Upstash | Redis + PostgreSQL offerings | Redis better for caching than primary DB | Use for caching only |

---

### 3.4 Database Schema Design

#### Table: `golfers`
```sql
CREATE TABLE golfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    world_rank      INTEGER NOT NULL,
    tier            VARCHAR(10) NOT NULL,  -- 'tier1' (1-10), 'tier2' (11-30), 'tier3' (31-50), 'tier4' (51+)
    current_score   INTEGER,               -- NULL if not started, relative to par
    thru            VARCHAR(10),           -- "F", "18", "CUT", "WD", "DQ"
    status          VARCHAR(20) DEFAULT 'active',  -- 'active', 'cut', 'withdrawn', 'disqualified'
    round_scores    JSONB,                 -- {"r1": 72, "r2": 71, "r3": null, "r4": null}
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_golfers_tier ON golfers(tier);
CREATE INDEX idx_golfers_rank ON golfers(world_rank);
```

#### Table: `contestants`
```sql
CREATE TABLE contestants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_contestants_email ON contestants(email);
```

#### Table: `teams`
```sql
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contestant_id   UUID REFERENCES contestants(id),
    team_name       VARCHAR(100),
    golfer_ids      UUID[] NOT NULL,       -- Array of 5 golfer UUIDs
    tier1_golfer    UUID REFERENCES golfers(id),
    tier2_golfer_1  UUID REFERENCES golfers(id),
    tier2_golfer_2  UUID REFERENCES golfers(id),
    tier3_golfer    UUID REFERENCES golfers(id),
    tier4_golfer    UUID REFERENCES golfers(id),
    total_score     INTEGER,               -- Calculated, NULL if tournament not started
    status          VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'active', 'disqualified'
    payment_status  VARCHAR(20) DEFAULT 'unpaid',   -- 'unpaid', 'paid', 'refunded'
    payment_id      VARCHAR(100),          -- External payment provider reference
    submitted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_teams_contestant ON teams(contestant_id);
CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_teams_total_score ON teams(total_score) WHERE status = 'active';
```

#### Table: `tournament_state`
```sql
CREATE TABLE tournament_state (
    id                  INTEGER PRIMARY KEY DEFAULT 1,  -- Single row table
    current_round       INTEGER,            -- 1, 2, 3, 4
    tournament_status   VARCHAR(20),        -- 'not_started', 'in_progress', 'completed'
    submissions_open    BOOLEAN DEFAULT TRUE,
    cut_line            INTEGER,            -- Score to par where cut occurs
    last_score_update   TIMESTAMP WITH TIME ZONE
);
```

#### Table: `score_history` (Optional - for audit/debugging)
```sql
CREATE TABLE score_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    golfer_id       UUID REFERENCES golfers(id),
    score           INTEGER,
    thru            VARCHAR(10),
    recorded_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 3.5 API Endpoints

#### Team Submission
```
POST /api/submit-team
Body: {
  "email": "user@example.com",
  "name": "John Doe",
  "team_name": "My Masters Pick",
  "golfers": {
    "tier1": "golfer-uuid-1",
    "tier2_a": "golfer-uuid-2",
    "tier2_b": "golfer-uuid-3",
    "tier3": "golfer-uuid-4",
    "tier4": "golfer-uuid-5"
  }
}
Response: { "team_id": "...", "payment_url": "..." }

Validations:
  - Check submission deadline (before 5 AM EST April 9th)
  - Validate tier placement for each golfer
  - Check no duplicate golfers across this contestant's other teams
  - Enforce max 3 teams per email
  - Return payment link
```

#### Golfer Data
```
GET /api/golfers
Response: { "golfers": [...], "last_updated": "..." }
Query params: ?tier=tier1 (optional filter)

GET /api/golfers/[id]
Response: Single golfer with current score
```

#### Leaderboard
```
GET /api/leaderboard
Response: {
  "teams": [
    {
      "rank": 1,
      "team_name": "...",
      "contestant_name": "...",
      "total_score": -12,
      "golfers": [...],
      "status": "active"
    }
  ],
  "last_updated": "..."
}
Query params: ?limit=50&offset=0
```

#### Team Details
```
GET /api/teams/[id]
Response: Full team details with golfer scores

GET /api/my-teams?email={email}
Response: All teams for a given email (for "check my teams" feature)
```

#### Payment Webhook
```
POST /api/webhooks/payment
Body: Payment provider webhook payload
Action: Update team.payment_status to 'paid'
Security: Verify webhook signature
```

#### Admin/Internal Endpoints (Protected with API Key)
```
POST /api/admin/update-scores
Trigger: Called by Vercel Cron job
Action: Fetch live scores, update golfers, recalculate team totals

POST /api/admin/update-rankings
Trigger: Manual (Monday before Masters)
Action: Fetch fresh World Golf Rankings, update golfer tiers

POST /api/admin/close-submissions
Action: Set submissions_open = FALSE
```

---

### 3.6 Caching & Scalability Strategy

**Design Target:** Handle 2000 concurrent users during peak tournament moments.

**Problem**: Live scoring data changes frequently during tournament; don't want to hit external API or database on every user request.

**Solution: Three-Layer Caching Architecture**

```
User Request → Vercel Edge Cache (30s) → API Function → Supabase REST API → PostgreSQL
                    ↑                                          ↑
              Most requests                             Stateless, no
              served here                               connection limits
```

#### Layer 1: Vercel Edge Cache (Primary)

All GET endpoints return cache headers that Vercel Edge respects:

| Endpoint | Cache Header | Effect |
|----------|--------------|--------|
| `/api/leaderboard` | `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` | Cached at edge for 30s, serves stale while revalidating |
| `/api/golfers` | `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` | Cached 60s (rankings don't change during tournament) |
| `/api/my-teams` | `Cache-Control: private, no-store` | Never cached (user-specific) |

**Impact:** With 2000 users polling every 30s, edge cache reduces DB hits from 4000/min to ~2/min.

#### Layer 2: Supabase REST API (Not Direct Postgres)

**Critical for scalability:** Use Supabase's auto-generated REST API, not direct PostgreSQL connections.

| Approach | Connection Model | 2000 Users |
|----------|------------------|------------|
| Direct Postgres (`psycopg2`) | Persistent connections | **Fails** - exceeds 50 connection limit |
| Supabase REST API (`supabase-py`) | HTTP requests, stateless | **Works** - no connection limit |

**Implementation:**
```python
# Use this (REST API - stateless)
from supabase import create_client
supabase = create_client(url, key)
result = supabase.table("leaderboard").select("*").execute()

# NOT this (direct connection - limited)
import psycopg2
conn = psycopg2.connect(...)  # Holds open connection
```

#### Layer 3: Database-as-Cache for Scores

- Cron job fetches from SportsData.io every 2 minutes
- Writes scores to `golfers` table
- All user requests read from DB, never from external API
- External API sees ~30 requests/hour, not thousands

#### Scalability Summary

| Concurrent Users | Edge Cache Hit Rate | DB Requests/min | Status |
|------------------|---------------------|-----------------|--------|
| 100 | 95%+ | ~5 | Free tier fine |
| 500 | 97%+ | ~10 | Free tier fine |
| 2000 | 99%+ | ~40 | Free tier fine with REST API |
| 5000+ | 99%+ | ~100 | Consider Supabase Pro ($25/mo) |

**Cache Invalidation:**
- Short TTLs (30 seconds) mean eventual consistency is acceptable for golf
- Score update cron writes to DB; cache expires naturally
- No manual invalidation needed

---

### 3.7 Background Job Strategy

**Challenge**: Vercel serverless functions cannot run persistent background processes.

**Score Update Requirements:**
- Fetch live Masters scores every 1-2 minutes during play
- Update golfer scores in database
- Recalculate all team totals
- Check for DQ/withdrawal and update team statuses

**Recommended: Vercel Cron Jobs**

Configure in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/update-scores",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

**Limitations:**
- Hobby plan: 2 cron jobs, daily only
- Pro plan: 40 cron jobs, per-minute granularity
- **Recommendation**: Use Pro plan ($20/month) for per-minute updates during tournament

**Backup Options:**
1. **GitHub Actions**: Free, minimum 5-minute intervals, trigger HTTP endpoint
2. **cron-job.org**: Free external cron service
3. **Upstash QStash**: Serverless message queue with scheduling

---

### 3.8 Score Calculation Logic

**Team Score Calculation:**
```python
def calculate_team_score(team: Team) -> tuple[int | None, str]:
    """Returns (total_score, status)"""
    total = 0
    for golfer_id in team.golfer_ids:
        golfer = get_golfer(golfer_id)
        
        # DQ/WD check - entire team is disqualified
        if golfer.status in ('withdrawn', 'disqualified'):
            return None, 'disqualified'
        
        # Add score (missed cut golfers keep their score)
        if golfer.current_score is not None:
            total += golfer.current_score
    
    return total, 'active'
```

**DQ/Withdrawal Handling:**
- When score update detects WD or DQ status for a golfer:
  1. Update `golfer.status`
  2. Query all teams containing that golfer
  3. Set `team.status = 'disqualified'`
  4. DQ'd teams still appear on leaderboard (marked as DQ)

**Missed Cut Handling:**
- Golfer's score freezes at their 36-hole total
- Team remains active
- Golfer's final score is their cut score (e.g., +6 after 2 rounds)

---

### 3.9 Submission Deadline Enforcement

**Deadline**: 5:00 AM EST, Thursday, April 9th, 2026

**Implementation:**
```python
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

DEADLINE = datetime(2026, 4, 9, 5, 0, 0, tzinfo=ZoneInfo("America/New_York"))

def is_submissions_open() -> bool:
    now = datetime.now(timezone.utc)
    db_state = get_tournament_state()
    return now < DEADLINE and db_state.submissions_open
```

**Safeguards:**
1. Backend validation in `/api/submit-team` (authoritative)
2. Database flag `tournament_state.submissions_open` for manual override
3. Frontend hides form after deadline (UX only, not security)
4. Consider 5-minute buffer (close at 4:55 AM) to avoid edge cases

---

### 3.10 Duplicate Golfer Validation

**Rule**: A contestant cannot have the same golfer on more than one of their teams.

**Validation Logic:**
```python
def validate_no_duplicate_golfers(email: str, new_golfer_ids: list[str]) -> None:
    """Raises ValidationError if any golfer is already on another team."""
    existing_teams = get_teams_by_email(email)
    existing_golfer_ids = set()
    
    for team in existing_teams:
        if team.payment_status == 'paid':  # Only count paid teams
            existing_golfer_ids.update(team.golfer_ids)
    
    for golfer_id in new_golfer_ids:
        if golfer_id in existing_golfer_ids:
            golfer = get_golfer(golfer_id)
            raise ValidationError(
                f"{golfer.name} is already on another of your teams"
            )
```

**Edge Case Decision Needed:**
- Should unpaid team submissions "reserve" golfers?
- Recommendation: Only paid teams count toward duplicate check (simplest)

---

### 3.11 Project Structure

```
/api
    /submit-team.py        # POST - Submit new team
    /golfers.py            # GET - List all golfers
    /golfers/[id].py       # GET - Single golfer
    /leaderboard.py        # GET - Team leaderboard
    /teams/[id].py         # GET - Single team details
    /my-teams.py           # GET - Teams by email
    /webhooks/payment.py   # POST - Payment webhook
    /cron/update-scores.py # GET - Called by Vercel Cron
    /admin/update-rankings.py  # POST - Manual ranking update
    /admin/close-submissions.py  # POST - Close submissions

/lib
    /db.py                 # Supabase client initialization
    /models.py             # Pydantic models for validation
    /scoring.py            # Score calculation logic
    /validation.py         # Team validation (tiers, duplicates, deadline)
    /external_apis.py      # SportsData.io client

/requirements.txt          # Python dependencies
/vercel.json               # Vercel configuration + cron jobs
```

---

### 3.12 Security Considerations

1. **Admin Endpoints**: Protect with API key in `Authorization` header (stored in Vercel env vars)
2. **Webhook Validation**: Verify payment webhook signatures (Stripe/PayPal provide this)
3. **Rate Limiting**: Vercel provides basic DDoS protection; consider API keys for abuse prevention
4. **Input Validation**: Pydantic models validate all request bodies
5. **SQL Injection**: Supabase client uses parameterized queries
6. **CORS**: Configure for frontend domain only
7. **Email Validation**: Basic format check; no verification (per requirements)

---

### 3.13 Cost Estimate

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Pro (for cron jobs) | $20 |
| Supabase | Free tier | $0 |
| SportsData.io | Developer tier (est.) | $50-100 |
| **Total** | | **$70-120/month** |

*Note: Costs only apply during tournament week for API usage; can downgrade otherwise.*

---

## 4. Payment Processing

*Agent: Payment Research*

### Payment Provider Comparison

#### 1. Stripe (RECOMMENDED)

**Fees:**
- 2.9% + $0.30 per transaction (standard online)
- No monthly fees, no setup fees
- Instant payouts available for additional 1% fee

**Pros:**
- Excellent Python SDK (`stripe` package) and JavaScript SDK
- Best-in-class documentation and developer experience
- Stripe Checkout: Pre-built, hosted payment page (minimal code required)
- Stripe Payment Links: No-code option for simple use cases
- Easy LLC bank account connection via Stripe Dashboard
- Handles all PCI compliance when using Checkout or Elements
- 2-day standard payout to bank account (can enable daily)

**Cons:**
- Slightly higher fees than some competitors for high volume
- Account holds possible for new accounts with unusual activity

**Integration Complexity:** LOW - Stripe Checkout can be integrated in ~50 lines of code

**Example for $30 entry fee:**
- Fee: $0.87 + $0.30 = $1.17 per transaction (3.9% effective rate)
- You receive: $28.83

---

#### 2. PayPal

**Fees:**
- 2.99% + $0.49 per transaction (standard)
- PayPal Checkout: 3.49% + $0.49 for cards
- No monthly fees for standard accounts

**Pros:**
- High consumer trust and recognition
- Buyers can pay without creating account (guest checkout)
- PayPal Business account connects to LLC bank
- JavaScript SDK available, Python SDK exists but less polished

**Cons:**
- Higher effective fees especially for small transactions
- More complex integration than Stripe
- Known for account freezes/holds on new accounts
- Customer service can be difficult
- Buyer disputes can be challenging to manage

**Integration Complexity:** Medium

**Example for $30 entry fee:**
- Fee: $0.90 + $0.49 = $1.39 per transaction (4.6% effective rate)
- You receive: $28.61

---

#### 3. Square

**Fees:**
- 2.9% + $0.30 per transaction (online)
- No monthly fees

**Pros:**
- Good for businesses also doing in-person payments
- Square Online Checkout available
- Can connect to LLC bank account

**Cons:**
- Less developer-focused than Stripe
- Python SDK exists but less mature
- Primarily designed for retail/in-person use cases
- Integration documentation not as comprehensive

**Integration Complexity:** Medium-High

**Example for $30 entry fee:**
- Fee: $0.87 + $0.30 = $1.17 per transaction (3.9% effective rate)
- You receive: $28.83

---

#### 4. Venmo for Business

**Fees:**
- 1.9% + $0.10 per transaction (business profile)
- No monthly fees

**Pros:**
- Lowest fees of all options
- Popular with younger demographics
- Venmo Business Profile can connect to LLC

**Cons:**
- NO real API/SDK for custom integration
- Requires manual QR code or Venmo button
- No programmatic payment verification
- Would require manual reconciliation of payments
- Not suitable for automated web integration

**Integration Complexity:** NOT FEASIBLE for automated system

**Example for $30 entry fee:**
- Fee: $0.57 + $0.10 = $0.67 per transaction (2.2% effective rate)
- You receive: $29.33

---

#### 5. Other Options Considered

**Zelle:**
- Free transfers but NO business API
- Cannot integrate into website
- Would require manual payment tracking

**Cash App for Business:**
- 2.75% per transaction
- Limited API capabilities
- Not suitable for web integration

**Authorize.net:**
- $25/month + 2.9% + $0.30
- Overkill for this use case
- More suited for established e-commerce

---

### PCI Compliance Considerations

#### What is PCI DSS?
Payment Card Industry Data Security Standard - requirements for handling credit card data.

#### Compliance Levels:
- **Level 4** (fewer than 20,000 transactions/year): Applies to this project
- Requires: Self-Assessment Questionnaire (SAQ)

#### How Providers Handle Compliance:

**Using Stripe Checkout or Stripe Elements (Recommended):**
- Card data NEVER touches your server
- You qualify for **SAQ-A** (simplest form, ~20 questions)
- Stripe is PCI Level 1 certified (highest level)
- Your responsibility: Keep your website secure (HTTPS, etc.)

**Using PayPal Checkout:**
- Similar to Stripe - card data handled by PayPal
- SAQ-A eligible
- PayPal is PCI compliant

**If you collected card numbers directly:**
- Would require SAQ-D (300+ questions)
- Annual security scans required
- **DO NOT DO THIS** - always use hosted payment forms

#### Our Responsibilities:
1. Use HTTPS on all pages (Vercel provides this automatically)
2. Use provider's hosted payment forms (Stripe Checkout)
3. Never log or store card numbers
4. Keep software dependencies updated
5. Complete SAQ-A annually (simple self-certification)

---

### Legal Considerations

#### Is This Gambling?

**Key Legal Distinctions:**
- **Gambling:** Outcome determined primarily by chance
- **Contest/Sweepstakes:** Involves skill and/or no purchase necessary
- **Fantasy Sports:** Skill-based selection of real athletes

**Masters Pool Analysis:**
- Selecting golfers requires knowledge/skill (research, rankings, past performance)
- Similar to fantasy sports which are legal in most states under UIGEA (2006)
- Entry fee with prize pool is common in fantasy sports

**Risk Factors:**
- Prize pool funded entirely by entry fees
- Money changes hands based on tournament outcome
- Could be viewed as "social gambling" in some jurisdictions

#### State-by-State Considerations:

**States with Fantasy Sports Restrictions (may affect pools):**
- **Arizona, Iowa, Louisiana, Montana, Nevada, Washington** - have specific fantasy sports laws
- Some states require registration/licensing for paid contests above thresholds
- Most states allow small private pools among friends

**Generally Safe:**
- Small, private pools (invite-only)
- Skill-based selection
- Transparent rules and prize distribution

**Higher Scrutiny:**
- Public advertising of paid pool
- Large prize pools
- High participant counts

**Recommendation:**
- Keep pool "private" (invitation-based, not publicly advertised)
- Limit geographic participation if concerned about specific states
- Consult attorney in your state for definitive guidance on thresholds

#### Terms of Service Requirements:
1. Clear explanation of entry fees and prize distribution
2. Refund policy (before tournament starts)
3. Age verification (18+ or 21+ depending on state)
4. Dispute resolution process
5. Right to cancel/modify pool
6. Privacy policy for email collection
7. Rules for tie-breakers

#### Payment Provider ToS Concerns:
- **Stripe:** Generally allows skill-based contests; explicitly prohibits gambling
- **PayPal:** More restrictive on gambling-adjacent activities; higher risk of account holds
- **Both require:** Accurate business description during signup

**Stripe Restricted Business Guidelines:**
- Fantasy sports ARE allowed if skill-based
- Must comply with local laws
- Recommend describing as "fantasy sports contest" not "betting pool"

---

### Recommendation

#### Primary Choice: STRIPE

**Why Stripe:**
1. **Best developer experience** - Clean Python SDK, excellent documentation
2. **Stripe Checkout** - Hosted payment page handles all PCI compliance
3. **Simple bank connection** - Dashboard setup for LLC account
4. **Reliable payouts** - 2-day standard, daily available
5. **Lower risk** - More lenient on fantasy/contest activities than PayPal
6. **Easy Vercel integration** - Well-documented Next.js examples

**Implementation Approach:**
- Use **Stripe Checkout Sessions** (server-side Python creates session)
- Redirect user to Stripe-hosted page for payment
- Webhook confirms successful payment and triggers email confirmation
- No card data ever touches our servers
- Store only: transaction ID, email, amount, timestamp

#### Fee Estimates:

| Scenario | Entries | Gross Revenue | Stripe Fees | Net Revenue |
|----------|---------|---------------|-------------|-------------|
| Low | 50 | $1,500 | ~$58.50 | ~$1,441.50 |
| Medium | 75 | $2,250 | ~$87.75 | ~$2,162.25 |
| High | 100 | $3,000 | ~$117.00 | ~$2,883.00 |

*Assumes average $30 entry. Fees = 2.9% + $0.30 per transaction*

**Multi-Entry Optimization:**
If participants buy multiple entries in one transaction ($60 or $90), fewer transactions means lower total fees.
- 50 people buying 2 entries each at $60: Fees = ~$117 (50 transactions)
- vs 100 separate $30 transactions: Fees = ~$117 (same math, but bundling is cleaner UX)

#### Backup Option: Square
- If Stripe account has issues, Square has comparable fee structure
- Slightly more complex integration but viable alternative

---

### Integration Overview (High-Level)

```
User Flow:
1. User fills team form + enters email
2. Click "Pay $30" button
3. Backend creates Stripe Checkout Session
4. User redirected to Stripe-hosted payment page
5. User completes payment on Stripe
6. Stripe redirects to success page
7. Stripe webhook notifies backend of payment
8. Backend saves entry + sends confirmation email
```

**Key Stripe Components Needed:**
- `stripe.checkout.Session.create()` - Create payment session (Python)
- Webhook handler for `checkout.session.completed` event
- Dashboard for refunds (no code needed - manual via Stripe Dashboard)

**Environment Variables Required:**
- `STRIPE_SECRET_KEY` - Server-side API key
- `STRIPE_PUBLISHABLE_KEY` - Client-side key (for redirect)
- `STRIPE_WEBHOOK_SECRET` - Verify webhook signatures

---

### Setup Checklist

**Stripe Account Setup:**
1. [ ] Create Stripe account at stripe.com
2. [ ] Complete business verification (LLC name, EIN, address)
3. [ ] Add LLC bank account for payouts
4. [ ] Set business category (recommend: "Recreation Services" or similar, NOT gambling)
5. [ ] Enable Stripe Checkout in Dashboard
6. [ ] Generate API keys (test mode first, then live)
7. [ ] Configure webhook endpoint URL

**Integration Steps:**
1. [ ] Install `stripe` Python package
2. [ ] Create Checkout Session endpoint
3. [ ] Build success/cancel redirect pages
4. [ ] Implement webhook handler
5. [ ] Test full flow in Stripe test mode
6. [ ] Switch to live keys for production

---

## 5. Critical Review & Risk Analysis

*Agent: Devil's Advocate*

### TIMELINE REALITY CHECK

**The Masters is April 9-12, 2026. Today is April 4, 2026.**

You have **5 days** to build, test, deploy, and accept payments for a live system that handles real money. This is extremely aggressive. Let me be blunt:

**What MUST work by April 6 (Monday):**
- WGR data ingestion (field + rankings)
- Team submission form with tier validation
- Payment processing (accepting $30)
- Email confirmation system
- Database to store submissions

**What MUST work by April 9 (Thursday 5 AM):**
- Submission deadline enforcement
- All payments processed and reconciled

**What MUST work by April 9 (Thursday 8 AM - first tee):**
- Live scoring data feed connected
- Leaderboard calculating team scores in real-time
- DQ/WD detection and team disqualification logic

**Verdict:** This timeline is HIGH RISK. You need to immediately identify MVP vs. nice-to-have and accept that some features will be manual.

---

### TECHNICAL RISKS

#### 1. Live Data Feed Failures (CRITICAL)

**Single Point of Failure:** If your live scoring API goes down during the tournament, your entire leaderboard is dead. Users will be watching the Masters on TV and your site will show stale data.

**Specific Concerns:**
- API rate limits during peak hours (especially Sunday back nine)
- API provider having their own outage (you inherit their reliability)
- Format changes or unexpected data structures (what if they add a new field and your parser breaks?)
- Latency issues - how stale is acceptable? 1 minute? 5 minutes?

**What if SportsData.io changes their API on April 8th?** You have no recourse.

**Mitigation Questions:**
- Do you have a BACKUP data source for live scoring?
- Can you manually update scores from watching TV as a fallback?
- Who is monitoring the data feed during all 4 days?

#### 2. Vercel Hosting Risks

**Free Tier Limitations:**
- Serverless function timeout: 10 seconds (free) / 60 seconds (Pro)
- If your data aggregation takes longer, functions will fail
- Bandwidth limits during traffic spikes

**Vercel Outage Scenario:** 
- Vercel is generally reliable, but has had notable outages
- If Vercel goes down Sunday afternoon during the final round, users see nothing
- You cannot control this

**No Fallback:** You have no secondary hosting. If Vercel fails, you fail.

#### 3. Python Backend on Vercel

**Architectural Concern:** Vercel is optimized for Node.js. Python support exists but:
- Cold starts are slower for Python serverless functions (1-3 seconds noted in backend plan)
- Debugging is harder in serverless
- Some Python packages don't work in serverless environment (packages with native bindings)

**Question:** Why Python backend with Vercel? Consider if Next.js API routes (Node.js) would be simpler for this specific deployment target.

#### 4. Database Concerns

**Schema looks solid, but operational questions remain:**
- What happens if DB connection pool exhausts during peak load?
- Do you have backups configured? What if submissions are lost?
- Supabase free tier: 500 MB storage, but what about connection limits?
- If Supabase has an outage, your entire app is down

#### 5. Real-Time Updates

**Polling vs. WebSockets:**
- If 100 users all poll every 10 seconds, that's 600 requests/minute
- Can your API and database handle this?
- The caching strategy (60-second TTL) helps, but consider burst traffic during exciting moments

#### 6. Cron Job Reliability

**Vercel Cron is critical for live scoring, but:**
- What if a cron execution fails silently?
- No alerting built-in - you won't know it's broken until users complain
- Per-minute cron requires Pro plan ($20/month) - is that confirmed?
- What if the score update takes longer than 60 seconds? (next cron runs while previous is still running)

---

### DATA RISKS

#### 1. WGR Update Timing (HIGH RISK)

**The Rule says:** "On the Monday before The Masters, the full field of golfers with updated WGR will be updated"

**But:** What if OWGR updates later on Monday than expected? What if a Sunday playoff delays rankings? What if a golfer's ranking changes due to a data correction?

**Specific Scenario:** User submits team at 8 PM Monday with Golfer X in the 11-30 tier. OWGR posts a correction at 10 PM moving Golfer X to tier 1-10. Is that team valid or invalid?

**You need a clear cutoff:** "Rankings are final as of [TIME] on Monday regardless of subsequent updates."

#### 2. Live Scoring Discrepancies

**What is your source of truth?** TV broadcasts sometimes show incorrect scores. APIs can have bugs. Masters.com occasionally has delays.

**Scenario:** Your API shows Player A finished at -10, but official Masters results (posted hours later) show -9 due to a penalty you weren't aware of. Team standings change.

**Question:** When do you "finalize" results? How long do you wait before paying out?

#### 3. Field Changes

**Golfer withdraws before tournament:** What if someone picks a golfer who withdraws on Wednesday (before Round 1)? Per rules, DQ only applies "after starting the tournament" but withdrawal before starting isn't addressed.

**Rule 2 says:** "If any of a team's golfers DQs or withdraws after starting the tournament, the entire team is disqualified."

**What about BEFORE starting?** Need explicit policy.

**Late field additions:** What if a golfer not in your system gets added to the field? (Rare but possible with invitation system)

#### 4. API Data Format

**You have no SLA with SportsData.io.** They can:
- Change field names without notice
- Return different data structures for edge cases (amateur golfers, etc.)
- Have inconsistent handling of missed cuts, DQs, WDs

**Test with REAL Masters data from 2024/2025 if possible.** Don't assume clean data.

#### 5. Tier Boundary Edge Cases

**What if a golfer is ranked exactly 10, 30, or 50?**
- Tier 1: 1-10 (inclusive)
- Tier 2: 11-30
- Tier 3: 31-50
- Tier 4: 51+

**The rules are clear (1-10, 11-30, 31-50, 51+)** but double-check your validation code matches exactly.

---

### BUSINESS & LEGAL RISKS (CRITICAL)

#### 1. Gambling Classification

**This may legally constitute gambling in many U.S. states.**

**Key Factors:**
- Entry fee required ($30)
- Prize is monetary (implied - where does the pool money go?)
- Element of chance (golfer performance)

**Even "skill-based" contests with entry fees are regulated in many states.** Daily Fantasy Sports (DFS) companies like DraftKings/FanDuel spent years and millions in legal fees to get licensed.

**Payment Research section mentions:** "Could be viewed as 'social gambling' in some jurisdictions"

**Specific State Concerns:**
- Arizona, Idaho, Louisiana, Montana, Nevada, Washington have strict gambling laws
- Some states require a gaming license even for private pools
- Accepting payments across state lines may invoke federal wire act concerns

**Questions You MUST Answer:**
- What states are your participants in?
- Have you consulted a gaming/gambling attorney?
- Is this a "private pool among friends" or open to the public?
- Who holds the money? (You personally become liable)

**If this is friends/family only:** Lower risk, but still technically questionable in some states.

**If this is public:** You are likely operating an unlicensed gaming operation.

#### 2. The Masters Trademark

**"The Masters" and "Augusta National" are heavily protected trademarks.**

**Risks:**
- Using "Masters" in your domain name, branding, or marketing
- Implying affiliation with Augusta National Golf Club
- Using Masters imagery (green jacket, logo, course images)

**Augusta National is famously litigious.** They have sued over use of "Masters" in unrelated contexts.

**Recommendation:** Do NOT use "Masters" in the domain name. Use generic terms like "Golf Pool" or "Spring Golf Classic" in official branding. Keep "Masters" only in private communications.

#### 3. Prize Money Handling

**Where does the $30 per entry go?**
- Do you take a cut? (Now you're definitely a business)
- Is it 100% paid out? (May still be gambling)
- What if someone disputes their loss?

**Who holds the money?** If it's your personal Stripe/bank account:
- You're personally liable for all disputes
- Tax implications (this is income if you profit)
- Chargebacks come out of your pocket

**Payment section shows:** Stripe fees of ~3.9% per transaction. Is this deducted from prize pool or absorbed?

#### 4. Stripe Account Risk

**From Payment research:** "Account holds possible for new accounts with unusual activity"

**Scenario:** You process $3,000 in payments over 3 days from a brand new Stripe account. Stripe flags this as unusual and freezes your funds for 90-day review. Users have paid, tournament is over, you can't pay winners.

**Mitigation:** 
- Set up Stripe account NOW and do test transactions
- Have backup payment method ready
- Keep detailed records of all transactions

#### 5. Refund Scenarios

**You MUST define refund policy BEFORE taking money:**

| Scenario | Refund? |
|----------|---------|
| Tournament cancelled (weather, pandemic) | ? |
| Your website goes down, they miss deadline | ? |
| They submit wrong team by accident | ? |
| Payment processed but submission failed | ? |
| They just change their mind | ? |
| Your data was wrong and affected standings | ? |

---

### UX RISKS

#### 1. Payment/Submission Atomicity (CRITICAL)

**Worst Case:** User pays $30 via Stripe, but your submission form fails to save. They paid, have no team entered, and you have no record.

**Backend plan says:** "Submit team, get payment link, team only active after payment"
**Payment plan says:** "Webhook confirms successful payment"

**But what if:** Payment webhook fails? Network error between Stripe and your server? Vercel function times out processing webhook?

**This WILL happen to someone.** How do you:
- Detect it? (Payment received in Stripe but no matching submission in DB)
- Fix it? (Manual entry? Auto-refund?)
- Communicate it? (Do they get an error message or just confusion?)

**Recommendation:** Log EVERYTHING. Have a daily reconciliation check comparing Stripe payments to database submissions.

#### 2. 5 AM EST Deadline

**Problems:**
- West Coast users: This is 2 AM PST. They will forget.
- International users: Timezone confusion guaranteed
- Daylight Saving Time: April 9, 2026 is after DST switch - ensure server uses correct timezone

**Last-minute rush:** What if 50 users try to submit at 4:55 AM? Can your system handle it? What if someone's submission is processing at 4:59 AM and takes 2 minutes - is it valid or not?

**Timestamp precision matters.** Use server time, not client time. Log everything.

**Backend suggests 5-minute buffer (close at 4:55)** - this is wise.

#### 3. Mobile Experience

**Scenario:** User at a Masters watch party, poor cell coverage, trying to check leaderboard on phone.

- Large data payloads will fail to load
- Consider a lightweight/minimal mobile view
- Offline-first? Cache last known standings?

#### 4. Golfer Selection Validation

**Real-time feedback is critical:**
- User selects golfer from tier 1-10, but they already used their tier 1-10 pick
- Clear error BEFORE payment, not after
- What if WGR data shows different tier than user expects? ("But ESPN says he's ranked 31!")

---

### OPERATIONAL RISKS

#### 1. Who Is On-Call?

**The Masters runs Thursday-Sunday.** That's 4 days where problems can occur at any moment.

**Questions:**
- Who is monitoring the system?
- How will you be alerted if the data feed fails?
- Do you have server access from your phone?
- What if you're at a wedding/flight/dead zone during the final round?

**Minimum requirement:** Error alerting to your phone (Vercel has this, but configure it NOW).

#### 2. Manual Override Capability

**The backend plan includes admin endpoints. Good. But:**
- `/api/admin/update-scores` - can you manually set ONE golfer's score?
- `/api/admin/update-rankings` - can you fix ONE golfer's tier?
- Can you manually mark a team as disqualified or un-disqualify?
- Can you manually mark a payment as received if Stripe webhook failed?

**If everything is automated with no granular admin capability, you're locked out when edge cases occur.**

#### 3. Tiebreaker Rules

**Rules.md does not specify tiebreaker.**

**Scenario:** Two teams finish at -30. Who wins the pool? 

Options:
- Split the prize?
- First submission wins?
- Additional tiebreaker (individual golfer scores)?

**This MUST be decided before the tournament, not after when money is on the line.**

#### 4. Multi-Entry Golfer Conflict

**Rule 3 says:** "no golfer can be on more than one of their teams"

**Backend proposes:** Only paid teams lock golfers

**Edge case:** User submits Team A (unpaid), Team B with same golfer (unpaid), then pays for Team B. Is Team A now invalid? What if they try to pay for Team A next?

**Need clear logic:** Either block submission entirely OR enforce uniqueness at payment time.

---

### WHAT'S THE ACTUAL MVP?

Given 5 days, here's what I'd prioritize:

**MUST HAVE (no launch without these):**
1. Static page with golfer field + tiers (can be manually entered)
2. Google Form or Typeform for team submission (validates tiers)
3. Stripe Checkout for payment (minimal code, as Payment section notes)
4. Spreadsheet to track submissions + payments
5. Simple leaderboard (even if manually updated hourly)

**NICE TO HAVE (if time permits):**
- Real-time scoring API integration
- Email confirmations
- Automated tier validation
- Webhook-based payment confirmation

**PROBABLY NOT HAPPENING IN 5 DAYS (without cutting corners):**
- Perfect mobile experience
- Real-time WebSocket updates
- Automated DQ detection with team disqualification
- Full admin panel for overrides
- Payment reconciliation automation

**Blunt recommendation:** Build the minimum that works. A Google Form + Stripe Payment Link + Google Sheet + manually updated leaderboard will run a pool successfully. Over-engineering in 5 days leads to bugs and failures. The backend architecture proposed is excellent but aggressive for this timeline.

---

### SUMMARY OF CRITICAL RISKS

| Risk | Severity | Likelihood | Notes |
|------|----------|------------|-------|
| Timeline too aggressive | CRITICAL | HIGH | 5 days is not enough for production-ready system |
| Live data feed failure | HIGH | MEDIUM | Single point of failure, no backup |
| Gambling law violation | HIGH | MEDIUM | Depends on participant scope and state |
| Payment/submission mismatch | HIGH | MEDIUM | Will definitely happen to someone |
| Stripe account hold | HIGH | LOW-MEDIUM | New account with burst of transactions |
| Trademark infringement | MEDIUM | LOW | If you use "Masters" in branding |
| Vercel outage | MEDIUM | LOW | Out of your control |
| Tiebreaker disputes | MEDIUM | HIGH | Not defined in rules |
| WGR timing confusion | MEDIUM | MEDIUM | Need clear cutoff |
| Pre-tournament withdrawal | MEDIUM | MEDIUM | Not addressed in rules |
| Database connection exhaustion | MEDIUM | LOW | Under load, Supabase free tier may struggle |

---

## Open Questions

### [Devil's Advocate] Critical Questions Requiring Immediate Answers:

**Timeline:**
1. Are you prepared to accept that some features will be manual operations rather than automated?
2. What is the absolute minimum viable product you would launch with?
3. Do you have a backup plan if the website isn't ready by April 6?

**Legal/Business:**
4. Is this pool public or private (invitation-only among friends/family)?
5. What state(s) are your participants located in?
6. Have you consulted with a lawyer about gambling regulations in your state?
7. What happens to the entry fees - 100% prize pool, or do you take a cut?

**Rules Gaps:**
8. What happens if a golfer withdraws BEFORE the tournament starts (e.g., Wednesday injury)?
9. What is the tiebreaker if two teams have the same final score?
10. At what time on Monday are WGR rankings considered "final" for tier purposes?
11. When are results "official" for prize payout purposes? Sunday night? Monday after verification?

**Operations:**
12. Who will monitor the system during the 4-day tournament?
13. Do you have a way to manually override scores/statuses if the API fails?
14. How will you handle a situation where payment succeeded but submission failed?

**Payments:**
15. Have you already set up a Stripe account, or is that still to-do?
16. What is your refund policy for each scenario (tournament cancelled, technical issues, user error)?
17. Are Stripe fees absorbed by you or deducted from the prize pool?

---

### [Payment Agent] Questions Requiring User Input:

**LLC & Business Setup:**
1. What state is your LLC incorporated in? (Affects legal considerations for fantasy sports)
2. Do you already have a business bank account connected to the LLC, or will you need to open one?
3. Do you have an EIN (Employer Identification Number) for the LLC? (Required for Stripe business verification)

**Payment Flow Decisions:**
4. Should participants be able to buy multiple entries (2 or 3 teams) in a single transaction? This reduces fees slightly and improves UX.
5. What is your refund policy? Suggestions:
   - Full refund if requested before tournament starts (Thursday 5 AM)
   - No refunds after tournament begins
   - Alternative: Partial refund window?

**Prize Distribution:**
6. How will prize money be distributed? (Need to document in Terms of Service)
   - Example: 1st place 50%, 2nd place 30%, 3rd place 20%?
   - Will you pay out via Venmo/Zelle manually, or use Stripe Connect for automated payouts?
7. Will you take an "operator fee" (house cut) from the prize pool, or is 100% distributed to winners?

**Legal/Compliance:**
8. Is this pool limited to friends/family (private), or open to anyone (public)?
   - Private pools have fewer legal concerns
   - Public pools may require additional compliance in some states
9. Do you want to restrict participation by state? (Some states have stricter fantasy sports laws)
10. Will participants need to confirm they are 18+ (or 21+ depending on state)?

**Stripe Account Timing:**
11. Have you already created a Stripe account, or should we plan time for verification? (Business verification can take 1-3 days)

---

### [Backend Agent] Questions Requiring User Input:

**Database & Hosting:**
1. Is Vercel Pro plan ($20/month) acceptable for per-minute cron job support during the tournament? (Hobby plan only allows daily cron jobs)
2. Any preference between Supabase vs Vercel Postgres for the database? I recommend Supabase for better features and free tier.

**Duplicate Golfer Logic:**
3. If a contestant submits Team A but hasn't paid yet, then submits Team B with the same golfer - should we allow this? Options:
   - A) Only paid teams "lock" golfers (simpler, recommended)
   - B) All submitted teams lock golfers (prevents payment abandonment gaming)

**Team Entry Limit:**
4. Rules say max 3 entries per contestant. If someone submits 4 teams (1 unpaid), should we:
   - A) Block 4th submission entirely?
   - B) Allow submission but warn they can only pay for 3?

**Payment Flow:**
5. Should team submission happen BEFORE or AFTER payment?
   - A) Submit team, get payment link, team only "active" after payment (recommended)
   - B) Pay first, then pick team (worse UX)

**Missed Cut Behavior Confirmation:**
6. Rules say missed cut golfers' "scores don't change." To confirm: we keep their 36-hole total (e.g., +6) as their final score, NOT set it to 0 or exclude them?

**Admin Access:**
7. Do you need an admin dashboard UI, or is API-only with protected endpoints sufficient for manual operations?

---

### [Frontend Agent] Questions Requiring User Input:

**Team Builder UX:**
1. For the team builder, prefer Option A (guided wizard, one tier at a time) or Option B (all tiers visible, free-form selection)?
   - Option A is better for mobile users but more clicks
   - Option B is faster for desktop power users
   - I recommend Option A with responsive switch to Option B on larger screens

**Visual Identity:**
2. Do you have any branding assets (logo, colors, fonts) for the pool, or should we use a clean default theme?
3. Any preference for a color scheme? Suggestions:
   - Masters green (#006747) as primary accent
   - Neutral with green highlights
   - Custom branding

**Leaderboard Features:**
4. Should users be able to filter the leaderboard to "My Teams" only (requires entering their email)?
5. Should team details (golfer breakdown) be visible to everyone, or hidden until tournament ends? (Some pools keep picks private)

**Real-Time Updates:**
6. The backend recommends Supabase which supports real-time subscriptions. Should we use:
   - A) Supabase Realtime (true push updates, slightly more complex)
   - B) React Query polling every 30-60 seconds (simpler, slight delay)
   - I recommend Option B for simplicity unless real-time is critical

**Mobile PWA:**
7. Should we make this installable as a Progressive Web App (PWA)? Benefits:
   - "Add to Home Screen" on mobile
   - Works offline (leaderboard cache)
   - Push notifications for score updates (optional)
   - Adds ~1-2 days development time

**Content Questions:**
8. What information should the landing page emphasize?
   - Countdown to deadline
   - How to enter / rules summary
   - Current leaderboard (during tournament)
   - Prize information?
9. Do you want a dedicated "Rules" page, or is a modal/accordion sufficient?

---

### [Data Source Agent] Questions Requiring User Input:

**Budget & Pricing Verification:**
1. What is the acceptable monthly budget for data APIs? (Estimated need: $50-150/month for reliable service)
2. Can you verify current SportsData.io pricing at https://sportsdata.io/golf-api ? My knowledge may be outdated.
3. Should we also get quotes from DataGolf (datagolf.com) for comparison?

**Data Requirements Clarification:**
4. For live scoring, what update frequency is acceptable? (Options: real-time/1min, every 5min, every 15min)
5. Do you need hole-by-hole scoring, or just overall score relative to par?
6. Should we show stats like fairways hit, putts, etc., or just tournament position/score?

**Risk Tolerance:**
7. Are you comfortable relying on a paid API, or do you want a fully manual fallback capability?
8. Should we build an admin panel for manual score entry as emergency backup?

**Field List Verification:**
9. How will we determine the official Masters field? (Announced ~week before tournament)
10. The Masters field is typically 80-90 players - do all need to be available for selection, or only top-ranked?

**Legal/Compliance:**
11. Is this pool for money? If so, we need to ensure data usage complies with API terms for commercial use.
12. Some APIs prohibit gambling-related use - need to verify SportsData.io terms for fantasy pools.

**Technical Discovery Needed:**
13. [ACTION NEEDED] Visit sportsdata.io and request trial access to verify:
    - Masters tournament coverage
    - Data format and fields available
    - Exact pricing for our usage level
    - Terms regarding fantasy/pool usage

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Pool is private/invite-only | Legal simplicity for fantasy sports | 2026-04-04 |
| LLC in Texas | User's existing LLC | 2026-04-04 |
| Entry fees cover costs, remainder is prize pool | Stripe fees, hosting, API costs deducted first | 2026-04-04 |
| Tiebreaker: 1st) Best 51+ golfer, 2nd) Best combined 11-30, 3rd) Split prizes | Clear hierarchy before prize splitting | 2026-04-04 |
| Pre-Round 1 WD: Allow resubmission or refund | Protects users from bad luck before tournament starts | 2026-04-04 |
| WGR lock time: 9 AM EST Monday (April 6) | Clear cutoff for tier assignments | 2026-04-04 |
| Full automation required | User available to monitor; no MVP fallback | 2026-04-04 |
| Multi-entry single transaction | Users can buy 2-3 teams in one payment; reduces fees | 2026-04-04 |
| Prize distribution: 50/30/20 | 1st: 50%, 2nd: 30%, 3rd: 20% (subject to change) | 2026-04-04 |
| SportsData.io trial started | User initiated trial; verify Masters coverage | 2026-04-04 |
| Build manual admin panel | Emergency backup for score entry if API fails | 2026-04-04 |
| Guided wizard for team builder | Step-by-step on all devices (not responsive switch) | 2026-04-04 |
| Team picks visible after deadline | Public leaderboard once submissions lock (5 AM Thu) | 2026-04-04 |
| Green-accented theme | Clean design with green highlights | 2026-04-04 |
| Use Supabase REST API (not direct Postgres) | Stateless connections scale to 2000+ users; avoids connection limits | 2026-04-04 |
| Vercel Edge caching on all GET endpoints | 30s cache on leaderboard reduces DB load by 99% | 2026-04-04 |
| Build ESPN scraper for testing/backup | Free alternative; abstract data source pattern allows swapping | 2026-04-04 |
| Recommend SportsData.io as primary data source | Single provider for WGR + live scores; commercial reliability; legal compliance | 2026-04-04 |
| Avoid scraping Masters.com | Augusta National aggressively protects IP; high legal risk | 2026-04-04 |
| Manual entry as viable WGR backup | One-time task on Monday before tournament; zero cost | 2026-04-04 |
| Build admin fallback for live scores | Critical risk mitigation if API fails during tournament | 2026-04-04 |
| FastAPI as Python framework | Async support, Pydantic validation, lightweight, good Vercel compatibility | 2026-04-04 |
| Supabase as database | PostgreSQL, generous free tier, real-time capability, good Python SDK | 2026-04-04 |
| Vercel Cron for background jobs | Native integration; recommend Pro plan for per-minute updates | 2026-04-04 |
| Database-as-cache pattern | Store scores in DB, serve from DB; simple and reliable | 2026-04-04 |
| Stripe as payment provider | Best Python SDK, Checkout handles PCI compliance, 2.9%+$0.30 fees, fantasy-sports friendly | 2026-04-04 |
| Use Stripe Checkout (hosted) | No PCI burden on us (SAQ-A only), minimal code, secure | 2026-04-04 |
| Keep pool private/invite-only | Reduces legal complexity for fantasy sports classification | 2026-04-04 |
| Describe as "fantasy sports contest" | Avoid gambling terminology in Stripe account setup | 2026-04-04 |
| Zustand + React Query for state | Zustand for client state (~1kb), React Query for server state with polling/caching | 2026-04-04 |
| Polling over WebSockets for live updates | Golf pace doesn't need true real-time; polling every 30-60s sufficient; simpler on Vercel | 2026-04-04 |
| Mobile-first design approach | Heavy mobile usage expected during tournament viewing; 640px primary breakpoint | 2026-04-04 |
| Guided wizard for team builder | Step-by-step tier selection reduces errors, better mobile UX | 2026-04-04 |
| shadcn/ui + Tailwind for UI | Accessible, customizable, rapid development with mobile-first utilities | 2026-04-04 |
| Next.js App Router | Server Components for rankings, client components for interactive features | 2026-04-04 |
