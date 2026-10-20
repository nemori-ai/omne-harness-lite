import { expect, it } from 'vitest'
import * as agent from '@omne-harness/agent-contract'

// The whole runtime surface of the package entry. Every type is erased, so a new value export
// (function or constant) has to be added here on purpose; a helper that two modules share
// (`attributeItem`, `refused`, `copyPlain`) must stay out of the entry.
it('exports exactly the judgments, the constants, the identity decoders and the body contract', () => {
  expect(Object.keys(agent).sort()).toEqual([
    'AGENT_IDENTITY_MAX_LENGTH',
    'ATTRIBUTE_ITEMS',
    'POSITIONS',
    'POSITION_OUTPUTS',
    'POWERS',
    'agentBodyContract',
    'decodeActionBatchId',
    'decodeActionId',
    'decodeAgentExecutionId',
    'decodeAgentInstanceId',
    'decodeAgentOperationId',
    'decodeAgentRegistrationId',
    'decodeCardRoundId',
    'decodeConsumptionId',
    'decodeExecutionAttachmentId',
    'decodeExecutionRevision',
    'decodeInputBatchId',
    'decodeInputId',
    'decodePassageId',
    'decodeStepId',
    'judgeAccess',
    'judgeAdoption',
    'judgeAgentDefinition',
    'judgeAuthority',
    'judgeEvidence',
    'judgeExtensionOutput',
    'judgeLoopExtensions',
  ])
})

it('keeps the shared helpers of the judgments off the entry', () => {
  for (const internal of ['attributeItem', 'refused', 'copyPlain', 'checkJson']) {
    expect(Object.keys(agent)).not.toContain(internal)
  }
})
