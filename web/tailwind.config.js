/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef3ff',
          100: '#dbe6ff',
          200: '#bdd1ff',
          300: '#90b0ff',
          400: '#5c86fb',
          500: '#3475f7',
          600: '#1f56ec',
          700: '#1741d9',
          800: '#1937b0',
          900: '#1a338c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
