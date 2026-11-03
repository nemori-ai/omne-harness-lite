import { expect, it } from 'vitest'

const BRAND_GUARDS = [
  'isActionName',
  'isAdoptionRevision',
  'isCatalogRevision',
  'isConnectionTarget',
  'isCorrelationKey',
  'isCredentialBinding',
  'isDefinitionDigest',
  'isEndpointHolding',
  'isEndpointName',
  'isGeneration',
  'isMillis',
  'isProtocolVersion',
  'isRequestState',
  'isTaskId',
]

const ROOT = [
  ...BRAND_GUARDS,
  'actionPermissionItems',
  'catalogKeyOf',
  'classifyOutcome',
  'completeListing',
  'connectionKeyOf',
  'digestDefinition',
  'launchesLocalCommand',
  'markUnavailable',
  'mcpEndpointBodyContract',
  'mergeListing',
  'parseEndpointBody',
  'peerAccountOf',
  'toContentBlocks',
].sort()

const TESTING = ['classifyOutcomeCases'].sort()

it('the root entry exports the values and pure functions of the contract', async () => {
  const root = (await import('@omne-harness/mcp-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(ROOT)
})

it('the provider entry exports port types only', async () => {
  const provider = (await import('@omne-harness/mcp-contract/provider')) as Record<string, unknown>
  expect(Object.keys(provider)).toEqual([])
})

it('the testing entry exports the conformance facilities', async () => {
  const testing = (await import('@omne-harness/mcp-contract/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual(TESTING)
})
