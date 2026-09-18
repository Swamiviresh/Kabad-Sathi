'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ShoppingBasket,
  Flame,
  Gift,
  Leaf,
  Lock,
  Phone,
  Receipt,
  ShoppingBag,
  Sprout,
  Zap,
} from 'lucide-react';
import { REWARDS, TIERS, type Reward, type TierId } from '../lib/rewards';
import { useLanguage } from '../lib/LanguageContext';
import type { TranslationKey } from '../lib/i18n';

type Summary = {
  lifetimePoints: number;
  spentPoints: number;
  balance: number;
  tier: TierId;
  tierBonus: number;
  nextTier: TierId | null;
  pointsToNextTier: number;
  progress: number;
  streakMonths: number;
  pickupCount: number;
  recentEarnings: { points: number; completed_at: string; kg: number }[];
  redemptions: { id: string; reward_id: string; cost: number; code: string; created_at: string }[];
};

const ICONS: Record<Reward['icon'], React.ReactNode> = {
  phone: <Phone size={18} />,
  basket: <ShoppingBasket size={18} />,
  sprout: <Sprout size={18} />,
  receipt: <Receipt size={18} />,
  zap: <Zap size={18} />,
  bag: <ShoppingBag size={18} />,
};

const TIER_KEY: Record<TierId, TranslationKey> = {
  sapling: 'tier_sapling',
  tree: 'tier_tree',
  grove: 'tier_grove',
  forest: 'tier_forest',
};

export default function RewardsPanel({
  userId,
  refreshKey,
  onToast,
}: {
  userId: string;
  /** Bump to re-fetch after a pickup completes. */
  refreshKey?: number;
  onToast?: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rewards', { headers: { 'x-user-id': userId } });
      const j = await res.json();
      if (j.rewards) setSummary(j.rewards);
    } catch {}
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function redeem(reward: Reward) {
    setBusy(reward.id);
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ rewardId: reward.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        onToast?.(j.error || t('not_enough_points'));
        return;
      }
      setSummary(j.rewards);
      onToast?.(t('toast_redeemed'));
    } catch {
      onToast?.(t('toast_server'));
    } finally {
      setBusy(null);
    }
  }

  if (!summary) return <div className="skeleton h-56" />;

  const tierIndex = TIERS.findIndex((x) => x.id === summary.tier);

  return (
    <section className="card overflow-hidden">
      {/* ── balance header ── */}
      <div className="bg-leaf-dark px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
              <Gift size={16} className="text-signal" />
              {t('rewards')}
            </div>
            <div className="mt-1 font-display text-4xl font-bold tabular-nums text-signal">
              {summary.balance.toLocaleString('en-IN')}
            </div>
            <div className="text-sm text-white/70">{t('points_balance')}</div>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-display text-lg font-bold">
              <Leaf size={17} className="text-signal" />
              {t(TIER_KEY[summary.tier])}
            </div>
            {summary.streakMonths > 1 && (
              <div className="mt-1 flex items-center justify-end gap-1 text-sm text-white/70">
                <Flame size={14} className="text-signal" />
                {summary.streakMonths} {t('streak_months')}
              </div>
            )}
            {summary.tierBonus > 1 && (
              <div className="mt-0.5 text-xs text-white/60">
                +{Math.round((summary.tierBonus - 1) * 100)}% {t('bonus_active')}
              </div>
            )}
          </div>
        </div>

        {/* ── tier ladder ── */}
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-500"
              style={{ width: `${Math.round(summary.progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/70">
            <span>
              {t('lifetime_points')}: {summary.lifetimePoints.toLocaleString('en-IN')}
            </span>
            <span>
              {summary.nextTier
                ? `${summary.pointsToNextTier} ${t('points')} ${t('next_level_in')} · ${t(
                    TIER_KEY[summary.nextTier],
                  )}`
                : t('top_level')}
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {summary.lifetimePoints === 0 ? (
          <p className="max-w-prose text-sm text-ink-soft">{t('no_points_yet')}</p>
        ) : (
          <p className="max-w-prose text-sm text-ink-soft">{t('rewards_sub')}</p>
        )}

        {/* ── catalogue ── */}
        <h3 className="mt-6 font-display text-lg font-bold">{t('reward_catalogue')}</h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {REWARDS.map((reward) => {
            const requiredIndex = reward.minTier
              ? TIERS.findIndex((x) => x.id === reward.minTier)
              : 0;
            const tierLocked = tierIndex < requiredIndex;
            const affordable = summary.balance >= reward.cost;
            const disabled = tierLocked || !affordable || busy === reward.id;

            return (
              <li key={reward.id} className="panel flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      tierLocked ? 'bg-paper text-ink-faint' : 'bg-leaf-wash text-leaf-dark'
                    }`}
                  >
                    {tierLocked ? <Lock size={16} /> : ICONS[reward.icon]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{t(reward.titleKey as TranslationKey)}</div>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {t(reward.bodyKey as TranslationKey)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-display font-bold tabular-nums text-leaf-dark">
                    {reward.cost.toLocaleString('en-IN')} {t('points')}
                  </span>
                  <button
                    type="button"
                    onClick={() => redeem(reward)}
                    disabled={disabled}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {busy === reward.id
                      ? t('please_wait')
                      : tierLocked
                        ? t('locked_tier')
                        : affordable
                          ? t('redeem')
                          : t('not_enough_points')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* ── redeemed codes ── */}
        {summary.redemptions.length > 0 && (
          <>
            <h3 className="mt-7 font-display text-lg font-bold">{t('my_redemptions')}</h3>
            <ul className="mt-3 space-y-2">
              {summary.redemptions.map((r) => {
                const reward = REWARDS.find((x) => x.id === r.reward_id);
                return (
                  <li
                    key={r.id}
                    className="inset flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <div>
                      <div className="font-semibold">
                        {reward ? t(reward.titleKey as TranslationKey) : r.reward_id}
                      </div>
                      <div className="text-xs text-ink-soft">
                        {t('redemption_code')} · −{r.cost} {t('points')}
                      </div>
                    </div>
                    <code className="rounded-control border border-dashed border-leaf bg-leaf-wash px-3 py-1.5 font-display text-sm font-bold tracking-wider text-leaf-dark">
                      {r.code}
                    </code>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* ── how points work ── */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-6 text-sm font-bold text-leaf hover:underline"
          aria-expanded={open}
        >
          {t('why_points_t')}
        </button>
        {open && <p className="mt-2 max-w-prose text-sm text-ink-soft">{t('why_points_d')}</p>}
      </div>
    </section>
  );
}
