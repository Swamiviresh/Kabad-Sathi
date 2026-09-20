'use client';

import { useState } from 'react';
import { Recycle, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import LanguageSwitcher from './LanguageSwitcher';
import RewardsOptIn from './RewardsOptIn';
import { useLanguage } from '../lib/LanguageContext';

export type Profile = {
  id: string;
  name: string;
  role: 'customer' | 'collector';
  phone?: string;
  phoneVerified?: boolean;
  email?: string;
  rewardsOptIn?: boolean;
};

export default function Auth({
  initialRole,
  onAuth,
  onBack,
}: {
  initialRole: 'customer' | 'collector';
  onAuth: (p: Profile) => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: initialRole,
    // Pre-checked: joining costs nothing and the checkbox is right there to opt back out,
    // so this reads as "on by default" rather than a dark pattern that hides the toggle.
    rewardsOptIn: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function ensureProfile(userId: string, fallback: Partial<Profile>) {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      onAuth(data as Profile);
      return;
    }
    const row = {
      id: userId,
      name: fallback.name || 'User',
      role: fallback.role || 'customer',
      phone: fallback.phone || null,
      email: form.email,
    };
    const { data: created } = await supabase
      .from('profiles')
      .insert(row)
      .select()
      .single();
    onAuth((created as Profile) ?? (row as Profile));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!supabase) {
      // Local mode: hit the local database API (data/db.json)
      setBusy(true);
      try {
        const res = await fetch('/api/auth/' + mode, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mode === 'register'
              ? {
                  name: form.name,
                  email: form.email,
                  password: form.password,
                  phone: form.phone,
                  role: form.role,
                  rewardsOptIn: form.role === 'customer' ? form.rewardsOptIn : undefined,
                }
              : { email: form.email, password: form.password },
          ),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error || 'Something went wrong.');
          return;
        }
        onAuth({
          id: j.user.id,
          name: j.user.name,
          role: j.user.role,
          phone: j.user.phone,
          email: j.user.email,
          rewardsOptIn: j.user.rewardsOptIn,
        });
      } catch {
        setError('Could not reach the local server.');
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        if (!form.name || !form.email || !form.password || !form.phone) {
          setError('Please fill in name, email, password and phone number.');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { name: form.name, role: form.role, phone: form.phone },
          },
        });
        if (error) throw error;
        if (!data.user) return;
        if (!data.session) {
          setNotice('Account created! Check your email to confirm, then log in.');
          setMode('login');
          return;
        }
        await ensureProfile(data.user.id, {
          name: form.name,
          role: form.role,
          phone: form.phone,
        });
      } else {
        if (!form.email || !form.password) {
          setError('Please enter email and password.');
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        if (data.user) {
          // Use the details saved at signup, so a missing profile row is
          // recreated with the right role instead of defaulting to customer.
          const meta = data.user.user_metadata || {};
          await ensureProfile(data.user.id, {
            name: meta.name,
            role: meta.role,
            phone: meta.phone,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'field mt-1';
  const modeLabel = { login: t('login'), register: t('register') } as const;

  return (
    <main className="min-h-screen bg-leaf-dark px-5 py-6 text-white sm:px-8">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <button onClick={onBack} className="flex items-center gap-2 font-display text-xl font-bold">
          <Recycle size={22} className="text-signal" />
          {t('kabad_saathi')}
        </button>
        <LanguageSwitcher />
      </nav>

      <div className="mx-auto max-w-md pt-12 sm:pt-16">
        <div className="card p-7 text-ink sm:p-8">
          <h1 className="font-display text-2xl font-bold">
            {mode === 'login' ? t('welcome_back') : t('create_account')}
          </h1>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            {mode === 'login' ? t('auth_login_sub') : t('auth_register_sub')}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-control bg-paper p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                  setNotice('');
                }}
                className={`flex items-center justify-center gap-1.5 rounded-[8px] py-2.5 text-sm font-bold transition ${
                  mode === m ? 'bg-leaf text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {m === 'login' && <LogIn size={15} />}
                {m === 'register' && <UserPlus size={15} />}
                {modeLabel[m]}
              </button>
            ))}
          </div>


          <form onSubmit={submit} className="mt-6 grid gap-4">
            {mode === 'register' && (
              <label className="font-semibold">
                {t('full_name')}
                <input
                  className={input}
                  placeholder="e.g. Ramesh Kumar"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            )}

            <label className="font-semibold">
              {t('email')}
              <input
                type="email"
                className={input}
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>

            <label className="font-semibold">
              {t('password')}
              <input
                type="password"
                className={input}
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>

            {mode === 'register' && (
              <>
              <label className="font-semibold">
                {t('phone')}
                <input
                  className={input}
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>

                <div>
                  <div className="font-semibold">{t('joining_as')}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(['customer', 'collector'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, role: r })}
                        className={`rounded-control border-2 py-3 font-bold ${
                          form.role === r
                            ? 'border-leaf bg-leaf text-white'
                            : 'border-line hover:border-line-strong'
                        }`}
                      >
                        {r === 'customer' ? t('customer') : t('collector')}
                      </button>
                    ))}
                  </div>
                </div>

                {form.role === 'customer' && (
                  <RewardsOptIn
                    checked={form.rewardsOptIn}
                    onChange={(v) => setForm({ ...form, rewardsOptIn: v })}
                  />
                )}
              </>
            )}

            {error && (
              <div className="rounded-control bg-rust-wash px-4 py-3 text-sm font-semibold text-rust">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-control bg-leaf-wash px-4 py-3 text-sm font-semibold text-leaf-dark">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary mt-2 w-full py-4 text-base"
            >
              {busy ? t('please_wait') : mode === 'login' ? t('log_in') : t('create_account_btn')}
            </button>
          </form>

          {!supabase && (
            <p className="mt-4 text-center text-xs text-ink-faint">
              Local mode — data is stored in the local database (data/db.json).
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
