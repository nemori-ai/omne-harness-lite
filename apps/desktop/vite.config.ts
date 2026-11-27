import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { adaptScreenshotsCss, SCREENSHOTS_CSS } from './scripts/screenshots-css.ts'
import { themeBootScript } from './src/page/theme-boot.ts'

export default defineConfig({
  root: 'src/page',
  base: '/',
  plugins: [
    {
      name: 'react-screenshots-css',
      enforce: 'pre',
      transform: (code, id) =>
        SCREENSHOTS_CSS.test(id.split('?')[0]!) ? adaptScreenshotsCss(code) : null,
    },
    {
      name: 'omne-theme-boot',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'theme-boot.js', source: themeBootScript() })
      },
    },
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: '../../dist/release/page',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    // The app's page, the overlay a screenshot is picked on (src/main/screen-overlay.ts) and the desk layer (src/main/desk-window.ts).
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./src/page/index.html', import.meta.url)),
        shot: fileURLToPath(new URL('./src/page/shot.html', import.meta.url)),
        desk: fileURLToPath(new URL('./src/page/desk.html', import.meta.url)),
      },
    },
  },
})
