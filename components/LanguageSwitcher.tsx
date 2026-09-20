'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';

/**
 * Three languages is too many for a toggle and too few for a <select> on a phone,
 * so this is a small popover showing each language written in its own script —
 * a user who can't read English still recognises ಕನ್ನಡ.
 */
export default function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className={`flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-bold transition ${
          tone === 'dark'
            ? 'bg-white/10 text-white hover:bg-white/20'
            : 'border border-line-strong bg-surface text-ink hover:bg-leaf-wash'
        }`}
      >
        <Languages size={15} />
        {active.label}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-panel border border-line bg-surface py-1 shadow-mid"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-semibold text-ink hover:bg-leaf-wash ${
                  l.code === lang ? 'bg-leaf-wash' : ''
                }`}
              >
                {l.label}
                {l.code === lang && <Check size={15} className="text-leaf" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
