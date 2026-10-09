import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'

export interface FlowBundle {
  /** Self-contained IIFE: React, @xyflow/react and both islands. It sets `window.ArchitectureFlow` and `window.StructureFlow`. */
  readonly script: string
  /** @xyflow/react's own stylesheet. The island's styling lives in `style.ts`. */
  readonly style: string
}

let cached: FlowBundle | undefined

/**
 * Bundle the island at page-generation time. React 19 ships no browser build, so the page cannot
 * inline it like elkjs; esbuild resolves it from node_modules here and the result is inlined.
 * Works from `src/` (the .tsx entry) and from `dist/` (the tsc output).
 */
export function architectureFlowBundle(): FlowBundle {
  if (cached !== undefined) return cached
  const entry = ['./main.tsx', './main.js']
    .map(name => fileURLToPath(new URL(name, import.meta.url)))
    .find(path => existsSync(path))
  if (entry === undefined) throw new Error('Missing architecture flow entry')
  const result = buildSync({
    entryPoints: [entry],
    outfile: 'architecture-flow.js',
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
  if (script === undefined) throw new Error('Architecture flow bundle produced no script')
  const style = readFileSync(
    createRequire(import.meta.url).resolve('@xyflow/react/dist/style.css'),
    'utf8',
  )
  cached = { script, style }
  return cached
}
