import { expect, it } from 'vitest'
import { decideAssetHoldingChange, type AssetHolding } from '../src/index.ts'
const holding: AssetHolding = Object.freeze({
  holdingRef: 'h1',
  scopeRef: 'tenant-a',
  assetRef: 'asset-a',
  category: 'service',
  name: 'example',
  revision: 1,
  state: 'held',
  selection: Object.freeze({ kind: 'follow' }),
})
it('removal advances the holding revision and prevents reuse as an active holding', () => {
  const removed = decideAssetHoldingChange(holding, { kind: 'remove', expectedRevision: 1 })
  expect(removed).toMatchObject({ kind: 'changed', holding: { revision: 2, state: 'removed' } })
  if (removed.kind === 'rejected') throw new Error('expected removal')
  expect(
    decideAssetHoldingChange(removed.holding, {
      kind: 'selectVersion',
      expectedRevision: 2,
      selection: { kind: 'follow' },
    }),
  ).toEqual({ kind: 'rejected', reason: 'removed' })
  expect(
    decideAssetHoldingChange(removed.holding, { kind: 'remove', expectedRevision: 2 }),
  ).toMatchObject({ kind: 'no_change' })
  expect(holding.state).toBe('held')
})
it('changes selection only at the expected revision and recognizes repeated selections', () => {
  expect(
    decideAssetHoldingChange(holding, {
      kind: 'selectVersion',
      expectedRevision: 0,
      selection: { kind: 'pinned', version: '1' },
    }),
  ).toEqual({ kind: 'rejected', reason: 'revision_conflict' })
  expect(
    decideAssetHoldingChange(holding, {
      kind: 'selectVersion',
      expectedRevision: 1,
      selection: { kind: 'follow' },
    }),
  ).toMatchObject({ kind: 'no_change' })
  const fixed = decideAssetHoldingChange(holding, {
    kind: 'selectVersion',
    expectedRevision: 1,
    selection: { kind: 'pinned', version: '1' },
  })
  expect(fixed).toMatchObject({
    kind: 'changed',
    holding: { revision: 2, selection: { kind: 'pinned', version: '1' } },
  })
})
