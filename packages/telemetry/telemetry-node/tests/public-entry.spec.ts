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
function reach(entry: string): { files: string[]; specifiers: string[] } {
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
  return { files: files.map(file => file.slice(dist.length)), specifiers: [...specifiers].sort() }
}

describe('public entries', () => {
  it('the root entry exports the runtime and the disabled implementation', async () => {
    const root = await import('@omne-harness/telemetry-node')

    expect(Object.keys(root).sort()).toEqual([
      'createDisabledTelemetry',
      'createTelemetryRuntime',
      'summarizeTelemetry',
    ])
  })

  it('the cordis entry exports the two plugin factories and the log bridge', async () => {
    const cordis = await import('@omne-harness/telemetry-node/cordis')

    expect(Object.keys(cordis).sort()).toEqual([
      'createCordisLogBridge',
      'createDisabledTelemetryPlugin',
      'createTelemetryNodePlugin',
    ])
  })

  it('the built root module never reaches Cordis', () => {
    for (const entry of ['index.js', 'index.d.ts']) {
      const { files, specifiers } = reach(entry)

      expect(specifiers.filter(specifier => specifier.includes('cordis'))).toEqual([])
      expect(files.filter(file => file.startsWith('cordis'))).toEqual([])
    }
  })

  it('the built cordis module reaches Cordis and the telemetry service definition', () => {
    expect(reach('cordis.js').specifiers).toEqual(
      expect.arrayContaining([
        '@deepseek-ai/cordis',
        '@omne-harness/telemetry-cordis-contract/cordis',
      ]),
    )
  })
})
