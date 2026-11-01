// The member exports the two factories, the materials and their names at its root, has no
// `./cordis` entry, and uses SQL only through the public entries of sql-contract: it imports
// nothing of a provider, of node:sqlite or of another storage member.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
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
  it('exports the factories, the materials and their constants, and nothing else at the root', async () => {
    const entry = (await import('@omne-harness/tool-storage-sql')) as Record<string, unknown>
    expect(Object.keys(entry).sort()).toEqual([
      'CHUNK_ENVELOPE_BYTES',
      'TOOL_PARTICIPANT',
      'TOOL_STORAGE_OWNER',
      'createSqlToolLedgerStore',
      'createSqlToolOutputCustody',
      'toolStorageMaterials',
    ])
  })

  it('has no ./cordis subpath', () => {
    expect(Object.keys(packageJson.exports)).toEqual(['.'])
    expect(sources(join(root, 'src')).some(path => path.endsWith('cordis.ts'))).toBe(false)
  })

  it('imports sql-contract only by its public entries, and no provider or database', () => {
    const imports = sources(join(root, 'src')).flatMap(path =>
      [...readFileSync(path, 'utf8').matchAll(/from '([^']+)'/gu)].map(match => match[1] ?? ''),
    )
    const sql = imports.filter(item => item.includes('sql-contract'))
    expect(sql.length).toBeGreaterThan(0)
    for (const item of sql)
      expect(['@omne-harness/sql-contract', '@omne-harness/sql-contract/worker']).toContain(item)
    expect(imports.filter(item => /sqlite|storage\/|session|cordis/u.test(item))).toEqual([])
    expect(Object.keys(packageJson.dependencies)).not.toContain('@omne-harness/sqlite-provider')
  })

  it('puts a LIMIT on every SELECT of the Worker modules that is not a single-row aggregate', () => {
    for (const path of sources(join(root, 'src', 'worker'))) {
      const text = readFileSync(path, 'utf8')
      for (const select of [
        ...text.matchAll(/`(SELECT[^`]*)`/gu),
        ...text.matchAll(/'(SELECT[^']*)'/gu),
      ]) {
        const statement = select[1] ?? ''
        if (/\bLIMIT\b/u.test(statement)) continue
        expect(statement, `${path}: ${statement}`).toMatch(/^SELECT (COALESCE\()?(MAX|COUNT)\(/u)
      }
    }
  })
})
