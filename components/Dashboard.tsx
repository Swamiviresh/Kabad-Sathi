'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gift,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Plus,
  Recycle,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { RATES, WASTE_TYPES, Item, lineTotal, calcTotal, totalKg, summaryType } from '../lib/rates';
import type { Profile } from './Auth';
import AIAssistant from './AIAssistant';

import CollectorEarnings from './CollectorEarnings';
import LanguageSwitcher from './LanguageSwitcher';
import RewardsTeaser from './RewardsTeaser';
import { pickupPoints } from '../lib/rewards';
import { useLanguage } from '../lib/LanguageContext';
import { STATUS_KEYS } from '../lib/i18n';

const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="skeleton h-72" />,
});

type Req = {
  id: string;
  customer_id?: string;
  waste_type: string;
  quantity: string;
  items?: Item[];
  total_amount?: number;
  address?: string;
  pickup_date: string;
  pickup_time: string;
  latitude: number;
  longitude: number;
  status: string;
  collector_id?: string;
  rejected_by?: string[];
  collector_confirmed_complete?: boolean;
  customer_confirmed_complete?: boolean;
  notes?: string;
  accepted_at?: string;
  completed_at?: string;
  /** Other side's public contact info — only present on accepted orders. */
  counterparty?: {
    id: string;
    name: string;
    role: 'customer' | 'collector';
    phone?: string;
    email?: string;
  };
};

type ImpactStats = { totalPickups: number; totalKg: number; totalAmount: number };

export default function Dashboard({
  role,
  user,
  onBack,
  onSignOut,
}: {
  role: 'customer' | 'collector';
  user: Profile;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLanguage();

  const [reqs, setReqs] = useState<Req[]>([]);
  const [items, setItems] = useState<Item[]>([{ type: 'Paper', kg: 0 }]);
  const [form, setForm] = useState({ date: '', time: '', notes: '', address: '' });
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const [impact, setImpact] = useState<ImpactStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** Bumped whenever a pickup completes, so the rewards panel re-fetches the balance. */
  const [rewardsKey, setRewardsKey] = useState(0);

  const notify = (x: string) => {
    setToast(x);
    setTimeout(() => setToast(''), 3000);
  };

  const localHeaders = {
    'Content-Type': 'application/json',
    'x-user-id': user.id,
    'x-user-role': user.role,
  };

  // ── data loading (local mode: role-scoped API; supabase mode: realtime) ──
  // Polled every few seconds so a new order appears on every collector's dashboard
  // and both sides see accept/on-the-way/complete transitions without a refresh.
  const loadRequests = useCallback(async () => {
    if (supabase) {
      const { data } = await supabase
        .from('pickup_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setReqs(data as Req[]);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch('/api/requests', { headers: localHeaders });
      const j = await res.json();
      setReqs(j.requests || []);
    } catch {}
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.role]);

  const loadImpact = useCallback(async () => {
    if (supabase || role !== 'customer') return;
    try {
      const res = await fetch('/api/customer/stats', { headers: localHeaders });
      const j = await res.json();
      if (j.stats) setImpact(j.stats);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, role]);

  useEffect(() => {
    if (!supabase) {
      loadRequests();
      loadImpact();
      // Local mode has no realtime channel — poll instead so a new order shows up on
      // every collector's dashboard and status changes reach the other side live.
      const id = setInterval(() => {
        loadRequests();
        loadImpact();
      }, 4000);
      return () => clearInterval(id);
    }
    const client = supabase;
    client
      .from('pickup_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setReqs(data as Req[]);
        setLoaded(true);
      });
    const ch = client
      .channel('pickup-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_requests' }, (p) => {
        const n = p.new as Req;
        if (p.eventType === 'INSERT') setReqs((x) => (x.some((r) => r.id === n.id) ? x : [n, ...x]));
        if (p.eventType === 'UPDATE')
          setReqs((x) => x.map((r) => (r.id === n.id ? { ...r, ...n } : r)));
        if (p.eventType === 'DELETE') setReqs((x) => x.filter((r) => r.id !== (p.old as any).id));
      })
      .subscribe();
    return () => {
      client.removeChannel(ch);
    };
  }, [loadRequests, loadImpact]);

  useEffect(() => {
    if (role !== 'customer') return;
    const now = new Date();
    setForm((current) => ({
      ...current,
      date: current.date || formatDate(now),
      time: current.time || formatTime(now),
    }));
    fetchCurrentLocation({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // ── multi-item helpers ──────────────────────────────────────────
  const setItem = (index: number, patch: Partial<Item>) =>
    setItems((x) => x.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const addItem = () => setItems((x) => [...x, { type: 'Paper', kg: 0 }]);
  const removeItem = (index: number) =>
    setItems((x) => (x.length > 1 ? x.filter((_, i) => i !== index) : x));

  const validItems = items.filter((i) => i.kg > 0);
  const grandTotal = calcTotal(validItems);
  const earnablePoints = pickupPoints(validItems);

  function formatDate(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatTime(date: Date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  async function reverseGeocode(latitude: number, longitude: number) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.display_name || '';
  }

  async function geocodeAddress(address: string) {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q: address });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!res.ok) throw new Error(t('toast_enter_address'));
    const data = await res.json();
    const match = data[0];
    if (!match) throw new Error(t('toast_enter_address'));
    return {
      address: match.display_name || address,
      position: [Number(match.lat), Number(match.lon)] as [number, number],
    };
  }

  async function fetchCurrentLocation(options: { silent?: boolean } = {}) {
    if (!navigator.geolocation) {
      if (!options.silent) notify(t('toast_location_failed'));
      return;
    }

    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const nextPos: [number, number] = [coords.latitude, coords.longitude];
        setPos(nextPos);
        try {
          const address = await reverseGeocode(coords.latitude, coords.longitude);
          if (address) setForm((current) => ({ ...current, address }));
        } catch {
          // Coordinates alone are enough to create the pickup.
        } finally {
          setLocationBusy(false);
        }
        if (!options.silent) notify(t('toast_location_pinned'));
      },
      () => {
        setLocationBusy(false);
        if (!options.silent) notify(t('toast_location_failed'));
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }

  /**
   * Called when the user moves the pin themselves (tap or drag on the map).
   * Keeps the address field truthful to wherever the pin actually is —
   * without this, someone could drag the pin and book a pickup at an
   * address that no longer matches the map.
   */
  async function handleMapPick(next: [number, number]) {
    setPos(next);
    setPinBusy(true);
    try {
      const address = await reverseGeocode(next[0], next[1]);
      if (address) setForm((current) => ({ ...current, address }));
    } catch {
      // Coordinates alone are enough to create the pickup even if this fails.
    } finally {
      setPinBusy(false);
    }
  }

  async function searchAddress() {
    const address = form.address.trim();
    if (!address) {
      notify(t('toast_enter_address'));
      return;
    }
    setAddressBusy(true);
    try {
      const result = await geocodeAddress(address);
      setPos(result.position);
      setForm((current) => ({ ...current, address: result.address }));
      notify(t('toast_address_pinned'));
    } catch (err: any) {
      notify(err.message || t('toast_enter_address'));
    } finally {
      setAddressBusy(false);
    }
  }

  async function create() {
    if (!validItems.length || !pos) {
      notify(t('toast_need_items'));
      return;
    }
    const row = {
      waste_type: summaryType(validItems),
      quantity: `${totalKg(validItems)} kg`,
      items: validItems,
      total_amount: grandTotal,
      pickup_date: form.date || 'Today',
      pickup_time: form.time || 'Flexible',
      latitude: pos[0],
      longitude: pos[1],
      address: form.address,
      notes: form.notes,
      status: 'PENDING',
      customer_id: user.id,
      rejected_by: [],
      collector_confirmed_complete: false,
      customer_confirmed_complete: false,
    };

    setBooking(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('pickup_requests')
          .insert(row)
          .select()
          .single();
        if (error) {
          notify(error.message);
          return;
        }
        setReqs((x) => (x.some((r) => r.id === (data as any).id) ? x : [data as Req, ...x]));
      } else {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: localHeaders,
          body: JSON.stringify(row),
        });
        const j = await res.json();
        if (!res.ok) {
          notify(j.error || t('toast_server'));
          return;
        }
        setReqs((x) => (x.some((r) => r.id === j.request.id) ? x : [j.request as Req, ...x]));
      }
    } catch {
      notify(t('toast_server'));
      return;
    } finally {
      setBooking(false);
    }

    // Reset the form — the order is now broadcast to every collector's dashboard.
    setItems([{ type: 'Paper', kg: 0 }]);
    const now = new Date();
    setForm({ date: formatDate(now), time: formatTime(now), notes: '', address: '' });
    setPos(null);
    notify(t('toast_request_sent'));
  }

  /**
   * Lifecycle actions (local mode). Server is the source of truth:
   *   accept | reject | cancel | on_the_way | collector_complete | customer_complete
   */
  async function act(id: string, action: string) {
    if (supabase) return actSupabase(id, action);
    const r = reqs.find((x) => x.id === id);
    if (!r) return;

    try {
      const res = await fetch('/api/requests/' + id, {
        method: 'PATCH',
        headers: localHeaders,
        body: JSON.stringify({ action }),
      });
      const j = await res.json();

      if (!res.ok) {
        notify(j.error || t('toast_server'));
        if (j.refresh) await loadRequests();
        return;
      }

      if (action === 'customer_complete') {
        setReqs((x) => x.filter((q) => q.id !== id));
        notify(t('toast_completed'));
        loadImpact();
        setRewardsKey((k) => k + 1); // points land the moment the order closes
        return;
      }
      if (action === 'reject') {
        setReqs((x) => x.filter((q) => q.id !== id));
        notify(t('toast_rejected'));
        return;
      }
      if (action === 'cancel') {
        setReqs((x) => x.map((q) => (q.id === id ? { ...q, status: 'CANCELLED' } : q)));
        notify(t('toast_cancelled'));
        return;
      }
      if (j.request) {
        setReqs((x) => x.map((q) => (q.id === id ? { ...q, ...j.request } : q)));
        if (action === 'accept') notify(t('toast_accepted'));
        if (action === 'on_the_way') notify(t('toast_on_the_way'));
        if (action === 'collector_complete') notify(t('toast_collected'));
      }
    } catch {
      notify(t('toast_server'));
    }
  }

  /** Supabase-mode lifecycle (direct table updates; dual-confirm via flags). */
  async function actSupabase(id: string, action: string) {
    const patch: any = {};
    if (action === 'accept') {
      patch.status = 'ACCEPTED';
      patch.collector_id = user.id;
      patch.accepted_at = new Date().toISOString();
    } else if (action === 'on_the_way') {
      patch.status = 'ON_THE_WAY';
    } else if (action === 'collector_complete') {
      patch.collector_confirmed_complete = true;
    } else if (action === 'customer_complete') {
      patch.customer_confirmed_complete = true;
    }
    const { error } = await supabase!.from('pickup_requests').update(patch).eq('id', id);
    if (error) {
      notify(error.message);
      return;
    }
    setReqs((x) => x.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function applyVoiceDraft(draft: { items: Partial<Item>[]; date?: string; time?: string }) {
    if (draft.items.length) {
      setItems(draft.items.map((it) => ({ type: (it.type as string) || 'Paper', kg: it.kg || 0 })));
    }
    if (draft.date || draft.time) {
      setForm((current) => ({
        ...current,
        date: draft.date || current.date,
        time: draft.time || current.time,
      }));
    }
  }

  const firstName = (user.name || 'Saathi').split(' ')[0];

  // ── role-scoped slices ──────────────────────────────────────────
  const myRequests = reqs.filter((r) => r.customer_id === user.id && r.status !== 'CANCELLED');
  const currentPickup = reqs.find(
    (r) => r.collector_id === user.id && ['ACCEPTED', 'ON_THE_WAY'].includes(r.status),
  );
  const awaitingCustomer = reqs.find(
    (r) =>
      r.collector_id === user.id && r.collector_confirmed_complete && !r.customer_confirmed_complete,
  );
  const availableRequests = reqs.filter(
    (r) => r.status === 'PENDING' && !(r.rejected_by || []).includes(user.id),
  );

  const itemBreakdown = (r: Req) => (
    <div className="inset mt-3 p-3 text-sm">
      {(r.items && r.items.length ? r.items : [{ type: r.waste_type, kg: 0 }]).map((it, i) => (
        <div key={i} className="flex justify-between py-0.5">
          <span>
            {it.type} · {it.kg} kg
            {RATES[it.type] != null && it.kg > 0 && (
              <span className="text-ink-faint"> × ₹{RATES[it.type]}/kg</span>
            )}
          </span>
          <b className="tabular-nums">₹{lineTotal(it)}</b>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-2 font-bold">
        <span>{t('total')}</span>
        <span className="tabular-nums text-leaf">₹{r.total_amount ?? 0}</span>
      </div>
    </div>
  );  const statusBadge = (status: string) => {
    const cls =
      status === 'COMPLETED'
        ? 'pill-ok'
        : status === 'ON_THE_WAY' || status === 'ACCEPTED'
          ? 'pill-go'
          : 'pill-wait';
    const key = STATUS_KEYS[status];
    return <span className={`pill ${cls}`}>{key ? t(key) : status.replace(/_/g, ' ')}</span>;
  };

  /** Contact card for the other party once a real collector has accepted the order. */
  const contactCard = (r: Req) => {
    if (!r.counterparty) return null;
    const isCollector = r.counterparty.role === 'collector';
    return (
      <div className="mt-3 rounded-panel bg-leaf-wash p-3">
        <div className="text-sm font-bold text-leaf-dark">
          {isCollector ? t('your_kabadiwala') : t('customer_contact')}
        </div>
        <div className="mt-0.5 font-bold">{r.counterparty.name}</div>
        {r.counterparty.phone ? (
          <a
            href={`tel:${r.counterparty.phone}`}
            className="mt-1 inline-block text-sm font-semibold tabular-nums text-leaf hover:underline"
          >
            {r.counterparty.phone}
          </a>
        ) : (
          <p className="mt-1 text-xs text-ink-faint">{t('no_phone')}</p>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-leaf-dark bg-leaf-dark px-5 py-3 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-2 font-display font-bold">
            <ArrowLeft size={18} /> {t('kabad_saathi')}
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-white/70 lg:block">
              {role === 'customer' ? t('customer') : t('collector')} · {t('dashboard')}
            </span>
            <LanguageSwitcher />
            {role === 'customer' && (
              <Link
                href="/rewards"
                className="flex items-center gap-1.5 rounded-control bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20"
                title={t('view_rewards')}
              >
                <Gift size={15} />
                <span className="hidden sm:inline">{t('view_rewards')}</span>
              </Link>
            )}
            <Link
              href="/recycle"
              className="flex items-center gap-1.5 rounded-control bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20"
              title={t('marketplace')}
            >
              <Recycle size={15} />
              <span className="hidden sm:inline">{t('marketplace')}</span>
            </Link>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-control bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20"
              title={t('sign_out')}
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">{t('sign_out')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-5 md:p-8">
        {toast && (
          <div
            role="status"
            className="sheet-rise fixed inset-x-4 top-20 z-50 rounded-panel bg-ink px-5 py-3.5 text-sm font-semibold text-white shadow-high sm:inset-x-auto sm:right-6 sm:max-w-sm"
          >
            {toast}
          </div>
        )}

        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-semibold text-leaf">
              {t('namaste')} {firstName} 👋
            </p>
            <h1 className="mt-1 font-display text-[clamp(1.8rem,4vw,2.5rem)] font-bold">
              {role === 'customer' ? t('request_pickup') : t('new_requests')}
            </h1>
          </div>
          {role === 'customer' && (
            <div className="text-right">
              <div className="font-display text-3xl font-bold tabular-nums">
                {impact?.totalKg ?? 0} kg
              </div>
              <div className="text-sm text-ink-soft">{t('impact_so_far')}</div>
            </div>
          )}
        </div>

        {role === 'collector' && (
          <div className="mb-6">
            <CollectorEarnings userId={user.id} />
          </div>
        )}

        {role === 'customer' ? (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {/* ── waste details ── */}
            <section className="card p-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Package size={20} className="text-leaf" /> {t('waste_details')}
              </h2>

              <div className="mt-5 grid gap-3">
                {items.map((it, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <select
                      className="field w-2/5"
                      aria-label={t('waste_details')}
                      value={it.type}
                      onChange={(e) => setItem(i, { type: e.target.value })}
                    >
                      {WASTE_TYPES.map((wt) => (
                        <option key={wt} value={wt}>
                          {wt} (₹{RATES[wt]}/kg)
                        </option>
                      ))}
                    </select>
                    <div className="relative w-2/5">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="field pr-9 text-right tabular-nums"
                        placeholder={t('quantity')}
                        aria-label={t('quantity')}
                        value={it.kg || ''}
                        onChange={(e) =>
                          setItem(i, { kg: Math.max(0, parseFloat(e.target.value) || 0) })
                        }
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">
                        kg
                      </span>
                    </div>
                    <div className="flex w-1/5 items-center justify-between gap-1 pt-3">
                      <b className="text-sm tabular-nums">₹{lineTotal(it)}</b>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        disabled={items.length <= 1}
                        className="text-ink-faint hover:text-rust disabled:opacity-30"
                        title={t('remove_item')}
                        aria-label={t('remove_item')}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center justify-center gap-2 rounded-control border-2 border-dashed border-line-strong py-3 font-bold text-ink-soft hover:border-leaf hover:text-leaf"
                >
                  <Plus size={17} /> {t('add_item')}
                </button>


              </div>

              <div className="mt-4 rounded-control bg-leaf-wash px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {t('total')} · {totalKg(validItems)} kg
                  </span>
                  <span className="font-display text-2xl font-bold tabular-nums text-leaf-dark">
                    ₹{grandTotal}
                  </span>
                </div>
                {/* Showing the points before booking is the whole point of the reward:
                    it changes what people put in the pile, not just how they feel after. */}
                {earnablePoints > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-[rgba(31,122,77,0.3)] pt-2 text-sm font-semibold text-leaf-dark">
                    <Gift size={15} />
                    {t('you_earn')} {earnablePoints} {t('points_for_pickup')}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="pickup-date">
                    {t('date')}
                  </label>
                  <input
                    id="pickup-date"
                    type="date"
                    className="field"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="pickup-time">
                    {t('time')}
                  </label>
                  <input
                    id="pickup-time"
                    type="time"
                    className="field"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="pickup-notes">
                  {t('notes')}
                </label>
                <textarea
                  id="pickup-notes"
                  rows={2}
                  className="field"
                  placeholder={t('notes_ph')}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </section>

            <div className="space-y-6">
              {/* ── location + book ── */}
              <section className="card p-6">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                  <MapPin size={20} className="text-leaf" /> {t('pickup_location')}
                </h2>
                <p className="mt-2 max-w-prose text-sm text-ink-soft">{t('location_help')}</p>

                <div className="mb-4 mt-4 grid gap-2.5">
                  <div>
                    <label className="label" htmlFor="pickup-address">
                      {t('exact_address')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="pickup-address"
                        className="field min-w-0 flex-1"
                        placeholder={t('address_ph')}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            searchAddress();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={searchAddress}
                        disabled={addressBusy}
                        className="btn-primary shrink-0 px-4"
                        title={t('search_address')}
                        aria-label={t('search_address')}
                      >
                        <Search size={18} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchCurrentLocation()}
                    disabled={locationBusy}
                    className="btn-ghost w-full"
                  >
                    <LocateFixed size={17} />
                    {locationBusy ? t('fetching_location') : t('use_current_location')}
                  </button>
                </div>

                <MapPicker position={pos} setPosition={handleMapPick} />
                {pos && (
                  <p className="mt-2 text-xs tabular-nums text-ink-faint">
                    {pinBusy ? t('updating_address') : `${t('selected')}: ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`}
                  </p>
                )}

                <button
                  onClick={create}
                  disabled={booking}
                  className="btn-primary mt-5 w-full py-4 text-base"
                >
                  {booking ? t('please_wait') : `${t('book_pickup_now')} · ₹${grandTotal}`}
                </button>
              </section>

              {/* ── my requests ── */}
              <section className="card p-6">
                <h2 className="font-display text-xl font-bold">{t('my_requests')}</h2>
                <div className="mt-4 space-y-4">
                  {!loaded && <div className="skeleton h-24" />}
                  {loaded && myRequests.length === 0 && (
                    <p className="text-sm text-ink-soft">{t('no_requests')}</p>
                  )}
                  {myRequests.map((r) => (
                    <div
                      key={r.id}
                      className="panel p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <b className="font-display text-lg">{r.waste_type}</b>
                        {statusBadge(r.status)}
                      </div>
                      <p className="text-sm text-ink-soft">
                        {r.quantity} · {r.pickup_date} {r.pickup_time}
                      </p>

                      {itemBreakdown(r)}

                      {/* Collector's contact details, once one accepts the order */}
                      {contactCard(r)}

                      {r.collector_confirmed_complete && !r.customer_confirmed_complete && (
                        <div className="mt-3 rounded-panel bg-route-wash p-3">
                          <p className="text-sm font-semibold text-route">
                            {t('collector_marked_done')}
                          </p>
                          <button
                            onClick={() => act(r.id, 'customer_complete')}
                            className="btn-primary mt-2.5 w-full py-2.5 text-sm"
                          >
                            <CheckCircle2 size={16} /> {t('confirm_complete')}
                          </button>
                        </div>
                      )}


                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* ── collector view ── */
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <section className="card p-6">
                <h2 className="font-display text-xl font-bold">{t('current_pickup')}</h2>
                {!currentPickup && !awaitingCustomer && (
                  <p className="mt-2 text-sm text-ink-soft">{t('no_active_pickup')}</p>
                )}

                {currentPickup && (
                  <div className="mt-4 rounded-panel border-2 border-leaf p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl font-bold">{currentPickup.waste_type}</h3>
                      {statusBadge(currentPickup.status)}
                    </div>

                    {itemBreakdown(currentPickup)}

                    <div className="my-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="inset flex items-center gap-2 p-3">
                        <Clock size={16} className="shrink-0 text-ink-soft" />
                        {currentPickup.pickup_date} · {currentPickup.pickup_time}
                      </div>
                      <div className="inset flex items-center gap-2 p-3 tabular-nums">
                        <MapPin size={16} className="shrink-0 text-ink-soft" />
                        {currentPickup.latitude.toFixed(4)}, {currentPickup.longitude.toFixed(4)}
                      </div>
                    </div>

                    {currentPickup.address && (
                      <p className="inset mb-4 flex gap-2 p-3 text-sm">
                        <MapPin size={16} className="mt-0.5 shrink-0 text-leaf" />
                        {currentPickup.address}
                      </p>
                    )}
                    {currentPickup.notes && (
                      <p className="mb-4 rounded-panel bg-rust-wash p-3 text-sm text-rust">
                        {currentPickup.notes}
                      </p>
                    )}

                    {contactCard(currentPickup)}

                    <div className="mt-4">
                      <MapPicker
                        position={[currentPickup.latitude, currentPickup.longitude]}
                        setPosition={() => {}}
                      />
                    </div>

                    <div className="mt-4">
                      {currentPickup.status === 'ACCEPTED' && (
                        <button
                          onClick={() => act(currentPickup.id, 'on_the_way')}
                          className="btn-primary w-full py-4 text-base"
                        >
                          <Navigation size={18} /> {t('on_the_way')}
                        </button>
                      )}
                      {currentPickup.status === 'ON_THE_WAY' &&
                        !currentPickup.collector_confirmed_complete && (
                          <button
                            onClick={() => act(currentPickup.id, 'collector_complete')}
                            className="btn-primary w-full py-4 text-base"
                          >
                            <CheckCircle2 size={18} /> {t('mark_collected')}
                          </button>
                        )}
                      {currentPickup.collector_confirmed_complete && (
                        <p className="rounded-panel bg-route-wash p-3 text-center text-sm font-semibold text-route">
                          {t('waiting_customer')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {!currentPickup && awaitingCustomer && (
                  <div className="mt-4 rounded-panel border-2 border-leaf p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl font-bold">
                        {awaitingCustomer.waste_type}
                      </h3>
                      {statusBadge('ON_THE_WAY')}
                    </div>
                    {itemBreakdown(awaitingCustomer)}
                    {contactCard(awaitingCustomer)}
                    <p className="mt-3 rounded-panel bg-route-wash p-3 text-center text-sm font-semibold text-route">
                      {t('waiting_customer')}
                    </p>
                  </div>
                )}
              </section>

              <section className="card p-4">
                <div className="p-2">
                  <h2 className="font-display text-xl font-bold">{t('requests_near_you')}</h2>
                  <p className="mt-1 max-w-prose text-sm text-ink-soft">
                    {t('requests_near_you_sub')}
                  </p>
                </div>
                <div className="h-96">
                  <MapPicker
                    position={
                      availableRequests[0]
                        ? [availableRequests[0].latitude, availableRequests[0].longitude]
                        : null
                    }
                    setPosition={() => {}}
                  />
                </div>
              </section>
            </div>

            <section className="space-y-4">
              {!loaded && <div className="skeleton h-40" />}
              {loaded && availableRequests.length === 0 && (
                <div className="card p-6 text-sm text-ink-soft">{t('no_new_requests')}</div>
              )}
              {availableRequests.map((r) => (
                <div className="card p-5" key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="pill pill-wait">{t('new_pickup_request')}</span>
                      <h3 className="mt-2 font-display text-xl font-bold">{r.waste_type}</h3>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{r.quantity}</div>
                      <div className="font-display text-2xl font-bold tabular-nums text-leaf">
                        ₹{r.total_amount ?? 0}
                      </div>
                    </div>
                  </div>

                  {itemBreakdown(r)}

                  <div className="my-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="inset flex items-center gap-2 p-3">
                      <Clock size={16} className="shrink-0 text-ink-soft" />
                      {r.pickup_date} · {r.pickup_time}
                    </div>
                    <div className="inset flex items-center gap-2 p-3 tabular-nums">
                      <MapPin size={16} className="shrink-0 text-ink-soft" />
                      {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                    </div>
                  </div>

                  {r.address && (
                    <p className="inset mb-4 flex gap-2 p-3 text-sm">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-leaf" />
                      {r.address}
                    </p>
                  )}
                  {r.notes && (
                    <p className="mb-4 rounded-panel bg-rust-wash p-3 text-sm text-rust">
                      {r.notes}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => act(r.id, 'accept')} className="btn-primary py-4">
                      {t('accept')}
                    </button>
                    <button onClick={() => act(r.id, 'reject')} className="btn-ghost py-4">
                      {t('reject')}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {role === 'customer' && (
          <div className="mt-8">
            <RewardsTeaser userId={user.id} refreshKey={rewardsKey} onToast={notify} />
          </div>
        )}

        {role === 'customer' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <div className="text-sm text-ink-soft">{t('completed_pickups')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums">
                {impact?.totalPickups ?? 0}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-sm text-ink-soft">{t('scrap_value')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-leaf">
                ₹{impact?.totalAmount ?? 0}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-sm text-ink-soft">{t('impact')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums">
                {impact?.totalKg ?? 0} kg
              </div>
            </div>
          </div>
        )}
      </div>

      <AIAssistant
        userId={user.id}
        role={role}
        onBookingDraft={role === 'customer' ? applyVoiceDraft : undefined}
      />
    </main>
  );
}
