import { expect, it } from 'vitest'

it('publishes the first authorization shapes: the decision, the evidence, the permits and the reference pieces', async () => {
  const root = (await import('@omne-harness/authorization')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'PERMIT_ID_MAX_LENGTH',
      'canonicalText',
      'decideAdmission',
      'decisionEvidence',
      'decodePermitId',
      'digestOf',
      'inMemoryPermitLedger',
      'operationEquals',
      'referenceAdmissionCheck',
      'targetEquals',
    ].sort(),
  )
})
