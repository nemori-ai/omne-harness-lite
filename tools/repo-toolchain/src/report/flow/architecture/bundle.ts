import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export interface FlowBundle {
  /** Self-contained IIFE: React, @xyflow/react and both islands. It sets `window.ArchitectureFlow` and `window.StructureFlow`. */
  readonly script: string
  /** @xyflow/react's own stylesheet, minified here because the package ships no minified CSS. The island's styling lives in `style.ts`. */
  readonly style: string
}

/** Everything a page inlines from third-party code: the flow island and elkjs. */
export interface PageAssets {
  readonly flow: FlowBundle
  /** elk.bundled.js, minified, with its copyright notices kept at the top. */
  readonly elk: string
}

/** Written next to the built module by `prebuild.ts`; the published package ships it instead of its UI dependencies. */
export const PAGE_ASSETS_FILE = 'page-assets.json'

let cached: PageAssets | undefined

/**
 * The prebuilt assets when the build wrote them, otherwise bundle now. React 19 ships no browser
 * build, so the page cannot inline it like elkjs; esbuild resolves it from node_modules and the
 * result is inlined. Bundling works from `src/` (the .tsx entry) and from `dist/` (the tsc output).
 */
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

/** Bundle and minify with esbuild. Only the build and source checkouts need esbuild and the UI packages. */
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
  // elkjs ships no minified elk.bundled.js (only elk-worker.min.js). Its copyright notices are plain
  // comments that minification drops, so take the blocks that mention Copyright and put them back first.
  const source = readFileSync(require.resolve('elkjs/lib/elk.bundled.js'), 'utf8')
  const notices = [
    ...new Set(
      (source.match(/\/\*[\s\S]*?\*\//gu) ?? []).filter(text => text.includes('Copyright')),
    ),
  ]
  const code = transformSync(source, { minify: true, legalComments: 'none', target: 'es2020' }).code
  return { flow: { script, style }, elk: `${notices.join('\n')}\n${code}` }
}
