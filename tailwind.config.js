/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        asphalt: "#0D0D10",
        panel: "#17171C",
        chalk: "#F5F3EE",
        lane: "#F4B740",
        hazard: "#E85D28",
        steel: "#93A1B0",
        signal: "#4C8BF5",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        body: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
