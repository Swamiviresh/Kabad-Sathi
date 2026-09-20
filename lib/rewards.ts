/**
 * Green Points — the rewards layer.
 *
 * DESIGN NOTE ON THE POINTS FORMULA
 * Points are deliberately NOT proportional to the rupee value of the scrap. If they were,
 * a household would earn 50× more for copper than for glass, which is exactly backwards
 * from what the app is trying to encourage: copper already pays well enough to motivate
 * itself, while glass and e-waste are the materials people throw in the bin because the
 * cash return is not worth the effort.
 *
 * So the multiplier tracks *recycling benefit and diversion difficulty*, not price. Glass
 * pays ₹2/kg but carries a 1.6× multiplier; copper pays ₹450/kg and carries 1×. The cash
 * and the points pull in different directions on purpose, and together they cover more
 * of the waste stream than either would alone.
 */

export const POINTS_PER_KG = 10;

/** One-time bonus for joining Green Points, granted at signup or on later opt-in. */
export const WELCOME_BONUS_POINTS = 50;

/** Multiplier by material — higher where the cash incentive alone is too weak. */
export const POINT_MULTIPLIERS: Record<string, number> = {
  'E-waste': 3.0, // hazardous, usually ends up in landfill
  Glass: 1.6, // heavy, low value, high recycling benefit
  Plastic: 1.5, // the material the app most wants out of the bin
  Cardboard: 1.2,
  Paper: 1.1,
  Metal: 1.0,
  Aluminium: 1.0,
  Copper: 1.0, // already pays ₹450/kg — needs no extra nudge
  Other: 0.8,
};

export type PointsItem = { type: string; kg: number };

/** Points for a single line item. */
export function itemPoints(item: PointsItem): number {
  const multiplier = POINT_MULTIPLIERS[item.type] ?? 1;
  return Math.round(item.kg * POINTS_PER_KG * multiplier);
}

/** Points for a whole pickup. */
export function pickupPoints(items: PointsItem[]): number {
  return items.reduce((sum, item) => sum + itemPoints(item), 0);
}

// ── tiers ──────────────────────────────────────────────────────────
export type TierId = 'sapling' | 'tree' | 'grove' | 'forest';

export type Tier = {
  id: TierId;
  /** Lifetime points needed to reach this tier. */
  threshold: number;
  /** Extra points earned on every pickup at this tier, as a multiplier. */
  bonus: number;
  perks: string[];
};

export const TIERS: Tier[] = [
  { id: 'sapling', threshold: 0, bonus: 1.0, perks: ['tier_perk_basic'] },
  { id: 'tree', threshold: 500, bonus: 1.05, perks: ['tier_perk_priority'] },
  { id: 'grove', threshold: 2000, bonus: 1.1, perks: ['tier_perk_priority', 'tier_perk_bonus'] },
  {
    id: 'forest',
    threshold: 5000,
    bonus: 1.2,
    perks: ['tier_perk_priority', 'tier_perk_bonus', 'tier_perk_pickup'],
  },
];

export function tierFor(lifetimePoints: number): Tier {
  return [...TIERS].reverse().find((t) => lifetimePoints >= t.threshold) || TIERS[0];
}

export function nextTier(lifetimePoints: number): Tier | null {
  return TIERS.find((t) => t.threshold > lifetimePoints) || null;
}

/** 0–1 progress towards the next tier (1 when already at the top tier). */
export function tierProgress(lifetimePoints: number): number {
  const current = tierFor(lifetimePoints);
  const next = nextTier(lifetimePoints);
  if (!next) return 1;
  const span = next.threshold - current.threshold;
  return Math.min(1, Math.max(0, (lifetimePoints - current.threshold) / span));
}

// ── catalogue ──────────────────────────────────────────────────────
export type Reward = {
  id: string;
  cost: number;
  /** i18n keys — the catalogue is rendered in the user's language. */
  titleKey: string;
  bodyKey: string;
  icon: 'phone' | 'basket' | 'sprout' | 'receipt' | 'zap' | 'bag';
  /** Minimum tier required, if any. */
  minTier?: TierId;
};

export const REWARDS: Reward[] = [
  {
    id: 'sapling-planted',
    cost: 300,
    titleKey: 'reward_sapling_t',
    bodyKey: 'reward_sapling_d',
    icon: 'sprout',
  },
  {
    id: 'cloth-bags',
    cost: 450,
    titleKey: 'reward_bags_t',
    bodyKey: 'reward_bags_d',
    icon: 'bag',
  },
  {
    id: 'recharge-50',
    cost: 500,
    titleKey: 'reward_recharge_t',
    bodyKey: 'reward_recharge_d',
    icon: 'phone',
  },
  {
    id: 'priority-pickup',
    cost: 800,
    titleKey: 'reward_priority_t',
    bodyKey: 'reward_priority_d',
    icon: 'zap',
    minTier: 'tree',
  },
  {
    id: 'grocery-100',
    cost: 950,
    titleKey: 'reward_grocery_t',
    bodyKey: 'reward_grocery_d',
    icon: 'basket',
  },
  {
    id: 'bill-credit-250',
    cost: 2200,
    titleKey: 'reward_credit_t',
    bodyKey: 'reward_credit_d',
    icon: 'receipt',
    minTier: 'grove',
  },
];

export function findReward(id: string): Reward | undefined {
  return REWARDS.find((r) => r.id === id);
}

/** True when the user's tier is at or above the reward's minimum. */
export function tierAllows(reward: Reward, lifetimePoints: number): boolean {
  if (!reward.minTier) return true;
  const required = TIERS.findIndex((t) => t.id === reward.minTier);
  const have = TIERS.findIndex((t) => t.id === tierFor(lifetimePoints).id);
  return have >= required;
}

/**
 * Consecutive months (ending with the current or previous month) that contain at least
 * one completed pickup. Allows the current month to be empty so a streak isn't shown as
 * broken on the 1st of a month before the user has had a chance to book.
 */
export function monthStreak(monthKeys: string[]): number {
  const months = new Set(monthKeys);
  const cursor = new Date();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  if (!months.has(key(cursor))) cursor.setMonth(cursor.getMonth() - 1);

  let streak = 0;
  while (months.has(key(cursor))) {
    streak++;
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return streak;
}

/** Short human-readable redemption code, e.g. KS-SAPL-4821. */
export function redemptionCode(rewardId: string, seed: string): string {
  const slug = rewardId.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `KS-${slug}-${String(1000 + (h % 9000))}`;
}
