/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Medical brand – Dr. Faraj Lashika (navy & gold)
          ink: '#0F1A33',
          navy: '#142347',
          navy2: '#1E2F58',
          gold: '#9A7634',
          goldDark: '#7E5F27',
          goldLight: '#C9A866',
          sand: '#D9C9A3',
          cream: '#F7F3EA',
          red: '#C0283A',
          // Dar City club accent (used only for club-specific touches)
          clubOrange: '#F4511E',
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
