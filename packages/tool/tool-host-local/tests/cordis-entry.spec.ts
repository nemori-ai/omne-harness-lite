import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const dist = new URL('../dist/', import.meta.url)

/** Follows relative imports from one built module and returns every module that it reaches. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(new URL(file, dist), 'utf8')
    for (const match of source.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gu)) {
      const target = new URL(match[1] as string, new URL(file, dist))
      pending.push(target.href.slice(dist.href.length))
    }
  }
  return seen
}

it('draft cordis entry exports nothing until the accepted binding replaces it', async () => {
  const cordis = (await import('@omne-harness/tool-host-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual([])
})

it('keeps the root entry graph free of Cordis and of the binding module', () => {
  const graph = reachable('index.js')
  const built = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  expect(built).toEqual(expect.arrayContaining(['index.js', 'cordis.js']))
  expect(graph.has('cordis.js')).toBe(false)
  for (const file of graph)
    expect(readFileSync(new URL(file, dist), 'utf8')).not.toContain('@deepseek-ai/cordis')
})

it('consumes the contract member through the workspace package', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
  }
  expect(manifest.dependencies).toMatchObject({ '@omne-harness/tool': 'workspace:*' })
})
