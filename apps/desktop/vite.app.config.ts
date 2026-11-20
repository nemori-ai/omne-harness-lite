import { defineConfig } from 'vite'

// The packaged app's two Node-side entries, each with everything it imports bundled in, so the
// package carries no node_modules. `dist/app` keeps the layout of `dist`: main/, utility/, page/.
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/app',
    emptyOutDir: false,
    sourcemap: false,
    rolldownOptions: {
      input: { 'main/main': 'src/main/main.ts', 'utility/entry': 'src/utility/entry.ts' },
      external: ['electron'],
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  ssr: { noExternal: true },
})
