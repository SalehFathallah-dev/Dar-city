/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Medical brand – Dr. Saleh Fathullah (navy & sky blue from the logo)
          ink: '#0C1438',
          navy: '#182A5C',
          navy2: '#22397A',
          gold: '#1E7FC2',
          goldDark: '#17649C',
          goldLight: '#4DB6E6',
          sand: '#BFDDF2',
          cream: '#F2F6FB',
          red: '#C0283A',
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
