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

const PROVIDER_TYPES = [
  'AdoptedEndpoint',
  'AdoptionView',
  'CallRequest',
  'CatalogStore',
  'CredentialFailure',
  'CredentialPurpose',
  'CredentialUse',
  'EligibilityVerdict',
  'ExpectedRevision',
  'HttpCredentialHandle',
  'HttpPurpose',
  'ListingPage',
  'McpTransport',
  'McpTransportFactory',
  'ProcessCredentialHandle',
  'ProcessEnvironment',
  'ProcessHandle',
  'ProcessLanding',
  'ProcessPurpose',
  'ProcessSetting',
  'SentCall',
  'StopScope',
  'TaskAnswer',
  'TransportFailure',
  'TransportMaterial',
  'UseEligibility',
]

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

function sourceOf(file: string): string {
  return readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
}

/**
 * The relative modules that a source file imports or re-exports, in either quote style, through
 * `from`, a bare `import` or a dynamic `import()`.
 */
function relativeImports(text: string): readonly string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])\.\/([^"']+)\1/gu
  return [...text.matchAll(pattern)].flatMap(match => (match[2] === undefined ? [] : [match[2]]))
}

/** The source files that an entry reaches through relative imports. */
function reached(entry: string): ReadonlySet<string> {
  const seen = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    for (const target of relativeImports(sourceOf(file))) pending.push(target)
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
    expect(sourceOf(file)).not.toMatch(/["']@modelcontextprotocol\/|["']@deepseek-ai\/cordis/u)
  }
})

it('reads relative imports in either quote style and form', () => {
  const text = [
    "import { a } from './single.ts'",
    'export { b } from "./double.ts"',
    "import './bare.ts'",
    'const c = await import("./dynamic.ts")',
    "import { d } from '@omne-harness/other'",
  ].join('\n')
  expect(relativeImports(text)).toEqual(['single.ts', 'double.ts', 'bare.ts', 'dynamic.ts'])
})

it('the provider entry exports exactly the port type names', () => {
  const names = [...sourceOf('provider.ts').matchAll(/export type \{([^}]*)\}/gu)]
    .flatMap(match => (match[1] ?? '').split(','))
    .map(name => name.trim())
    .filter(name => name !== '')
    .sort()
  expect(names).toEqual(PROVIDER_TYPES)
})
