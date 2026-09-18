/** Server-only local database (JSON file). Used when Supabase is not configured. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  findReward,
  monthStreak,
  nextTier,
  pickupPoints,
  redemptionCode,
  tierAllows,
  tierFor,
  tierProgress,
  WELCOME_BONUS_POINTS,
} from './rewards';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

export type DBUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  phoneVerified?: boolean;
  role: 'customer' | 'collector';
  salt: string;
  passHash: string;
  /** Whether the customer has joined Green Points. Asked at registration; can also be
   *  turned on later from the rewards page. Collectors don't see rewards at all. */
  rewardsOptIn?: boolean;
  /** One-off points not tied to a pickup — currently just the signup bonus, granted once
   *  the moment a customer opts in. Kept separate from the ledger-derived total so the
   *  "points earned per kg" maths in lib/rewards.ts stays pure. */
  bonusPoints?: number;
  created_at: string;
};

export type PublicUser = Pick<
  DBUser,
  'id' | 'name' | 'email' | 'phone' | 'phoneVerified' | 'role' | 'rewardsOptIn' | 'created_at'
>;

export type DBRating = {
  id: string;
  pickup_id: string;
  customer_id?: string | null;
  collector_id: string;
  rating: number; // 1-5
  review?: string;
  created_at: string;
};

export type DBRequest = {
  id: string;
  customer_id?: string | null;
  collector_id?: string | null;
  waste_type: string;
  quantity: string;
  items?: { type: string; kg: number }[];
  total_amount?: number;
  image_url?: string | null;
  address?: string;
  latitude: number;
  longitude: number;
  pickup_date?: string;
  pickup_time?: string;
  notes?: string;
  status: string;
  /** Collectors who rejected this PENDING request — it stays hidden from them,
   *  but remains visible to every other collector. */
  rejected_by?: string[];
  /** Dual-confirm completion: the order is only finished once BOTH are true. */
  collector_confirmed_complete?: boolean;
  customer_confirmed_complete?: boolean;
  accepted_at?: string;
  completed_at?: string;
  created_at: string;
};

/**
 * Ledger entry written when an order is fully completed (both parties confirmed) and
 * hard-deleted from `requests`. Keeps monthly earnings/impact stats working even though
 * the order data itself is deleted, per spec.
 */
export type DBLedgerEntry = {
  pickup_id: string;
  customer_id: string | null;
  collector_id: string | null;
  waste_type: string;
  items: { type: string; kg: number }[];
  total_amount: number;
  total_kg: number;
  address?: string;
  completed_at: string;
  /** 'YYYY-MM' — simplifies monthly filtering. */
  month: string;
};

export type DBRedemption = {
  id: string;
  user_id: string;
  reward_id: string;
  /** Points deducted at the moment of redeeming. */
  cost: number;
  code: string;
  created_at: string;
};

type DB = {
  users: DBUser[];
  requests: DBRequest[];
  ratings?: DBRating[];
  ledger?: DBLedgerEntry[];
  redemptions?: DBRedemption[];
};

function empty(): DB {
  return { users: [], requests: [], ratings: [], ledger: [], redemptions: [] };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function read(): DB {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as DB;
    if (!db.ratings) db.ratings = [];
    if (!db.ledger) db.ledger = [];
    if (!db.redemptions) db.redemptions = [];
    return db;
  } catch {
    return empty();
  }
}

function write(db: DB) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function publicUser(user: DBUser): PublicUser {
  const { salt: _salt, passHash: _passHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Public contact info for several users at once (strips password material).
 * Used to share customer ↔ collector contact details on ACCEPTED orders only.
 */
export function publicUsersByIds(ids: string[]): Record<string, PublicUser> {
  const db = read();
  const wanted = new Set(ids);
  const out: Record<string, PublicUser> = {};
  for (const u of db.users) {
    if (wanted.has(u.id)) out[u.id] = publicUser(u);
  }
  return out;
}

// ── users ─────────────────────────────────────────────────────────
export function findUserByEmail(email: string): DBUser | undefined {
  return read().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: string): DBUser | undefined {
  return read().users.find((u) => u.id === id);
}

export function createUser(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'customer' | 'collector';
  rewardsOptIn?: boolean;
}): DBUser {
  const db = read();
  const salt = crypto.randomBytes(16).toString('hex');
  const optedIn = data.role === 'customer' && Boolean(data.rewardsOptIn);
  const user: DBUser = {
    id: crypto.randomUUID(),
    name: data.name,
    email: data.email,
    phone: data.phone || undefined,
    role: data.role,
    salt,
    passHash: hash(data.password, salt),
    rewardsOptIn: optedIn,
    bonusPoints: optedIn ? WELCOME_BONUS_POINTS : 0,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  write(db);
  return user;
}

/** Returns the user on success, or an error message. */
export function verifyLogin(
  email: string,
  password: string,
): { user?: DBUser; error?: string } {
  const user = findUserByEmail(email);
  if (!user) {
    return { error: 'No account found with this email. Please register first.' };
  }
  if (hash(password, user.salt) !== user.passHash) {
    return { error: 'Incorrect password. Please try again.' };
  }
  return { user };
}

export function findUserByPhone(phone: string): DBUser | undefined {
  return read().users.find((u) => u.phone === phone);
}

/** Creates (or returns) a phone-verified user with no password — used by OTP login. */
export function createOtpUser(data: {
  name?: string;
  phone: string;
  role: 'customer' | 'collector';
  rewardsOptIn?: boolean;
}): DBUser {
  const existing = findUserByPhone(data.phone);
  if (existing) return existing;
  const db = read();
  const salt = crypto.randomBytes(16).toString('hex');
  const optedIn = data.role === 'customer' && Boolean(data.rewardsOptIn);
  const user: DBUser = {
    id: crypto.randomUUID(),
    name: data.name || 'User',
    email: `${data.phone}@otp.local`,
    phone: data.phone,
    phoneVerified: true,
    role: data.role,
    salt,
    // OTP-only accounts have no password; store a random unusable hash.
    passHash: hash(crypto.randomBytes(32).toString('hex'), salt),
    rewardsOptIn: optedIn,
    bonusPoints: optedIn ? WELCOME_BONUS_POINTS : 0,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  write(db);
  return user;
}

export function markPhoneVerified(userId: string) {
  const db = read();
  const i = db.users.findIndex((u) => u.id === userId);
  if (i === -1) return;
  db.users[i].phoneVerified = true;
  write(db);
}

// ── pickup requests ───────────────────────────────────────────────
export function listRequests(): DBRequest[] {
  return read().requests.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function insertRequest(
  row: Omit<DBRequest, 'id' | 'created_at'>,
): DBRequest {
  const db = read();
  const req: DBRequest = {
    ...row,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  db.requests.unshift(req);
  write(db);
  return req;
}

export function updateRequest(
  id: string,
  patch: Partial<DBRequest>,
): DBRequest | undefined {
  const db = read();
  const i = db.requests.findIndex((r) => r.id === id);
  if (i === -1) return undefined;
  db.requests[i] = { ...db.requests[i], ...patch };
  write(db);
  return db.requests[i];
}

/** Latest request a customer or collector is currently tracking (not finished). */
export function findActiveRequestForUser(userId: string, role: 'customer' | 'collector') {
  const active = ['PENDING', 'ACCEPTED', 'ON_THE_WAY'];
  const key = role === 'customer' ? 'customer_id' : 'collector_id';
  return listRequests().find((r) => (r as any)[key] === userId && active.includes(r.status));
}

export function deleteRequest(id: string): DBRequest | undefined {
  const db = read();
  const i = db.requests.findIndex((r) => r.id === id);
  if (i === -1) return undefined;
  const [removed] = db.requests.splice(i, 1);
  write(db);
  return removed;
}

// ── completion ledger ─────────────────────────────────────────────
/**
 * Archives a fully-completed order into the monthly ledger, then hard-deletes it from
 * `requests`. Called when BOTH collector and customer have confirmed completion.
 */
export function archiveCompletedRequest(req: DBRequest): DBLedgerEntry {
  const completedAt = req.completed_at || new Date().toISOString();
  const totalKgValue =
    req.items?.length
      ? req.items.reduce((s, i) => s + i.kg, 0)
      : parseFloat(req.quantity) || 0;
  const entry: DBLedgerEntry = {
    pickup_id: req.id,
    customer_id: req.customer_id ?? null,
    collector_id: req.collector_id ?? null,
    waste_type: req.waste_type,
    items: req.items || [],
    total_amount: req.total_amount || 0,
    total_kg: Math.round(totalKgValue * 10) / 10,
    address: req.address,
    completed_at: completedAt,
    month: monthKey(completedAt),
  };
  const db = read();
  db.ledger = db.ledger || [];
  db.ledger.push(entry);
  // Hard-delete the order from requests in the same write — the data is gone from the
  // live store the moment it is archived, per spec.
  db.requests = db.requests.filter((r) => r.id !== req.id);
  write(db);
  return entry;
}

function ledgerInMonth(entries: DBLedgerEntry[], year: number, month: number): DBLedgerEntry[] {
  return entries.filter((e) => {
    const d = new Date(e.completed_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/** All-time impact stats for a customer, from the completion ledger (orders are deleted). */
export function customerImpactStats(customerId: string) {
  const db = read();
  const entries = (db.ledger || []).filter((e) => e.customer_id === customerId);
  // Live COMPLETED rows still exist briefly between dual-confirm write and archive —
  // include them so counts never skip.
  const live = listRequests().filter(
    (r) => r.customer_id === customerId && r.status === 'COMPLETED',
  );
  const totalKg =
    entries.reduce((s, e) => s + e.total_kg, 0) +
    live.reduce((s, r) => s + (r.items?.length ? totalKgOf(r.items) : parseFloat(r.quantity) || 0), 0);
  const totalAmount =
    entries.reduce((s, e) => s + e.total_amount, 0) +
    live.reduce((s, r) => s + (r.total_amount || 0), 0);
  return {
    totalPickups: entries.length + live.length,
    totalKg: Math.round(totalKg * 10) / 10,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

function totalKgOf(items: { type: string; kg: number }[]): number {
  return items.reduce((s, i) => s + i.kg, 0);
}

// ── ratings ───────────────────────────────────────────────────────
export function addRating(row: Omit<DBRating, 'id' | 'created_at'>): DBRating {
  const db = read();
  const rating: DBRating = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  db.ratings = db.ratings || [];
  db.ratings.push(rating);
  write(db);
  return rating;
}

export function ratingsForCollector(collectorId: string): DBRating[] {
  return (read().ratings || []).filter((r) => r.collector_id === collectorId);
}

export function hasRatingForPickup(pickupId: string): boolean {
  return (read().ratings || []).some((r) => r.pickup_id === pickupId);
}

/** Finds a completed-and-deleted order in the ledger (used to allow rating after deletion). */
export function findLedgerEntry(pickupId: string): DBLedgerEntry | undefined {
  return (read().ledger || []).find((e) => e.pickup_id === pickupId);
}

// ── rewards ──────────────────────────────────────────────────────
/**
 * Points EARNED are always derived from the completion ledger rather than stored as a
 * running total. A stored counter can drift from reality (a failed write, a manual edit,
 * a replayed request) and a drifting points balance is a support nightmare — the ledger
 * is the single source of truth, so the balance is always reconstructible.
 *
 * Points SPENT are stored, because a redemption is an event that cannot be recomputed.
 */
export function rewardsSummary(userId: string) {
  const db = read();
  const user = db.users.find((u) => u.id === userId);
  const entries = (db.ledger || []).filter((e) => e.customer_id === userId);

  // Live COMPLETED rows exist briefly between dual-confirm and archive — count them too
  // so a user never watches their points dip for a second.
  const live = listRequests().filter(
    (r) => r.customer_id === userId && r.status === 'COMPLETED',
  );

  const history = [
    ...entries.map((e) => ({
      items: e.items,
      completed_at: e.completed_at,
      month: e.month,
      points: pickupPoints(e.items),
    })),
    ...live.map((r) => ({
      items: r.items || [],
      completed_at: r.completed_at || new Date().toISOString(),
      month: monthKey(r.completed_at || new Date().toISOString()),
      points: pickupPoints(r.items || []),
    })),
  ].sort((a, b) => b.completed_at.localeCompare(a.completed_at));

  const bonusPoints = user?.bonusPoints || 0;
  const lifetimePoints = history.reduce((sum, h) => sum + h.points, 0) + bonusPoints;

  const redemptions = (db.redemptions || [])
    .filter((r) => r.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const spentPoints = redemptions.reduce((sum, r) => sum + r.cost, 0);

  const tier = tierFor(lifetimePoints);
  const next = nextTier(lifetimePoints);

  return {
    optedIn: Boolean(user?.rewardsOptIn),
    bonusPoints,
    lifetimePoints,
    spentPoints,
    balance: lifetimePoints - spentPoints,
    tier: tier.id,
    tierBonus: tier.bonus,
    nextTier: next?.id ?? null,
    pointsToNextTier: next ? Math.max(0, next.threshold - lifetimePoints) : 0,
    progress: tierProgress(lifetimePoints),
    streakMonths: monthStreak(history.map((h) => h.month)),
    pickupCount: history.length,
    recentEarnings: history.slice(0, 5).map((h) => ({
      points: h.points,
      completed_at: h.completed_at,
      kg: Math.round(h.items.reduce((s, i) => s + i.kg, 0) * 10) / 10,
    })),
    redemptions,
  };
}

/**
 * Turns on Green Points for a customer who skipped it at registration. Idempotent: opting
 * in twice does not grant the welcome bonus twice. Returns null if the account is not a
 * customer, since collectors don't have a rewards balance.
 */
export function optInToRewards(userId: string): { optedIn: boolean; bonusGranted: number } | null {
  const db = read();
  const i = db.users.findIndex((u) => u.id === userId);
  if (i === -1 || db.users[i].role !== 'customer') return null;

  const alreadyIn = Boolean(db.users[i].rewardsOptIn);
  db.users[i].rewardsOptIn = true;
  const bonusGranted = alreadyIn ? 0 : WELCOME_BONUS_POINTS;
  if (!alreadyIn) {
    db.users[i].bonusPoints = (db.users[i].bonusPoints || 0) + WELCOME_BONUS_POINTS;
  }
  write(db);
  return { optedIn: true, bonusGranted };
}

/** Deducts points by writing a redemption row. Returns an error string if not allowed. */
export function redeemReward(
  userId: string,
  rewardId: string,
): { redemption?: DBRedemption; error?: string } {
  const reward = findReward(rewardId);
  if (!reward) return { error: 'That reward does not exist.' };

  const db = read();
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.role !== 'customer') {
    return { error: 'Only customer accounts can redeem rewards.' };
  }
  if (!user.rewardsOptIn) {
    return { error: 'Join Green Points first to redeem rewards.' };
  }

  const summary = rewardsSummary(userId);
  if (!tierAllows(reward, summary.lifetimePoints)) {
    return { error: 'This reward unlocks at a higher tier.' };
  }
  if (summary.balance < reward.cost) {
    return { error: `You need ${reward.cost - summary.balance} more points for this reward.` };
  }

  const id = crypto.randomUUID();
  const redemption: DBRedemption = {
    id,
    user_id: userId,
    reward_id: rewardId,
    cost: reward.cost,
    code: redemptionCode(rewardId, id),
    created_at: new Date().toISOString(),
  };
  db.redemptions = db.redemptions || [];
  db.redemptions.push(redemption);
  write(db);
  return { redemption };
}

// ── collector earnings ───────────────────────────────────────────
export function collectorMonthlyStats(collectorId: string, monthDate = new Date()) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const inMonth = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === year && d.getMonth() === month;
  };

  // Completed orders are hard-deleted on completion, so monthly stats are ledger-backed.
  const db = read();
  const ledger = ledgerInMonth(
    (db.ledger || []).filter((e) => e.collector_id === collectorId),
    year,
    month,
  );
  // Any live COMPLETED rows not yet archived (should be none, kept for safety).
  const completed = listRequests().filter(
    (r) => r.collector_id === collectorId && r.status === 'COMPLETED' && inMonth(r.completed_at),
  );

  const totalPickups = ledger.length + completed.length;
  const totalKgValue =
    ledger.reduce((sum, e) => sum + e.total_kg, 0) +
    completed.reduce((sum, r) => {
      if (r.items?.length) return sum + r.items.reduce((s, i) => s + i.kg, 0);
      return sum + (parseFloat(r.quantity) || 0);
    }, 0);
  const totalEarnings =
    ledger.reduce((sum, e) => sum + e.total_amount, 0) +
    completed.reduce((sum, r) => sum + (r.total_amount || 0), 0);

  const kgByCategory: Record<string, number> = {};
  for (const e of ledger) {
    for (const it of e.items) {
      kgByCategory[it.type] = (kgByCategory[it.type] || 0) + it.kg;
    }
  }
  for (const r of completed) {
    for (const it of r.items || []) {
      kgByCategory[it.type] = (kgByCategory[it.type] || 0) + it.kg;
    }
  }
  const bestCategory =
    Object.entries(kgByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const ratings = ratingsForCollector(collectorId).filter((r) => inMonth(r.created_at));
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
    : null;

  return {
    totalPickups,
    totalKg: Math.round(totalKgValue * 10) / 10,
    totalEarnings,
    rating: avgRating,
    ratingCount: ratings.length,
    bestCategory,
  };
}
