/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#1DAA58',
          blue: '#2484C6',
        },
        secondary: {
          teal: '#00669B',
          cyan: '#008DA5',
          navy: '#193661',
        },
        neutral: {
          dark: '#1B1D21',
          grey: '#B1B7C3',
          light: '#DCDEE4',
        }
      }
    }
  },
  plugins: [],
}
