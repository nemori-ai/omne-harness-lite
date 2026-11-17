import { expect, it } from 'vitest'

it('exports the decision wait and its byte limits', async () => {
  const root = (await import('@omne-harness/human-intervention-tool')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DECISION_REQUEST_MAX_BYTES',
    'DECISION_RESPONSE_MAX_BYTES',
    'hitlDecisionWait',
  ])
})
