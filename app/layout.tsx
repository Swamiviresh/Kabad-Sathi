import './globals.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata, Viewport } from 'next';
import { LanguageProvider } from '../lib/LanguageContext';

export const metadata: Metadata = {
  title: 'Kabad Saathi — doorstep scrap pickup',
  description:
    'Book a doorstep scrap pickup, get a fair ₹/kg rate, and connect informal waste collectors to formal recyclers. English, हिन्दी and ಕನ್ನಡ.',
};

export const viewport: Viewport = {
  themeColor: '#14543a',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Fonts are pulled at runtime via <link> rather than next/font so the project
 * still builds on a machine with no outbound network (CI, offline demo laptop).
 * Bricolage Grotesque carries the headlines; Manrope the UI; the two Noto Indic
 * faces make sure Hindi and Kannada render at the same optical weight.
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
