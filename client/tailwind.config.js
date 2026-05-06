/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary — Dark Teal #024A59
        primary: {
          50:  '#ecf5f7',
          100: '#cce3e9',
          200: '#99c8d3',
          300: '#66acbd',
          400: '#3391a7',
          500: '#024A59',
          600: '#023f4b',
          700: '#02323c',
          800: '#01262e',
          900: '#011920',
        },
        // Secondary — Amber #FFA916  (text on secondary bg: black or white)
        secondary: {
          50:  '#fff8eb',
          100: '#ffeec2',
          200: '#ffdc85',
          300: '#ffca48',
          400: '#ffbb1f',
          500: '#FFA916',
          600: '#e09000',
          700: '#c07a00',
          800: '#9a6200',
          900: '#7a4e00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
