/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'var(--color-gold)',
          2: 'var(--color-gold-2)',
          accent: 'var(--color-accent-gold)',
          light: 'var(--color-light-gold)',
          soft: 'var(--color-light-gold-2)',
        },
        'ink-green': {
          DEFAULT: 'var(--color-ink-green)',
          2: 'var(--color-ink-green-2)',
        },
        void: {
          DEFAULT: 'var(--color-void)',
          pure: 'var(--color-void-pure)',
        },
        panel: {
          DEFAULT: 'var(--color-panel)',
          2: 'var(--color-panel-2)',
        },
        card: 'var(--color-card)',
        text: {
          DEFAULT: 'var(--color-text)',
          2: 'var(--color-text-2)',
        },
        muted: 'var(--color-muted)',
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        line: 'var(--color-line)',
      },
      fontFamily: {
        sans: ['Qomra', 'Segoe UI', 'Tahoma', 'Noto Sans Arabic', 'Arial', 'sans-serif'],
        qomra: ['Qomra', 'Segoe UI', 'Tahoma', 'Noto Sans Arabic', 'Arial', 'sans-serif'],
        qamra: ['Qomra', 'Segoe UI', 'Tahoma', 'Noto Sans Arabic', 'Arial', 'sans-serif'],
        numeric: ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '700',
        bold: '700',
        black: '900',
      },
      borderColor: {
        line: 'var(--color-line)',
      },
      boxShadow: {
        gold: '0 0 0 1px var(--color-line), 0 8px 24px rgba(1, 12, 10, 0.55)',
        glow: '0 0 20px rgba(193, 165, 118, 0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        shimmer: 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [],
}
