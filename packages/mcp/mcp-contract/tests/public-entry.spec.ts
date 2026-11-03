import { readFileSync } from 'node:fs'
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
  'isInstructionsDigest',
  'isMillis',
  'isProtocolVersion',
  'isRequestState',
  'isTaskId',
]

const ROOT = [
  ...BRAND_GUARDS,
  'actionPermissionItems',
  'boundInstructions',
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

const TESTING = [
  'NotApplicable',
  'classifyOutcomeCases',
  'createMemoryAdoptionView',
  'createMemoryCatalogStore',
  'createMemoryCredentialUse',
  'createMemoryProcessLanding',
  'createMemoryUseEligibility',
  'isNotApplicable',
  'mcpAdoptionViewConformance',
  'mcpCatalogStoreConformance',
  'mcpCredentialUseConformance',
  'mcpProcessLandingConformance',
  'mcpUseEligibilityConformance',
  'mergeListingCases',
  'runConformanceCase',
].sort()

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

/** The source files that an entry reaches through relative imports. */
function reached(entry: string): ReadonlySet<string> {
  const seen = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
    for (const match of text.matchAll(/from '\.\/([^']+)'/gu))
      if (match[1] !== undefined) pending.push(match[1])
  }
  return seen
}

it('the root and provider entries do not reach the testing modules', () => {
  for (const entry of ['index.ts', 'provider.ts']) {
    const files = [...reached(entry)]
    expect(files.length).toBeGreaterThan(1)
    expect(files.filter(file => file.startsWith('testing'))).toEqual([])
  }
})

it('no source file imports an MCP SDK or Cordis', () => {
  const files = [...reached('index.ts'), ...reached('provider.ts'), ...reached('testing.ts')]
  for (const file of new Set(files)) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
    expect(text).not.toMatch(/from '@modelcontextprotocol\/|from '@deepseek-ai\/cordis/u)
  }
})
