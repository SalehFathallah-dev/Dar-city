/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#171717',
          charcoal: '#242424',
          charcoal2: '#2E2E2E',
          orange: '#F4511E',
          orangeDark: '#D9420F',
          red: '#D91E36',
          beige: '#D8CCAE',
          beigeLight: '#F3EFE4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(23,23,23,.06), 0 4px 16px rgba(23,23,23,.05)' },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fadeIn .25s ease-out both' },
    },
  },
  plugins: [],
};
