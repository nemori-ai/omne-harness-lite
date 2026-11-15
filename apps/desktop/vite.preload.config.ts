import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist/electron-host',
    emptyOutDir: false,
    target: 'node24',
    minify: false,
    lib: {
      entry: 'src/electron-host/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: { external: ['electron'] },
  },
})
