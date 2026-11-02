// The `session-provider` export of `./cordis` is the real Session provider (`real.ts`): the release
// names the plugin `sessionProviderRow`, so the swap from the contract double to the real row is
// the identity of this export. The double stays available to the tests that observe arrivals.
import { describe, expect, it } from 'vitest'
import { sessionProviderRow as fromCordis } from '../../../src/cordis.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  createSessionProviderRow,
  sessionProviderRow,
} from '../../../src/rows/session-provider/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'

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
})
