import { defineConfig, presetIcons, presetUno } from "unocss";

export default defineConfig({
  shortcuts: {
    "glass-panel":
      "bg-white/10 dark:bg-black/20 backdrop-filter backdrop-blur-xl border border-white/10 shadow-xl transition-all duration-300",
    "btn-primary":
      "px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all duration-200 cursor-pointer",
    "btn-ghost":
      "px-4 py-2 rounded-lg bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200 cursor-pointer",
    "card":
      "rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 shadow-sm",
    "input-field":
      "w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all",
  },
  safelist: [
    "i-heroicons-home",
    "i-heroicons-document-text",
    "i-heroicons-folder",
    "i-heroicons-cog-6-tooth",
    "i-heroicons-arrow-path",
    "i-heroicons-plus",
    "i-heroicons-trash",
    "i-heroicons-pencil-square",
    "i-heroicons-eye",
    "i-heroicons-clipboard-document",
    "i-heroicons-arrow-down-tray",
    "i-heroicons-check-circle",
    "i-heroicons-exclamation-triangle",
    "i-heroicons-x-mark",
    "i-heroicons-arrow-right",
    "i-heroicons-arrow-left",
    "i-heroicons-magnifying-glass",
    "i-heroicons-cloud-arrow-down",
    "i-heroicons-cloud-arrow-up",
    "i-heroicons-shield-check",
    "i-heroicons-bolt",
    "i-heroicons-server",
    "i-heroicons-chart-bar",
    "i-heroicons-clock",
    "i-heroicons-sparkles",
  ],
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
  theme: {
    colors: {
      brand: {
        primary: "#2563eb",
        secondary: "#7c3aed",
        accent: "#06b6d4",
      },
    },
  },
});
