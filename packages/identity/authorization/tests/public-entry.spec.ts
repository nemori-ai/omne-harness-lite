import { expect, it } from 'vitest'

it('publishes the authorization shapes: the decision, the system action decision with its matrix, the evidence, the permits and the reference pieces', async () => {
  const root = (await import('@omne-harness/authorization')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'noArguments',
      'PERMIT_ID_MAX_LENGTH',
      'SYSTEM_ACTION_MATRIX',
      'canonicalText',
      'decideAdmission',
      'decideSystemAction',
      'decisionEvidence',
      'decodePermitId',
      'digestOf',
      'effectiveArgumentsOf',
      'inMemoryPermitLedger',
      'operationEquals',
      'referenceAdmissionCheck',
      'referenceSystemActionAuthorization',
      'targetEquals',
    ].sort(),
  )
})
