'use client';

import { Gift } from 'lucide-react';
import { WELCOME_BONUS_POINTS } from '../lib/rewards';
import { useLanguage } from '../lib/LanguageContext';

/**
 * Shown only when the person is registering as a customer — collectors earn through the
 * Earnings dashboard, not Green Points. Pre-checked by design: joining costs nothing, and
 * leaving the box visible and honest (rather than hiding the opt-out) is what keeps this
 * from being a dark pattern.
 */
export default function RewardsOptIn({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useLanguage();

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-leaf-wash bg-[rgba(231,242,234,0.6)] p-3.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-leaf"
      />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-leaf-dark">
          <Gift size={15} /> {t('opt_in_title')}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{t('opt_in_body')}</span>
        <span className="mt-1 block text-xs font-semibold text-leaf-dark">
          {t('opt_in_bonus').replace('{n}', String(WELCOME_BONUS_POINTS))}
        </span>
      </span>
    </label>
  );
}
