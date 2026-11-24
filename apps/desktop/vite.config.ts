import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/page',
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/release/page',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    // The app's page and the overlay a screenshot is picked on (src/main/window.ts).
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./src/page/index.html', import.meta.url)),
        shot: fileURLToPath(new URL('./src/page/shot.html', import.meta.url)),
      },
    },
  },
})
