/**
 * Curated directory of real, verifiable Indian recycling companies/programmes that buy
 * sorted scrap in bulk. This is static seed data (compiled from public company info as of
 * 2026) — it is NOT a live web-scrape. This sandbox has no outbound network access to run
 * a scraper or call a paid data API at request time, so we ship a small, accurate,
 * hand-checked directory instead of fabricating one.
 *
 * To make this live: swap `getRecyclers()` below for a fetch to a partner API (Recykal's
 * B2B marketplace, a state pollution-control-board vendor list, IndiaMART's API, etc.) or
 * a scheduled scraper job that writes into `data/recyclers.json`. The UI (app/recycle/page.tsx)
 * doesn't need to change.
 */

export type Recycler = {
  id: string;
  name: string;
  categories: string[]; // subset of WASTE_TYPES this buyer wants
  city: string;
  state: string;
  description: string;
  website: string;
  scale: string; // one credibility stat
  payoutNote: string; // how the instant-cash / bulk-sale process works
};

export const RECYCLERS: Recycler[] = [
  {
    id: 'recykal',
    name: 'Recykal',
    categories: ['Paper', 'Cardboard', 'Plastic', 'Metal', 'Aluminium', 'Copper', 'Glass', 'E-waste', 'Other'],
    city: 'Hyderabad',
    state: 'Telangana',
    description:
      "India's first w-commerce (waste-commerce) platform — a B2B digital marketplace connecting waste generators, aggregators, kabadiwalas and recyclers with transparent pricing and traceability.",
    website: 'https://recykal.com',
    scale: '400,000+ users, 1,000+ businesses and 100+ recyclers on the platform across 25+ states',
    payoutNote: 'List sorted scrap on the marketplace; verified recyclers bid and arrange bulk pickup with digital payment.',
  },
  {
    id: 'attero',
    name: 'Attero Recycling',
    categories: ['E-waste', 'Metal', 'Copper'],
    city: 'Noida / Roorkee',
    state: 'Uttar Pradesh / Uttarakhand',
    description:
      "One of India's largest electronic-asset management companies — recovers metals from e-waste and lithium-ion batteries with certified, environmentally compliant processing.",
    website: 'https://attero.in',
    scale: 'MoEF environmental clearance; recovers metals at up to 99% efficiency from battery scrap',
    payoutNote: 'Bulk e-waste and battery scrap collection with authorised recycler pricing — good for higher-value electronic and metal loads.',
  },
  {
    id: 'banyan-nation',
    name: 'Banyan Nation',
    categories: ['Plastic'],
    city: 'Hyderabad',
    state: 'Telangana',
    description:
      'Vertically integrated plastic recycler turning collected plastic scrap into food-grade-quality recycled HDPE/PP granules used by major FMCG and auto brands.',
    website: 'https://banyannation.com',
    scale: '500+ tonnes of plastic recycled, 750+ tonnes CO₂ emissions avoided',
    payoutNote: 'Aggregators and collectors can supply sorted plastic scrap into their collection network for a per-kg rate above informal market price.',
  },
  {
    id: 'saahas',
    name: 'Saahas Zero Waste',
    categories: ['Paper', 'Cardboard', 'Plastic', 'Glass', 'E-waste', 'Other'],
    city: 'Bengaluru',
    state: 'Karnataka',
    description:
      'Social enterprise with 20+ years in dry-waste management — runs material recovery facilities that sort and channel recyclables (incl. glass and textile) to registered recyclers.',
    website: 'https://www.saahaszerowaste.com',
    scale: 'One of the earliest formal dry-waste MRF operators in India, multi-category intake',
    payoutNote: 'Sell sorted mixed dry waste by the batch; MRF weighs and pays per category on drop-off or scheduled pickup.',
  },
  {
    id: 'itc-wow',
    name: 'ITC WOW (Wellbeing Out of Waste)',
    categories: ['Paper', 'Cardboard', 'Plastic', 'Metal', 'Glass'],
    city: 'Multi-city',
    state: 'Telangana, Karnataka, Tamil Nadu, Delhi NCR & more',
    description:
      "ITC's flagship source-segregation and dry-waste-recovery programme — collects recyclables fortnightly, bales them, and supplies paper/plastic/metal/glass industries directly.",
    website: 'https://www.itcportal.com/about-itc/sustainability/circularity.html',
    scale: 'Reaches 1.5+ crore citizens and sustains livelihoods for 16,900+ waste collectors nationwide',
    payoutNote: 'Waste collectors registered with local WOW drives get scheduled pickup and per-kg payment on accurate weighing.',
  },
];

export function getRecyclers(): Recycler[] {
  return RECYCLERS;
}

export function recyclersForCategory(category: string): Recycler[] {
  return RECYCLERS.filter((r) => r.categories.includes(category));
}
