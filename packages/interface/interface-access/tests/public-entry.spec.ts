import { expect, it } from 'vitest'

it('exports the ledger, the inspections that run it and the contribution', async () => {
  const root = (await import('@omne-harness/interface-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'EMPTY_LEDGER',
    'createInspections',
    'createInterfaceContribution',
    'stepLedger',
  ])
})
