import { expect, it } from 'vitest'

it('the root entry exports exactly the landed runtime values', async () => {
  const root = (await import('@omne-harness/model-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'MODEL_INPUT_LIMITS',
      'judgeAdmit',
      'judgeFixedModelRequest',
      'MODEL_REFERENCE_MAX_LENGTH',
      'encodeModelInvocationRef',
      'encodeModelOperationRef',
      'decodeModelInvocationRef',
      'decodeModelOperationRef',
      'resolveModelInvocationRef',
      'resolveModelOperationRef',
      'MODEL_IDENTITY_MAX_LENGTH',
      'MODEL_IDENTITY_PREFIXES',
      'MODEL_SEND',
      'compareOutputCursors',
      'compareRevisions',
      'continuedMessages',
      'decodeCredentialId',
      'decodeDispatchId',
      'decodeModelCallId',
      'decodeModelDiagnosticCursor',
      'decodeModelDiagnosticId',
      'decodeModelInstanceId',
      'decodeModelOperationId',
      'decodeOutputCursor',
      'decodeReadId',
      'decodeResultVersion',
      'decodeRevision',
      'deriveGuardControlOperation',
      'judgeReplayDeclaration',
      'projectReplay',
      'sameCredentialHolder',
    ].sort(),
  )
})
