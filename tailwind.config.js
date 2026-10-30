/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        strava: { orange: '#FC4C02' },
        endurain: {
          darkPrimary: '#5EADEB',
          darkSecondary: '#7EC8E3',
          darkBg: '#121212',
          darkSurface: '#1E1E1E',
          lightPrimary: '#1976D2',
          lightSecondary: '#0288D1',
          lightBg: '#FFFFFF',
          lightSurface: '#F5F5F5',
        }
      }
    },
  },
  plugins: [],
}