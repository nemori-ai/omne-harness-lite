import { expect, it } from 'vitest'

it('publishes the authorization shapes: the decision, the system action decision with its matrix, the evidence, the permits and the reference pieces', async () => {
  const root = (await import('@omne-harness/authorization')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'noArguments',
      'GRANT_REF_TEXT_LIMIT',
      'PERMIT_ID_MAX_LENGTH',
      'RELEASE_ARGUMENTS_LIMIT',
      'RELEASE_OPTIONS',
      'SYSTEM_ACTION_MATRIX',
      'canonicalText',
      'decideAdmission',
      'decideRelease',
      'decideSystemAction',
      'decisionEvidence',
      'decodePermitId',
      'digestOf',
      'effectiveArgumentsOf',
      'grantLayerOf',
      'grantRefText',
      'inMemoryPermitLedger',
      'parseGrantRef',
      'operationEquals',
      'referenceAdmissionCheck',
      'releaseCard',
      'referenceSystemActionAuthorization',
      'targetEquals',
    ].sort(),
  )
})
