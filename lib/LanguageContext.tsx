'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { LANGUAGES, Language, TranslationKey, translations } from './i18n';

type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  /** Translate a key. Falls back to English, then to the key itself. */
  t: (key: TranslationKey) => string;
  /** BCP-47 tag for the active language — used by speech recognition + <html lang>. */
  bcp47: string;
};

const STORAGE_KEY = 'ks-lang';

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translations.en[key] || key,
  bcp47: 'en-IN',
});

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'hi' || value === 'kn';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  // Restore the saved choice, else guess from the browser (Kannada phones default to ಕನ್ನಡ).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLanguage(saved)) {
        setLangState(saved);
        return;
      }
    } catch {}
    const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
    if (nav.startsWith('kn')) setLangState('kn');
    else if (nav.startsWith('hi')) setLangState('hi');
  }, []);

  // Keep <html lang> honest for screen readers and font selection.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[lang][key] || translations.en[key] || key,
    [lang],
  );

  const bcp47 = LANGUAGES.find((l) => l.code === lang)?.bcp47 || 'en-IN';

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, bcp47 }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
