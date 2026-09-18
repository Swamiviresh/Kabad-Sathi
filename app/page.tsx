'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Bot,
  Factory,
  Gift,
  HandCoins,
  MapPinned,
  Recycle,
} from 'lucide-react';
import Dashboard from '../components/Dashboard';
import Auth, { Profile } from '../components/Auth';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { supabase } from '../lib/supabase';
import { RATES } from '../lib/rates';
import { useLanguage } from '../lib/LanguageContext';
import type { TranslationKey } from '../lib/i18n';

export default function Home() {
  const { t } = useLanguage();
  const [user, setUser] = useState<Profile | null>(null);
  const [pendingRole, setPendingRole] = useState<'customer' | 'collector' | null>(null);
  const [authScreen, setAuthScreen] = useState(false);

  // Restore an existing session on load
  useEffect(() => {
    const client = supabase;
    if (!client) {
      try {
        const saved = localStorage.getItem('ks-user');
        if (saved) setUser(JSON.parse(saved));
      } catch {}
      return;
    }
    client.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) return;
      client
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) setUser(profile as Profile);
        });
    });
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem('ks-user');
    setUser(null);
    setAuthScreen(false);
    setPendingRole(null);
  };

  if (user) {
    return (
      <Dashboard role={user.role} user={user} onBack={() => setUser(null)} onSignOut={signOut} />
    );
  }

  if (authScreen) {
    return (
      <Auth
        initialRole={pendingRole || 'customer'}
        onAuth={(p) => {
          localStorage.setItem('ks-user', JSON.stringify(p));
          setUser(p);
          setAuthScreen(false);
        }}
        onBack={() => setAuthScreen(false)}
      />
    );
  }

  const openAuth = (role: 'customer' | 'collector') => {
    setPendingRole(role);
    setAuthScreen(true);
  };

  // The chain is a genuine sequence, so it earns its numbering.
  const chain: TranslationKey[] = [
    'chain_household',
    'chain_app',
    'chain_collector',
    'chain_recycler',
    'chain_recycling',
  ];

  const features: { icon: React.ReactNode; title: TranslationKey; body: TranslationKey }[] = [
    { icon: <MapPinned size={22} />, title: 'feat_nearby_t', body: 'feat_nearby_d' },
    { icon: <HandCoins size={22} />, title: 'feat_simple_t', body: 'feat_simple_d' },
    { icon: <Recycle size={22} />, title: 'feat_formal_t', body: 'feat_formal_d' },
    { icon: <Bot size={22} />, title: 'feat_ai_t', body: 'feat_ai_d' },

    { icon: <Factory size={22} />, title: 'feat_market_t', body: 'feat_market_d' },
    { icon: <Gift size={22} />, title: 'feat_rewards_t', body: 'feat_rewards_d' },
  ];

  return (
    <main>
      {/* ── hero ───────────────────────────────────────────────────── */}
      <section className="bg-leaf-dark px-5 pb-20 pt-6 text-white sm:px-8">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-display text-xl font-bold">
            <Recycle size={22} className="text-signal" />
            {t('kabad_saathi')}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/recycle"
              className="hidden items-center gap-1.5 rounded-control border border-white/25 px-3.5 py-2 text-sm font-bold hover:bg-white/10 sm:flex"
            >
              <Banknote size={15} /> {t('marketplace')}
            </Link>
            <LanguageSwitcher />
          </div>
        </nav>

        <div className="mx-auto mt-14 grid max-w-6xl items-center gap-12 lg:mt-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="pill bg-white/10 text-white">{t('hero_badge')}</span>

            <h1 className="mt-5 font-display text-[clamp(2.6rem,7vw,4.6rem)] font-bold">
              {t('hero_line_1')}
              <br />
              <span className="text-signal">{t('hero_line_2')}</span>
            </h1>

            <p className="mt-6 max-w-prose text-lg text-white/80">{t('hero_sub')}</p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button type="button" onClick={() => openAuth('customer')} className="btn-primary btn-signal">
                {t('cta_request_pickup')}
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => openAuth('collector')}
                className="btn-ghost border-white/35 text-white hover:border-white hover:bg-white/10"
              >
                {t('cta_join_collector')}
              </button>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">

              <span className="flex items-center gap-1.5">
                <Bot size={15} /> {t('chip_assistant')}
              </span>
              <span className="flex items-center gap-1.5">
                <Banknote size={15} /> {t('chip_marketplace')}
              </span>
            </div>
          </div>

          {/* The rate board: the one object every scrap shop already has on its wall,
              here holding the app's real, live rate card. */}
          <div className="rate-board p-6 sm:p-7">
            <div className="flex items-baseline justify-between border-b-2 border-[rgba(185,224,76,0.4)] pb-3">
              <h2 className="font-display text-2xl font-bold text-white">{t('rate_card')}</h2>
              <span className="text-sm text-white/55">₹ / kg</span>
            </div>
            <div className="mt-2">
              {Object.entries(RATES).map(([material, rate]) => (
                <div className="rate-row" key={material}>
                  <span className="text-white/85">{material}</span>
                  <span className="rate-price text-xl">₹{rate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── the chain ──────────────────────────────────────────────── */}
      <section className="border-b border-line bg-surface px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-bold">{t('recycling_chain')}</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {chain.map((step, i) => (
              <li key={step} className="inset flex items-center gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-dark font-display text-sm font-bold text-signal">
                  {i + 1}
                </span>
                <span className="font-bold">{t(step)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── features ───────────────────────────────────────────────── */}
      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-prose font-display text-[clamp(1.8rem,4vw,2.6rem)] font-bold">
            {t('features_heading')}
          </h2>
          <p className="mt-3 max-w-prose text-ink-soft">{t('features_sub')}</p>

          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="border-t-2 border-line pt-5">
                <span className="text-leaf">{f.icon}</span>
                <h3 className="mt-3 font-display text-xl font-bold">{t(f.title)}</h3>
                <p className="mt-2 max-w-prose text-ink-soft">{t(f.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-10 text-sm text-ink-soft sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2 font-bold text-ink">
            <Recycle size={17} className="text-leaf" />
            {t('kabad_saathi')}
          </span>
          <Link href="/recycle" className="font-semibold text-leaf hover:underline">
            {t('marketplace')}
          </Link>
        </div>
      </footer>
    </main>
  );
}
