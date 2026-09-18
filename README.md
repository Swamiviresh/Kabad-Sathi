# Kabad Saathi ♻️
Hackathon MVP connecting households and informal waste collectors.

## Run
1. `npm install`
2. Copy `.env.example` to `.env.local`. Supabase credentials are optional (the app works in local JSON-file mode without them). Add `ANTHROPIC_API_KEY` for the AI assistant — all optional, everything has a safe offline fallback.
3. If using Supabase, run `supabase.sql` in the Supabase SQL Editor.
4. `npm run dev`

## Demo
The landing page has **Request Pickup** and **Join as Kabadiwala** buttons. The app works in demo mode without Supabase; adding Supabase enables persistent data and real-time updates.

## Notes
- Map uses Leaflet + OpenStreetMap.
- For production, tighten the example RLS policies and add authenticated role-aware policies before deployment.


## Auth (added)
- Login/register via Supabase Auth (email + password). Run the updated `supabase.sql` — it adds a trigger that auto-creates a `profiles` row from signup metadata.
- Without Supabase env vars the app runs in demo mode (fake session, any details work).
- New/changed files: `components/Auth.tsx` (new), `app/page.tsx` (auth gate + session restore), `components/Dashboard.tsx` (sign-out button, real `customer_id`/`collector_id`, formatted code).

## Multi-item pickups (added)
- Customers can add multiple waste items per request; each type has a fixed ₹/kg rate (`lib/rates.ts`).
- Requests store `items` (jsonb) + `total_amount`; re-run the appended `supabase.sql` migration.
- Collector cards now show the full item breakdown, total, date/time, location and notes.

## Local database (added)
- No Supabase needed: users and pickup requests persist in `data/db.json` via Next.js API routes (`app/api/...`).
- Auth errors are explicit: **404** = email not registered, **401** = wrong password, **409** = email already registered.
- Passwords are hashed with scrypt (salted); the data file is gitignored.


## AI Saathi assistant (added)
- `components/AIAssistant.tsx` — a floating chat widget (typed + voice, via the browser's Web Speech API) that replaces the old voice-only assistant.
- `POST /api/assistant` calls Gemini (no `lib/ai.ts` now, using Gemini SDK directly in the route) with **tool-use** so it can actually check pickup status, cancel a pickup, look up scrap prices, read a collector's monthly earnings, or pre-fill a new booking, instead of just chatting.
- Needs `GOOGLE_API_KEY` in `.env.local` (get one at https://aistudio.google.com/app/apikey). **Without a key** it automatically falls back to the original keyword-based command parser (`lib/voiceIntent.ts`) so the demo still works — it just can't hold an open-ended conversation.
- Speaks its reply back out loud only when triggered by voice (typed chat stays silent).


## Recycler marketplace (added)
- `/recycle` (`app/recycle/page.tsx`) — a directory of real Indian recycling companies/programmes (Recykal, Attero, Banyan Nation, Saahas Zero Waste, ITC WOW) that buy sorted scrap in bulk, filterable by category, so a kabadiwala with a day's sorted collection can find a formal buyer instead of an informal middleman markdown.
- `data/recyclers.ts` is **hand-curated static seed data** compiled from each company's public info — this sandbox has no outbound network access to run a live scraper or call a paid data API at request time, so it ships accurate, checked data rather than fabricating a "live" feed. Swap `getRecyclers()` for a real API/scraper later without touching the page.
- Linked from the dashboard header ("Recycler Marketplace") and the landing page.

## Pickup lifecycle (added)
- Customer creates a request → **every** collector sees it in "Requests near you".
- Collector **ACCEPT**s → it becomes their "My Current Pickup" card and disappears from
  everyone else's queue. **REJECT** hides it only from that collector — other collectors
  still see it.
- Sequential actions on the current-pickup card: `ON THE WAY` must be tapped before
  `MARK COLLECTED` appears. Marking collected does **not** complete the order.
- Only after the collector marks collected does the customer's card show **Confirm
  Complete**. When the customer confirms too, the order is finished: it is archived to a
  monthly ledger (so the Earnings/impact dashboards keep working) and **hard-deleted** —
  the data is gone from the live store per spec.
- Local-mode state machine lives in `PATCH /api/requests/[id]` (actions: `accept`,
  `reject`, `cancel`, `on_the_way`, `collector_complete`, `customer_complete`). Listings
  are role-scoped in `GET /api/requests`.

## Contact sharing (added)
- Once a collector **accepts** an order, both parties see each other's public contact
  info (name + phone, tap-to-call) on the pickup card — the customer sees "Your
  kabadiwala", the collector sees "Customer".
- Pending (unaccepted) requests carry **no contact info** — in local mode the API only
  enriches ACCEPTED/ON_THE_WAY rows; in Supabase mode an RLS policy
  ("profiles contact on accepted orders") gates profile reads the same way.
- The collector's current-pickup card now also shows a live map of the pickup location.

## Collector earnings dashboard (added)
- `components/CollectorEarnings.tsx` shows this month's Total Pickups, Total Scrap, Total Earnings, Rating and Best Category for the signed-in collector, computed live from completed pickups in `data/db.json`.
- `GET /api/collector/earnings` — computed by `collectorMonthlyStats()` in `lib/localdb.ts`.
- Ratings: `POST /api/ratings` lets a customer rate a collector (1-5) after a `COMPLETED` pickup; average feeds the dashboard's Rating stat. (No rating UI is wired into the customer flow yet — add a "Rate this pickup" button on completed cards when ready.)
# Kabad-Sathi
# Kabad-Sathi
