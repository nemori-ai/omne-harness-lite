// C8: the member uses SQL only through the public shapes of sql-contract, has no `./cordis`
// entry, and reaches into nothing under packages/storage.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HANDLERS, sessionStorageMaterials } from '../src/materials.ts'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>
  dependencies: Record<string, string>
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : []
  })
}

describe('public entries', () => {
  it('exports the port factories, the binding source and the materials, and nothing else at the root', async () => {
    const root = (await import('@omne-harness/session-storage-sql')) as Record<string, unknown>
    expect(Object.keys(root).sort()).toEqual([
      'SESSION_PARTICIPANT',
      'createSessionPrincipalBindings',
      'createSessionStorage',
      'createSessionStoragePair',
      'sessionStorageMaterials',
    ])
  })

  it('has no ./cordis subpath: not declared and not importable', async () => {
    expect(Object.keys(packageJson.exports)).toEqual(['.', './participants'])
    const removed = '@omne-harness/session-storage-sql/cordis'
    await expect(import(/* @vite-ignore */ removed)).rejects.toThrow()
  })

  it('does not exist as a source file either', () => {
    expect(sources(join(root, 'src')).some(path => path.endsWith('cordis.ts'))).toBe(false)
  })

  it('imports sql-contract only by its public entries and nothing under packages/storage', () => {
    const imports = sources(join(root, 'src')).flatMap(path =>
      [...readFileSync(path, 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1] as string),
    )
    const sql = imports.filter(item => item.includes('sql-contract'))
    expect(sql.length).toBeGreaterThan(0)
    for (const item of sql)
      expect(['@omne-harness/sql-contract', '@omne-harness/sql-contract/worker']).toContain(item)
    expect(imports.filter(item => /storage\/|sqlite-provider|node:sqlite/.test(item))).toEqual([])
    expect(Object.keys(packageJson.dependencies)).not.toContain('@omne-harness/sqlite-provider')
  })
})

describe('materials', () => {
  const materials = sessionStorageMaterials()

  it('describes every read handler as a snapshot read (SQL r2 section 17)', () => {
    expect(materials.readHandlers.length).toBe(HANDLERS.length)
    for (const handler of materials.readHandlers) expect(handler.ordering).toBe('snapshot')
  })

  it('has a LIMIT on every SELECT that a handler or the participant runs', () => {
    for (const path of sources(join(root, 'src', 'worker'))) {
      const text = readFileSync(path, 'utf8')
      for (const select of [
        ...text.matchAll(/`(SELECT[^`]*)`/g),
        ...text.matchAll(/'(SELECT[^']*)'/g),
      ]) {
        const statement = select[1] as string
        if (/\bLIMIT\b/.test(statement)) continue
        // Aggregates without GROUP BY return one row.
        expect(statement, `${path}: ${statement}`).toMatch(/^SELECT (COALESCE\()?(MAX|COUNT)\(/)
      }
    }
  })
})
