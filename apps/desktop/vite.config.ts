import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { adaptScreenshotsCss, SCREENSHOTS_CSS } from './scripts/screenshots-css.ts'

let builds = 0
const THEME_BOOT_SOURCES = [
  new URL('./src/page/theme-boot.ts', import.meta.url),
  new URL('./src/shared/visual-record.ts', import.meta.url),
]

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
      // Read afresh on every build, so a watched build carries the kernel the page was just built with.
      name: 'omne-theme-boot',
      buildStart() {
        for (const file of THEME_BOOT_SOURCES) this.addWatchFile(fileURLToPath(file))
      },
      async generateBundle() {
        const [boot, record] = await Promise.all(
          THEME_BOOT_SOURCES.map(file => import(`${file.href}?build=${++builds}`)),
        )
        const source = boot.themeBootScript({
          create: record.createVisualRecordKernel,
          defaults: record.VISUAL_DEFAULTS,
        })
        this.emitFile({ type: 'asset', fileName: 'theme-boot.js', source })
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
