import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const IMPORT_SPECIFIER =
  /(?:^|[\s;])(?:import|export)\s*(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Every module specifier that the built entry reaches, following relative imports. Declarations
 * keep the `.ts` extension of the source, so a relative specifier is mapped to the entry's suffix.
 */
function reach(entry: string): string[] {
  const suffix = entry.endsWith('.d.ts') ? '.d.ts' : '.js'
  const files: string[] = []
  const specifiers = new Set<string>()
  const pending = [resolve(dist, entry)]
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || files.includes(file)) continue
    files.push(file)
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2]
      if (specifier === undefined) continue
      if (specifier.startsWith('.'))
        pending.push(resolve(dirname(file), specifier.replace(/\.(js|ts)$/, suffix)))
      else specifiers.add(specifier)
    }
  }
  return [...specifiers].sort()
}

describe('public entries', () => {
  it('the root entry exports no value: the Cordis definition lives at ./cordis', async () => {
    const root = (await import('@omne-harness/telemetry-cordis-contract')) as Record<
      string,
      unknown
    >

    expect(Object.keys(root)).toEqual([])
    expect(reach('index.js')).toEqual([])
    expect(reach('index.d.ts')).toEqual([])
  })

  it('the cordis entry exports the service definition and its key', async () => {
    const cordis = await import('@omne-harness/telemetry-cordis-contract/cordis')

    expect(Object.keys(cordis).sort()).toEqual(['TelemetryService', 'telemetryKey'])
    expect(cordis.telemetryKey).toBe('telemetry')
    expect(cordis.TelemetryService.provide).toBe('telemetry')
  })

  it('the built cordis module reaches Cordis at run time and the pure contract in its declaration', () => {
    expect(reach('cordis.js')).toEqual(['@deepseek-ai/cordis'])
    expect(reach('cordis.d.ts')).toEqual([
      '@deepseek-ai/cordis',
      '@omne-harness/telemetry-contract',
    ])
  })
})
