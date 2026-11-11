/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        manrope: ['Manrope', 'sans-serif'],
      },
      colors: {
        forest: {
          50: '#edf3e9',
          100: '#eaf1e9',
          500: '#285f47',
          600: '#235c46',
          700: '#1c4934',
        }
      }
    },
  },
  plugins: [],
}
