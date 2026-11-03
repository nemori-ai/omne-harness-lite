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
  'launchesLocalCommand',
  'mcpEndpointBodyContract',
  'parseEndpointBody',
].sort()

it('the root entry exports the values and pure functions of the contract', async () => {
  const root = (await import('@omne-harness/mcp-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(ROOT)
})
