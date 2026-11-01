// The four entries: their runtime exports, the package manifest, the Cordis-free root and worker,
// and the forbidden service names.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const src = join(packageRoot, 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

/** Every import specifier of a file, static or dynamic. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? '')
}

/** The relative closure of imports that starts at one entry file. */
function closure(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>()
  const external = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('.')) pending.push(resolve(dirname(file), specifier))
      else external.add(specifier)
    }
  }
  return { files, external }
}

describe('runtime exports of the entries', () => {
  it('the root exports the three pure functions and nothing else', async () => {
    const root = await import('@omne-harness/sql-contract')
    expect(Object.keys(root).sort()).toEqual([
      'combinationManifest',
      'inputDigestV2',
      'manifestDigest',
    ])
  })

  it('the worker entry exports no value', async () => {
    const worker = await import('@omne-harness/sql-contract/worker')
    expect(Object.keys(worker)).toEqual([])
  })

  it('the cordis entry exports the three services and their keys', async () => {
    const cordis = await import('@omne-harness/sql-contract/cordis')
    expect(Object.keys(cordis).sort()).toEqual([
      'StorageHostService',
      'StorageService',
      'TenantDomainsService',
      'storageHostKey',
      'storageKey',
      'tenantDomainsKey',
    ])
  })

  it('the testing entry exports the double and the suite', async () => {
    const testing = await import('@omne-harness/sql-contract/testing')
    expect(Object.keys(testing).sort()).toEqual([
      'createMemorySqlStorage',
      'runSqlStorageConformance',
    ])
  })
})

describe('the package manifest', () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>
    dependencies: Record<string, string>
  }

  it('declares exactly the four entries', () => {
    expect(Object.keys(manifest.exports)).toEqual(['.', './worker', './cordis', './testing'])
  })

  it('depends on Cordis only through the catalog and on no other member', () => {
    expect(manifest.dependencies).toEqual({ '@deepseek-ai/cordis': 'catalog:' })
  })
})

describe('Cordis-free entries (IC-4)', () => {
  it.each([
    ['root', 'index.ts'],
    ['worker', 'worker.ts'],
  ])('the %s entry reaches no Cordis module', (_name, entry) => {
    const { files, external } = closure(join(src, entry))
    expect([...external].filter(name => name.includes('cordis'))).toEqual([])
    expect([...files].filter(file => file.endsWith('cordis.ts'))).toEqual([])
  })

  it('the root reaches no module of the testing entry', () => {
    const { files } = closure(join(src, 'index.ts'))
    expect([...files].filter(file => file.includes('testing'))).toEqual([])
  })
})

describe('forbidden service names', () => {
  // Built from parts so that this file does not contain the names.
  const forbidden = [['sql', 'Storage'].join(''), ['Sql', 'Storage', 'Service'].join('')]

  it('no source file uses the forbidden key or definition name', () => {
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, 'utf8')
      for (const name of forbidden) {
        expect(text.includes(name), `${file} contains ${name}`).toBe(false)
      }
    }
  })

  it('the cordis entry has no export under a forbidden name', async () => {
    const cordis = await import('@omne-harness/sql-contract/cordis')
    for (const name of forbidden) expect(name in cordis).toBe(false)
  })
})
