import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--paper-raised)',
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)',
        },
        leaf: {
          DEFAULT: 'var(--leaf)',
          dark: 'var(--leaf-dark)',
          wash: 'var(--leaf-wash)',
        },
        signal: {
          DEFAULT: 'var(--signal)',
          ink: 'var(--signal-ink)',
        },
        rust: {
          DEFAULT: 'var(--rust)',
          wash: 'var(--rust-wash)',
        },
        route: {
          DEFAULT: 'var(--route)',
          wash: 'var(--route-wash)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        card: 'var(--radius-lg)',
        panel: 'var(--radius)',
        control: 'var(--radius-sm)',
      },
      boxShadow: {
        low: 'var(--shadow-low)',
        mid: 'var(--shadow-mid)',
        high: 'var(--shadow-high)',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
} satisfies Config;
