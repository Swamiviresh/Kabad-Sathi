'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, ExternalLink, Factory, MapPin, Recycle, ShieldCheck } from 'lucide-react';
import { WASTE_TYPES, RATES } from '../../lib/rates';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { RECYCLERS } from '../../data/recyclers';

export default function RecycleMarketplace() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(
    () => (activeCategory ? RECYCLERS.filter((r) => r.categories.includes(activeCategory)) : RECYCLERS),
    [activeCategory],
  );

  return (
    <main className="min-h-screen">
      <header className="bg-leaf-dark px-5 py-3 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-display font-bold">
            <ArrowLeft size={18} /> Kabad Saathi
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="bg-leaf-dark px-5 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold">
            <Banknote size={16} /> Instant cash for sorted scrap
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(2rem,5vw,3.2rem)] font-bold">
            Sell sorted scrap straight to recyclers — no middleman markdown.
          </h1>
          <p className="mt-4 max-w-2xl text-green-50/90">
            Formal recyclers across India buy paper, plastic, metal, glass and e-waste in bulk at
            fair, transparent rates. Kabadiwalas and aggregators using Kabad Saathi can browse who's
            buying, what they pay for, and how to reach them — turning a day's collection into same-day
            or scheduled cash.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              activeCategory === null ? 'bg-green-700 text-white' : 'border border-gray-200 bg-white text-gray-600'
            }`}
          >
            All categories
          </button>
          {WASTE_TYPES.filter((t) => t !== 'Other').map((t) => (
            <button
              key={t}
              onClick={() => setActiveCategory(t)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                activeCategory === t ? 'bg-green-700 text-white' : 'border border-gray-200 bg-white text-gray-600'
              }`}
            >
              {t} · ₹{RATES[t]}/kg
            </button>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-green-950">{r.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin size={14} /> {r.city}, {r.state}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
                  <Factory size={19} />
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-600">{r.description}</p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {r.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800"
                  >
                    {c}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-green-700" />
                {r.scale}
              </div>

              <p className="mt-3 text-sm font-semibold text-green-800">{r.payoutNote}</p>

              <a
                href={r.website}
                target="_blank"
                rel="noreferrer"
                className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-green-700 py-3 font-black text-white"
              >
                Get instant cash — contact {r.name}
                <ExternalLink size={16} />
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-gray-400">
          Directory curated from public company information · not a live feed · verify current rates
          and pickup terms directly with each recycler before a bulk sale.
        </p>
      </section>
    </main>
  );
}
