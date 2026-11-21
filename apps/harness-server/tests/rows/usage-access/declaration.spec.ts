import { describe, expect, it } from 'vitest'
import { rowDeclarationOf } from '../../../src/row.ts'
import { usageAccessRow } from '../../../src/rows/usage-access/index.ts'
import { rowManifests } from '../../../src/s0/stubs.ts'

describe('the usage-access row', () => {
  it('is a real row that provides nothing and injects the registry and the issuer of principals', () => {
    const declared = rowDeclarationOf(usageAccessRow)
    expect(declared).toMatchObject({ row: 'usage-access', implementation: 'real' })
    expect(declared?.manifest).toMatchObject({
      provides: [],
      injects: ['accessRegistry', 'principalIssuer'],
      sameProviderGroup: null,
    })
    expect(rowManifests.get(declared!.row)?.injects).toEqual([
      's0.accessRegistry',
      's0.principalIssuer',
    ])
  })
})
