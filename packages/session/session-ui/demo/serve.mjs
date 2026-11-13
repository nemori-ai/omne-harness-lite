// Development only, not published: bundles demo/main.tsx in memory and serves the demo page.
// `pnpm --filter @omne-harness/session-ui run demo`, then open the printed address.
import { context } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.PORT ?? 5180)

const build = await context({
  entryPoints: [`${here}main.tsx`],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  outdir: `${here}out`,
  write: false,
  conditions: ['source'],
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
})
const { hosts, port: bound } = await build.serve({ servedir: here, port, host: '127.0.0.1' })
console.log(`session-ui demo: http://${hosts[0] ?? '127.0.0.1'}:${bound}/`)
