// Builds the page into dist/page. The web host serves it; see README.md.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/page',
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../../dist/page',
    emptyOutDir: true,
    // One script and one stylesheet, served from the same origin: the content security policy
    // allows nothing else.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
})
