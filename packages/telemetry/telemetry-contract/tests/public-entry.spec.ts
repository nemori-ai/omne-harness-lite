import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const member = fileURLToPath(new URL('../', import.meta.url))
const dist = join(member, 'dist/')
const IMPORT_SPECIFIER =
  /(?:^|[\s;])(?:import|export)\s*(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

type Manifest = Readonly<{
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}>

function manifestOf(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest
}

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

/** Production dependency routes from a workspace package to Cordis, through workspace packages. */
function routesToCordis(directory: string, route: readonly string[]): string[][] {
  return Object.entries(manifestOf(directory).dependencies ?? {}).flatMap(([name, range]) => {
    if (name === '@deepseek-ai/cordis') return [[...route, name]]
    if (!range.startsWith('workspace:') || route.includes(name)) return []
    return routesToCordis(realpathSync(join(directory, 'node_modules', name)), [...route, name])
  })
}

describe('public entries', () => {
  it('the root entry exports the pure contract values', async () => {
    const root = await import('@omne-harness/telemetry-contract')

    expect(Object.keys(root).sort()).toEqual([
      'DISCARD_REASONS',
      'TELEMETRY_LIMITS',
      'decodeCarrier',
      'defineEvent',
      'defineMetric',
      'defineSegment',
      'encodeCarrier',
      'isSegment',
      'validateBinding',
      'validateFields',
    ])
  })

  it('the testing entry exports the capturing double', async () => {
    const testing = await import('@omne-harness/telemetry-contract/testing')

    expect(Object.keys(testing)).toEqual(['createCapturingTelemetry'])
  })

  it('has the root and testing entries only: the Cordis definition is another member', () => {
    expect(Object.keys(manifestOf(member).exports ?? {})).toEqual(['.', './testing'])
  })

  it.each(['index', 'testing/index'])(
    'the built %s module reaches only legal-identity, never Cordis or a Node built-in',
    entry => {
      const runtime = reach(`${entry}.js`)
      const declarations = reach(`${entry}.d.ts`)

      expect(runtime.specifiers).toEqual(['@omne-harness/legal-identity'])
      expect(declarations.specifiers).toEqual(['@omne-harness/legal-identity'])
    },
  )
})

describe('the production install closure', () => {
  it('declares legal-identity and nothing else, and no Cordis in any dependency list', () => {
    const manifest = manifestOf(member)

    expect(manifest.dependencies).toEqual({ '@omne-harness/legal-identity': 'workspace:*' })
    expect(Object.keys(manifest.devDependencies ?? {})).not.toContain('@deepseek-ai/cordis')
  })

  it('has no route to Cordis through workspace packages', () => {
    expect(routesToCordis(member, [])).toEqual([])
  })
})
