// The `session-provider` row declares what `src/s0/stubs.ts` gives the same row, as a contract
// double without a shutdown phase.
import { describe, expect, it } from 'vitest'
import { serveProfile } from '../../../src/profile.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { sessionProviderRow } from '../../../src/rows/session-provider/index.ts'
import type { RowId } from '../../../src/types.ts'

const sorted = (names: readonly string[]): string[] => [...names].sort()

describe('session-provider row: declaration', () => {
  const declaration = rowDeclarationOf(sessionProviderRow)

  it('is a declared row with the id and the implementation kind of the assembly page', () => {
    expect(declaration).toMatchObject({
      row: 'session-provider',
      implementation: 'contract-double',
    })
  })

  it('provides and injects what the table row gives, and has no shutdown phase', () => {
    const table = serveProfile().stubManifests.get('session-provider' as RowId)
    expect(table).toBeDefined()
    if (declaration === undefined || table === undefined) throw new Error('unreachable')
    expect(sorted(declaration.manifest.provides)).toEqual(sorted(table.provides))
    expect(sorted(declaration.manifest.injects)).toEqual(sorted(table.injects))
    expect(declaration.manifest.sameProviderGroup).toBe(table.sameProviderGroup)
    expect(declaration.manifest.phase).toBeNull()
    expect(declaration.lifecycle).toEqual({ kind: 'none' })
    expect(sorted(declaration.manifest.provides)).toEqual(['session'])
    expect(sorted(declaration.manifest.injects)).toEqual([
      'sessionAccessCheck',
      'sessionDelegatedTransactions',
      'sessionPrincipals',
      'sessionWorkPrincipals',
    ])
  })
})
