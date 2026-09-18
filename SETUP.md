# Kabad Saathi — setup

## 1. Install
```bash
npm install
```
(`node_modules` is not bundled in this zip — that is what keeps it a few hundred KB
instead of 200+ MB. You need this step once.)

## 2. Add your Google Gemini API key
Open `.env.local` (already in the project root) and paste your key:

```
GOOGLE_API_KEY=AIza...   # legacy key format
# or
GOOGLE_API_KEY=AQ...     # new key format
```

Get one at https://aistudio.google.com/app/apikey

The key is read server-side only. It is never sent to the browser, and `.gitignore`
keeps `.env.local` out of any repo.

## 3. Run
```bash
npm run dev
```

Then open http://localhost:3000

## 4. Check the key actually loaded
Open http://localhost:3000/api/ai-status — it reports whether a key is present and
whether it has the right shape. It never echoes the key itself.

Without a key the app still runs end to end: the assistant falls back to a keyword parser. Everything else — booking,
the collector accept/reject flow, all three languages — works with no key at all.

## Languages
English / हिन्दी / ಕನ್ನಡ. Switch from the globe button in the header. The choice is
remembered, and drives the UI, the voice input language, and the AI replies.

## How the pickup flow works
- When a customer books, the order is created with status PENDING and is broadcast to
  every collector account's dashboard.
- A collector can Accept or Reject it. Reject only hides the card from that collector —
  every other collector still sees the request.
- Once accepted, both sides see each other's name and phone number, the collector gets
  "On the way", then "Mark collected"; the customer confirms completion, and only when
  BOTH sides confirm is the order completed, archived to the monthly ledger (category,
  earnings, kg) and deleted from the live store.

## Notes for the demo
- Local mode stores data in `data/db.json`. Delete that file to reset.
- Dashboards poll every 4 seconds in local mode (Supabase mode uses realtime), so a new
  order shows up on collector dashboards without a refresh.

## Green Points (rewards)

Customers earn points every time a pickup is completed. Points appear on the customer
dashboard, under the impact stats.

**How points are calculated** — `lib/rewards.ts`

Points are 10 per kg, multiplied by material. The multiplier tracks *recycling benefit*,
not rupee value, which is deliberate: copper already pays ₹450/kg and needs no extra
nudge, while glass pays ₹2/kg and normally goes in the bin. So glass carries a 1.6×
multiplier and copper carries 1×. 10 kg of glass earns 160 points; 10 kg of copper earns
100. Cash and points pull in different directions on purpose.

**Levels** — Sapling (0) → Tree (500) → Grove (2,000) → Forest (5,000). Higher levels
carry a small per-pickup bonus and unlock the more expensive rewards.

**Catalogue** — plant a sapling (300), cloth bags (450), ₹50 recharge (500), priority
pickup (800, Tree+), ₹100 grocery voucher (950), ₹250 bill credit (2,200, Grove+).
Redeeming issues a code like `KS-SAPL-4821`, stored against the account.

**Where the numbers live** — points earned are *derived from the completion ledger* every
time they are read, never stored as a running counter, so the balance can't drift out of
sync with actual pickups. Only redemptions are stored, since a spend is an event that
can't be recomputed. All cost and tier checks run server-side in `/api/rewards`, so a
tampered request can't mint a voucher.

To retune the economy, edit `POINTS_PER_KG`, `POINT_MULTIPLIERS`, `TIERS` and `REWARDS`
in `lib/rewards.ts` — nothing else needs to change.
