import { expect, it } from 'vitest'

it('the public entry exports the value parsers, the standing of a relation and the policy', async () => {
  const root = (await import('@omne-harness/workspace-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'decide',
    'govern',
    'instanceId',
    'loadBasis',
    'operationId',
    'reason',
    'standingOf',
    'typeName',
  ])
})
