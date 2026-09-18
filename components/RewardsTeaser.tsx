'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Flame, Gift, Leaf } from 'lucide-react';
import { TIERS, WELCOME_BONUS_POINTS, type TierId } from '../lib/rewards';
import { useLanguage } from '../lib/LanguageContext';
import type { TranslationKey } from '../lib/i18n';

type Summary = {
  optedIn: boolean;
  lifetimePoints: number;
  balance: number;
  tier: TierId;
  streakMonths: number;
};

const TIER_KEY: Record<TierId, TranslationKey> = {
  sapling: 'tier_sapling',
  tree: 'tier_tree',
  grove: 'tier_grove',
  forest: 'tier_forest',
};

/**
 * Lives on the customer dashboard, right where the old full rewards panel used to sit.
 * Deliberately small: the dashboard's job is booking a pickup, not running the loyalty
 * programme — the full experience (catalogue, tier ladder, redemption history) is one tap
 * away on its own page (/rewards), which is what makes it feel like a real section of the
 * app rather than a widget bolted to the bottom of another screen.
 */
export default function RewardsTeaser({
  userId,
  refreshKey,
  onToast,
}: {
  userId: string;
  refreshKey?: number;
  onToast?: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [joining, setJoining] = useState(false);

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

  async function joinNow() {
    setJoining(true);
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'opt_in' }),
      });
      const j = await res.json();
      if (j.rewards) setSummary(j.rewards);
      if (j.optIn?.bonusGranted) {
        onToast?.(`+${j.optIn.bonusGranted} ${t('points')} · ${t('opt_in_title')}`);
      }
    } catch {
      onToast?.(t('toast_server'));
    } finally {
      setJoining(false);
    }
  }

  if (!summary) return <div className="skeleton h-24" />;

  // Not a member yet: lead with the bonus and the points already sitting in the ledger,
  // which is often a nonzero, persuasive number by the time someone notices this card.
  if (!summary.optedIn) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-wash text-leaf-dark">
            <Gift size={20} />
          </span>
          <div>
            <div className="font-display font-bold">{t('opt_in_title')}</div>
            <div className="text-sm text-ink-soft">
              {t('opt_in_bonus').replace('{n}', String(WELCOME_BONUS_POINTS))}
              {summary.lifetimePoints > 0 && (
                <> · {summary.lifetimePoints} {t('points')} {t('points_earned')}</>
              )}
            </div>
          </div>
        </div>
        <button type="button" onClick={joinNow} disabled={joining} className="btn-primary shrink-0">
          {joining ? t('please_wait') : t('join_now')}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/rewards"
      className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:border-leaf"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-wash text-leaf-dark">
          <Leaf size={20} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold tabular-nums">{summary.balance}</span>
            <span className="text-sm text-ink-soft">{t('points')}</span>
            <span className="pill pill-ok">{t(TIER_KEY[summary.tier])}</span>
          </div>
          {summary.streakMonths > 1 && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
              <Flame size={12} className="text-rust" />
              {summary.streakMonths} {t('streak_months')}
            </div>
          )}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-leaf">
        {t('view_rewards')} <ArrowRight size={15} />
      </span>
    </Link>
  );
}
