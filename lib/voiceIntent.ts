import { WASTE_TYPES } from './rates';

export type VoiceIntent =
  | 'BOOK_PICKUP'
  | 'CHECK_PICKUP_STATUS'
  | 'CANCEL_PICKUP'
  | 'CHECK_SCRAP_PRICE'
  | 'CHECK_EARNINGS'
  | 'UNKNOWN';

export type VoiceEntities = {
  scrapTypes: string[]; // canonical values from WASTE_TYPES
  date: 'today' | 'tomorrow' | 'day_after' | null;
  time: 'Morning' | 'Afternoon' | 'Evening' | 'Night' | null;
};

export type ParsedVoiceCommand = {
  intent: VoiceIntent;
  entities: VoiceEntities;
  transcript: string;
};

// Keeping this to the 5 intents in scope keeps matching reliable — resist the urge to add
// open-ended intents until these are solid.
const INTENT_KEYWORDS: Record<Exclude<VoiceIntent, 'UNKNOWN'>, string[]> = {
  BOOK_PICKUP: [
    'book', 'schedule', 'pickup', 'pick up', 'bula', 'bulao', 'lene', 'lene aao', 'lena hai',
    'request', 'chahiye',
  ],
  CHECK_PICKUP_STATUS: [
    'where is', 'kaha hai', 'kahan hai', 'status', 'track', 'kab aayega', 'kab aaega',
  ],
  CANCEL_PICKUP: ['cancel', 'radd', 'rad karo', 'hata do', 'nahi chahiye'],
  CHECK_SCRAP_PRICE: ['price', 'rate', 'daam', 'kimat', 'bhaav', 'kitna milega', 'kitne ka'],
  CHECK_EARNINGS: ['earn', 'earning', 'kamai', 'kamaya', 'income', 'paisa kitna'],
};

// Hindi/Hinglish synonyms → canonical WASTE_TYPES entries (from lib/rates.ts)
const SCRAP_SYNONYMS: Record<string, string> = {
  paper: 'Paper', kagaz: 'Paper', kaagaz: 'Paper',
  cardboard: 'Cardboard', gatta: 'Cardboard', gatte: 'Cardboard',
  plastic: 'Plastic',
  metal: 'Metal', iron: 'Metal', loha: 'Metal', dhatu: 'Metal', steel: 'Metal',
  aluminium: 'Aluminium', aluminum: 'Aluminium', 'alumin um': 'Aluminium',
  copper: 'Copper', tamba: 'Copper', taamba: 'Copper',
  glass: 'Glass', kaanch: 'Glass', kanch: 'Glass',
  'e-waste': 'E-waste', ewaste: 'E-waste', electronic: 'E-waste', electronics: 'E-waste',
};

function scoreIntent(text: string): VoiceIntent {
  let best: VoiceIntent = 'UNKNOWN';
  let bestScore = 0;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [
    Exclude<VoiceIntent, 'UNKNOWN'>,
    string[],
  ][]) {
    const score = keywords.filter((k) => text.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return best;
}

function extractScrapTypes(text: string): string[] {
  const found = new Set<string>();
  for (const [syn, canonical] of Object.entries(SCRAP_SYNONYMS)) {
    if (text.includes(syn) && (WASTE_TYPES as string[]).includes(canonical)) found.add(canonical);
  }
  return Array.from(found);
}

function extractDate(text: string): VoiceEntities['date'] {
  if (/\b(parso|day after)\b/.test(text)) return 'day_after';
  if (/\b(kal|tomorrow)\b/.test(text)) return 'tomorrow';
  if (/\b(aaj|today)\b/.test(text)) return 'today';
  return null;
}

function extractTime(text: string): VoiceEntities['time'] {
  if (/\b(subah|savere|morning)\b/.test(text)) return 'Morning';
  if (/\b(dopahar|afternoon)\b/.test(text)) return 'Afternoon';
  if (/\b(shaam|sham|evening)\b/.test(text)) return 'Evening';
  if (/\b(raat|night)\b/.test(text)) return 'Night';
  return null;
}

export function parseVoiceCommand(rawText: string): ParsedVoiceCommand {
  const text = rawText.toLowerCase().trim();
  return {
    intent: scoreIntent(text),
    entities: {
      scrapTypes: extractScrapTypes(text),
      date: extractDate(text),
      time: extractTime(text),
    },
    transcript: rawText,
  };
}

export function dateFromRelative(rel: VoiceEntities['date']): string {
  const d = new Date();
  if (rel === 'tomorrow') d.setDate(d.getDate() + 1);
  if (rel === 'day_after') d.setDate(d.getDate() + 2);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
