/** @type {import('tailwindcss').Config} */
// Tailwind's configuration for the real Vite build (this file is unrelated
// to the separate, no-build live-preview artifact environment — it only
// affects `npm run dev` / `npm run build` in this downloaded project).
export default {
  // content: every file Tailwind scans for class names in order to decide
  // which utility classes to actually generate CSS for. Anything not
  // matched by one of these globs (index.html, plus every .js/.jsx file
  // under src/) would get its Tailwind classes silently dropped from the
  // final CSS bundle.
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // extend: {} is intentionally empty — this project deliberately sticks
    // to Tailwind's stock default color palette, spacing scale, and font
    // sizes throughout (see the comments in src/App.jsx's color-related
    // classes for why), so there's nothing to add here.
    extend: {},
  },
  plugins: [], // no additional Tailwind plugins in use
};
