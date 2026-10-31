import { defineConfig } from 'vite'

// GitHub Pages serves the page under /fpv-laptimer-firmware/, so every path
// is relative ("./firmware/manifest.json").
export default defineConfig({
  base: './',
  server: { host: true },
})
