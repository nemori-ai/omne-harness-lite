// Construction of the memory double checks static materials only, as the provider factory does
// (SPEC 4.1, 4.2): a wrong digest, an unreadable file and an invalid declared combination reject.
import { describe, expect, it } from 'vitest'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { createMemorySqlStorage } from '@omne-harness/sql-contract/testing'
import { useFixture } from './helpers.ts'

const fx = useFixture()

function catalogWith(
  change: (catalog: SqlMaterialCatalog) => SqlMaterialCatalog,
): SqlMaterialCatalog {
  return change(fx.fixture().materials)
}

describe('construction', () => {
  it('accepts the fixture materials', async () => {
    await expect(
      createMemorySqlStorage({ materials: fx.fixture().materials }),
    ).resolves.toBeDefined()
  })

  it.each([
    [
      'participant',
      (c: SqlMaterialCatalog) => ({
        ...c,
        participants: c.participants.map((p, i) =>
          i === 0 ? { ...p, codeDigest: 'e'.repeat(64) } : p,
        ),
      }),
    ],
    [
      'migration',
      (c: SqlMaterialCatalog) => ({
        ...c,
        migrations: c.migrations.map((m, i) => (i === 0 ? { ...m, checksum: 'e'.repeat(64) } : m)),
      }),
    ],
    [
      'handler',
      (c: SqlMaterialCatalog) => ({
        ...c,
        readHandlers: c.readHandlers.map((h, i) =>
          i === 0 ? { ...h, codeDigest: 'e'.repeat(64) } : h,
        ),
      }),
    ],
  ])('rejects a %s whose module bytes do not match the digest', async (_name, change) => {
    await expect(createMemorySqlStorage({ materials: catalogWith(change) })).rejects.toThrow(
      /material_digest_mismatch/,
    )
  })

  it('rejects a module file that cannot be read', async () => {
    const materials = catalogWith(c => ({
      ...c,
      participants: c.participants.map((p, i) =>
        i === 0 ? { ...p, moduleUrl: 'file:///nowhere/x.mjs' } : p,
      ),
    }))
    await expect(createMemorySqlStorage({ materials })).rejects.toThrow(/material_unreadable/)
  })

  it('rejects a module URL that is not a file URL', async () => {
    const materials = catalogWith(c => ({
      ...c,
      participants: c.participants.map((p, i) =>
        i === 0 ? { ...p, moduleUrl: 'https://example.com/x.mjs' } : p,
      ),
    }))
    await expect(createMemorySqlStorage({ materials })).rejects.toThrow(/material_unreadable/)
  })

  it('rejects a declared combination that is not valid', async () => {
    const materials = catalogWith(c => ({
      ...c,
      declaredCombinations: {
        tenant: { combinationVersion: 'bad', participants: ['needy'] },
        system: null,
      },
    }))
    await expect(createMemorySqlStorage({ materials })).rejects.toThrow(
      /declared_combination_invalid/,
    )
  })
})
