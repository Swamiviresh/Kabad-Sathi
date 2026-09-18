'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import type { Item } from '../lib/rates';
import { useLanguage } from '../lib/LanguageContext';
import type { TranslationKey } from '../lib/i18n';

type BookingDraft = { items: Partial<Item>[]; date?: string; time?: string };
type Msg = { role: 'user' | 'assistant'; text: string };

export default function AIAssistant({
  userId,
  role,
  onBookingDraft,
}: {
  userId?: string;
  role?: 'customer' | 'collector';
  onBookingDraft?: (draft: BookingDraft) => void;
}) {
  const { t, lang, bcp47 } = useLanguage();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // send() is re-created on every render; the recogniser is created once, so it reads the
  // latest handler through a ref instead of capturing a stale closure.
  const sendRef = useRef<(text?: string) => void>(() => {});

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInput(text);
      sendRef.current(text);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  // Speech recognition follows the chosen UI language — a Kannada speaker who taps the
  // mic is transcribed as Kannada, not as accented English.
  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = bcp47;
  }, [bcp47]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    setListening(true);
    recognitionRef.current.start();
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setInput('');
    const nextMsgs: Msg[] = [...msgs, { role: 'user', text }];
    setMsgs(nextMsgs);
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
          ...(role ? { 'x-user-role': role } : {}),
        },
        body: JSON.stringify({ message: text, history: nextMsgs.slice(-10), lang }),
      });
      const data = await res.json();
      const reply: string = data.message || t('toast_server');
      setMsgs((m) => [...m, { role: 'assistant', text: reply }]);
      if (overrideText) speak(reply); // speak back only when the turn started with voice
      if (data.bookingDraft && onBookingDraft) onBookingDraft(data.bookingDraft);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: t('toast_server') }]);
    } finally {
      setBusy(false);
    }
  }
  sendRef.current = send;

  const suggestions: TranslationKey[] =
    role === 'collector'
      ? ['sugg_earnings', 'sugg_next', 'sugg_tips']
      : ['sugg_price', 'sugg_book', 'sugg_safe'];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-leaf text-white shadow-mid transition hover:bg-leaf-dark"
        title={t('ai_saathi')}
        aria-label={t('ai_saathi')}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div className="sheet-rise fixed bottom-24 right-4 z-40 flex h-[32rem] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-high sm:right-6">
          <div className="flex items-center gap-2.5 bg-leaf-dark px-4 py-3 text-white">
            <Bot size={20} className="text-signal" />
            <div>
              <div className="font-display font-bold leading-tight">{t('ai_saathi')}</div>
              <div className="text-xs text-white/70">{t('ai_sub')}</div>
            </div>
          </div>

          <div className="scroll-slim flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div>
                <p className="text-sm text-ink-soft">{t('ai_intro')}</p>
                <div className="mt-3 flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(t(s))}
                      className="rounded-control border border-line bg-paper px-3 py-2.5 text-left text-sm font-semibold hover:border-leaf hover:bg-leaf-wash"
                    >
                      {t(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-panel px-3.5 py-2.5 text-sm ${
                  m.role === 'user' ? 'ml-auto bg-leaf text-white' : 'bg-paper text-ink'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="w-fit rounded-panel bg-paper px-3.5 py-2.5 text-sm text-ink-faint">
                {t('ai_thinking')}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-line p-3">
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title={t('ai_speak')}
                aria-label={t('ai_speak')}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  listening ? 'bg-rust text-white' : 'bg-leaf-wash text-leaf-dark'
                }`}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <input
              className="field min-w-0 flex-1 py-2.5 text-sm"
              placeholder={listening ? t('ai_listening') : t('ai_placeholder')}
              aria-label={t('ai_placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf text-white disabled:opacity-40"
              title={t('ai_send')}
              aria-label={t('ai_send')}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
