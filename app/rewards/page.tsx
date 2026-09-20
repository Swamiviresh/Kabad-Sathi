'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gift, Leaf, LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../components/Auth';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import RewardsPanel from '../../components/RewardsPanel';
import RewardsOptIn from '../../components/RewardsOptIn';
import { TIERS, type TierId } from '../../lib/rewards';
import { useLanguage } from '../../lib/LanguageContext';
import type { TranslationKey } from '../../lib/i18n';

const TIER_KEY: Record<TierId, TranslationKey> = {
  sapling: 'tier_sapling',
  tree: 'tier_tree',
  grove: 'tier_grove',
  forest: 'tier_forest',
};

const TIER_PERK_KEYS: Record<TierId, TranslationKey[]> = {
  sapling: ['tier_perk_basic'],
  tree: ['tier_perk_basic', 'tier_perk_priority'],
  grove: ['tier_perk_basic', 'tier_perk_priority', 'tier_perk_bonus'],
  forest: ['tier_perk_basic', 'tier_perk_priority', 'tier_perk_bonus', 'tier_perk_pickup'],
};

export default function RewardsPage() {
  const { t } = useLanguage();
  const [user, setUser] = useState<Profile | null | undefined>(undefined); // undefined = still loading
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState('');
  const [joining, setJoining] = useState(false);
  const [optedIn, setOptedIn] = useState<boolean | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  useEffect(() => {
    const client = supabase;
    if (!client) {
      try {
        const saved = localStorage.getItem('ks-user');
        setUser(saved ? JSON.parse(saved) : null);
      } catch {
        setUser(null);
      }
      return;
    }
    client.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) {
        setUser(null);
        return;
      }
      client
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
        .then(({ data: profile }) => setUser((profile as Profile) || null));
    });
  }, []);

  // Once we know who's signed in, check membership so we can show the join banner
  // instead of the full catalogue for a customer who hasn't opted in yet.
  useEffect(() => {
    if (!user || user.role !== 'customer') return;
    fetch('/api/rewards', { headers: { 'x-user-id': user.id } })
      .then((r) => r.json())
      .then((j) => setOptedIn(Boolean(j.rewards?.optedIn)))
      .catch(() => setOptedIn(false));
  }, [user, refreshKey]);

  async function joinNow() {
    if (!user) return;
    setJoining(true);
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ action: 'opt_in' }),
      });
      const j = await res.json();
      setOptedIn(true);
      setRefreshKey((k) => k + 1);
      if (j.optIn?.bonusGranted) {
        notify(`+${j.optIn.bonusGranted} ${t('points')} · ${t('opt_in_title')}`);
      }
    } catch {
      notify(t('toast_server'));
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-leaf-dark bg-leaf-dark px-5 py-3 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-display font-bold">
            <ArrowLeft size={18} /> {t('kabad_saathi')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-5 md:p-8">
        {toast && (
          <div className="sheet-rise fixed inset-x-4 top-20 z-50 rounded-panel bg-ink px-5 py-3.5 text-sm font-semibold text-white shadow-high sm:inset-x-auto sm:right-6 sm:max-w-sm">
            {toast}
          </div>
        )}

        {/* ── hero ── */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-leaf-wash text-leaf-dark">
            <Gift size={24} />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold">{t('rewards_page')}</h1>
            <p className="text-ink-soft">{t('rewards_page_sub')}</p>
          </div>
        </div>

        {/* ── auth gates ── */}
        {user === undefined && <div className="skeleton mt-8 h-40" />}

        {user === null && (
          <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
            <p className="max-w-prose text-ink-soft">{t('rewards_login_required')}</p>
            <Link href="/" className="btn-primary shrink-0">
              <LogIn size={17} /> {t('go_to_login')}
            </Link>
          </div>
        )}

        {user && user.role === 'collector' && (
          <div className="card mt-8 p-6">
            <p className="max-w-prose text-ink-soft">{t('rewards_for_customers')}</p>
            <Link href="/" className="btn-ghost mt-4 inline-flex">
              <ArrowLeft size={17} /> {t('back')}
            </Link>
          </div>
        )}

        {user && user.role === 'customer' && (
          <>
            {/* ── tier ladder — always visible, so a brand-new member can see the whole
                path before they've earned a single point ── */}
            <section className="card mt-8 p-6">
              <h2 className="font-display text-xl font-bold">{t('how_tiers_work')}</h2>
              <p className="mt-1.5 max-w-prose text-sm text-ink-soft">{t('tier_ladder_intro')}</p>

              <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {TIERS.map((tier, i) => (
                  <li key={tier.id} className="panel p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-leaf-dark font-display text-sm font-bold text-signal">
                        {i + 1}
                      </span>
                      <span className="font-display font-bold">{t(TIER_KEY[tier.id])}</span>
                    </div>
                    <div className="mt-2 text-sm tabular-nums text-ink-soft">
                      {tier.threshold.toLocaleString('en-IN')}+ {t('points')}
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                      {TIER_PERK_KEYS[tier.id].map((perk) => (
                        <li key={perk} className="flex items-start gap-1.5">
                          <Leaf size={12} className="mt-0.5 shrink-0 text-leaf" />
                          {t(perk)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>

            {/* ── join banner or full panel ── */}
            {optedIn === false && (
              <section className="card mt-6 p-6">
                <RewardsOptIn checked={true} onChange={() => {}} />
                <button
                  type="button"
                  onClick={joinNow}
                  disabled={joining}
                  className="btn-primary mt-4 w-full py-3.5"
                >
                  {joining ? t('please_wait') : t('join_now')}
                </button>
              </section>
            )}

            {optedIn === true && (
              <div className="mt-6">
                <RewardsPanel userId={user.id} refreshKey={refreshKey} onToast={notify} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
