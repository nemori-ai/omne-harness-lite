import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export interface FlowBundle {
  readonly script: string
  readonly style: string
}

export interface PageAssets {
  readonly flow: FlowBundle
  readonly elk: string
}

export const PAGE_ASSETS_FILE = 'page-assets.json'

let cached: PageAssets | undefined

export function pageAssets(): PageAssets {
  if (cached !== undefined) return cached
  const prebuilt = fileURLToPath(new URL(PAGE_ASSETS_FILE, import.meta.url))
  cached = existsSync(prebuilt)
    ? (JSON.parse(readFileSync(prebuilt, 'utf8')) as PageAssets)
    : buildPageAssets()
  return cached
}

export function architectureFlowBundle(): FlowBundle {
  return pageAssets().flow
}

export function buildPageAssets(): PageAssets {
  const require = createRequire(import.meta.url)
  const { buildSync, transformSync } = require('esbuild') as typeof import('esbuild')
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
  const style = transformSync(
    readFileSync(require.resolve('@xyflow/react/dist/style.css'), 'utf8'),
    { loader: 'css', minify: true },
  ).code
  const source = readFileSync(require.resolve('elkjs/lib/elk.bundled.js'), 'utf8')
  const notices = [
    ...new Set(
      (source.match(/\/\*[\s\S]*?\*\//gu) ?? []).filter(text => text.includes('Copyright')),
    ),
  ]
  const code = transformSync(source, { minify: true, legalComments: 'none', target: 'es2020' }).code
  return { flow: { script, style }, elk: `${notices.join('\n')}\n${code}` }
}
