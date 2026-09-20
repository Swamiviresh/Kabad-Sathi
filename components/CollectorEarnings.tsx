'use client';

import { useEffect, useState } from 'react';
import { IndianRupee, Package, Recycle, Star, Trophy } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

type Stats = {
  totalPickups: number;
  totalKg: number;
  totalEarnings: number;
  rating: number | null;
  ratingCount: number;
  bestCategory: string | null;
};

export default function CollectorEarnings({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats | null>(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/collector/earnings', { headers: { 'x-user-id': userId } })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setError(j.error);
          return;
        }
        setStats(j.stats);
        setMonth(j.month);
      })
      .catch(() => setError('Could not load earnings.'));
  }, [userId]);

  if (error) return null;
  if (!stats) {
    return <div className="skeleton h-40" />;
  }

  const tonnes = stats.totalKg >= 1000 ? `${(stats.totalKg / 1000).toFixed(1)} T` : `${stats.totalKg} kg`;

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">{t('earnings_dashboard')}</h2>
        <span className="text-sm font-semibold text-ink-soft">{month}</span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<Package size={20} />} label={t('total_pickups')} value={String(stats.totalPickups)} />
        <StatCard icon={<Recycle size={20} />} label={t('total_scrap')} value={tonnes} />
        <StatCard
          icon={<IndianRupee size={20} />}
          label={t('total_earnings')}
          value={`₹${stats.totalEarnings.toLocaleString('en-IN')}`}
        />
        <StatCard
          icon={<Star size={20} />}
          label={t('rating')}
          value={stats.rating != null ? `${stats.rating} / 5` : '—'}
        />
        <StatCard
          icon={<Trophy size={20} />}
          label={t('best_category')}
          value={stats.bestCategory || '—'}
        />
      </div>
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inset p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <span className="text-leaf">{icon}</span>
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
