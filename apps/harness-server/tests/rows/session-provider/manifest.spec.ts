// The `session-provider` export of `./cordis` is the real Session provider (`real.ts`): the release
// names the plugin `sessionProviderRow`, so the swap from the contract double to the real row is
// the identity of this export. The double stays available to the tests that observe arrivals, and
// its manifest stays what `src/s0/stubs.ts` gives the same row, except the shutdown phase and
// `telemetry`: the table carries the real provider's `business` and its `telemetry` inject, the
// double has no phase and emits no record, so it does not inject `telemetry`.
import { describe, expect, it } from 'vitest'
import { sessionProviderRow as fromCordis } from '../../../src/cordis.ts'
import { serveProfile } from '../../../src/profile.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  createSessionProviderRow,
  sessionProviderRow,
} from '../../../src/rows/session-provider/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import type { RowId } from '../../../src/types.ts'

const sorted = (names: readonly string[]): string[] => [...names].sort()

describe('session-provider row: the export', () => {
  it('`sessionProviderRow` is the real row, in the row module and in `./cordis`', () => {
    expect(sessionProviderRow).toBe(sessionProviderRealRow)
    expect(fromCordis).toBe(sessionProviderRealRow)
    expect(rowDeclarationOf(sessionProviderRow)).toMatchObject({
      row: 'session-provider',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'business' },
    })
  })

  it('the contract double is still a declared `session-provider` row of its own kind', () => {
    expect(rowDeclarationOf(createSessionProviderRow())).toMatchObject({
      row: 'session-provider',
      implementation: 'contract-double',
      lifecycle: { kind: 'none' },
    })
  })

  it('the double provides and injects what the table row gives except `telemetry`, with the same provider group, and has no shutdown phase', () => {
    const declaration = rowDeclarationOf(createSessionProviderRow())
    const table = serveProfile().stubManifests.get('session-provider' as RowId)
    if (declaration === undefined || table === undefined) throw new Error('unreachable')
    expect(sorted(declaration.manifest.provides)).toEqual(sorted(table.provides))
    expect(sorted(declaration.manifest.injects)).toEqual(
      sorted(table.injects.filter(name => name !== 'telemetry')),
    )
    expect(declaration.manifest.sameProviderGroup).toBe(table.sameProviderGroup)
    expect(declaration.manifest.phase).toBeNull()
    expect(sorted(declaration.manifest.provides)).toEqual(['session'])
    expect(sorted(declaration.manifest.injects)).toEqual([
      'sessionAccessCheck',
      'sessionDelegatedTransactions',
      'sessionPrincipals',
      'sessionWorkPrincipals',
    ])
  })
})
