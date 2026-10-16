import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const dist = new URL('../dist/', import.meta.url)

function builtModules(): string[] {
  return readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter(file =>
    file.endsWith('.js'),
  )
}

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
  const cordis = (await import('@omne-harness/tool/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual([])
})

it('keeps the root entry graph free of Cordis and of the binding module', () => {
  const graph = reachable('index.js')
  expect(builtModules()).toEqual(expect.arrayContaining([...graph]))
  expect(graph.size).toBeGreaterThan(1)
  expect(graph.has('cordis.js')).toBe(false)
  for (const file of graph)
    expect(readFileSync(new URL(file, dist), 'utf8')).not.toContain('@deepseek-ai/cordis')
})

it('depends on no provider member and declares no Cordis dependency while the binding is a draft', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
  }
  const dependencies = Object.keys(manifest.dependencies ?? {})
  expect(dependencies).not.toContain('@omne-harness/tool-host-local')
  expect(dependencies).not.toContain('@deepseek-ai/cordis')
})
