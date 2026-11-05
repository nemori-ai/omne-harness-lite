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

/** The decision layer of T8 (one implementation for every transport) and what a transport writes. */
const DECISIONS = [
  'ABANDONED',
  'METHOD_NOT_FOUND',
  'NOT_SENT_FAILURE',
  'OFFERED_LEGACY_VERSION',
  'PROBE_REQUESTS',
  'RESENT_REQUESTS',
  'callAnswerOf',
  'concludeAnswer',
  'concludeProbe',
  'discoverAuthorization',
  'discoverWith',
  'interpretAnswer',
  'legacyIdentityOf',
  'legacyInitializeParamsOf',
  'listingPageOf',
  'notificationTextOf',
  'peerRequestAnswerOf',
  'readPeerMessage',
  'readerOf',
  'requestClassOf',
  'requestTextOf',
  'responseTextOf',
  'retryVersionOf',
  'taskAnswerOf',
  'taskReportOf',
]

const ROOT = [
  ...BRAND_GUARDS,
  ...DECISIONS,
  'FIRST_MODERN_PROTOCOL_VERSION',
  'LEGACY_PROTOCOL_VERSIONS',
  'PROCESS_EXIT_WINDOW_MS',
  'classifyWireEvent',
  'authorizationChallengeOf',
  'authorizationDiscoveryOf',
  'clientEnvelopeOf',
  'errorAnswerOf',
  'mcpRequestHeadersOf',
  'metadataCandidatesOf',
  'peerIdentityOf',
  'readDiscoverResult',
  'readInitializeResult',
  'readListingPage',
  'readTaskAnswer',
  'readTaskReport',
  'withheldTools',
  'actionPermissionItems',
  'boundInstructions',
  'canonical',
  'catalogKeyOf',
  'classifyOutcome',
  'completeListing',
  'connectionKeyOf',
  'digestDefinition',
  'isActionArgs',
  'launchesLocalCommand',
  'markUnavailable',
  'mcpEndpointBodyContract',
  'mergeListing',
  'parseEndpointBody',
  'peerAccountOf',
  'sameJson',
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
  'TaskAnswer',
  'TransportFailure',
  'TransportMaterial',
  'UseEligibility',
  'WithheldReason',
]

const TESTING = [
  'NotApplicable',
  'TRANSPORT_TABLE',
  'cellsOf',
  'rowsOf',
  'transportCells',
  'actionNameOf',
  'classifyOutcomeCases',
  'createMemoryAdoptionView',
  'createMemoryCatalogStore',
  'createMemoryCredentialUse',
  'createMemoryProcessLanding',
  'createMemoryUseEligibility',
  'createScriptedTransportFactory',
  'generationOf',
  'isNotApplicable',
  'jsonOf',
  'jsonTextOf',
  'mcpAdoptionViewConformance',
  'mcpCatalogStoreConformance',
  'mcpCredentialUseConformance',
  'mcpProcessLandingConformance',
  'mcpTransportConformance',
  'mcpUseEligibilityConformance',
  'mergeListingCases',
  'protocolVersionOf',
  'requestStateOf',
  'revisionOf',
  'runConformanceCase',
  'taskIdOf',
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

/**
 * The source text of a module without comments and empty statements. A mutation sandbox adds a
 * `// @ts-nocheck` header and stray `;` statements; neither is an import or an export.
 */
function sourceOf(file: string): string {
  return withoutNoise(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'))
}

function withoutNoise(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/gu, '$1')
    .split('\n')
    .filter(line => line.trim() !== '' && line.trim() !== ';')
    .join('\n')
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

/**
 * The names an entry exports. Star exports (`export *`, `export type *`) cannot be listed by
 * name, so they come back as `*`; `export { type X }` counts as a name too.
 */
function exportedNames(text: string): readonly string[] {
  const stars = [...text.matchAll(/\bexport\s+(?:type\s+)?\*/gu)].map(() => '*')
  const named = [...text.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/gu)]
    .flatMap(match => (match[1] ?? '').split(','))
    .map(name => name.trim().replace(/^type\s+/u, ''))
    .filter(name => name !== '')
  return [...stars, ...named].sort()
}

/** Every export statement of an entry, from `export` to the end of the statement. */
function exportStatements(text: string): readonly string[] {
  return [...text.matchAll(/\bexport\b[^;]*?from\s*['"][^'"]+['"]|\bexport\b[^\n]*/gu)].map(
    match => match[0],
  )
}

it('reads star exports and inline type names as exports', () => {
  const text = [
    "export type * from './a.ts'",
    "export * from './b.ts'",
    "export { type C, D } from './c.ts'",
    "export type { E } from './e.ts'",
  ].join('\n')
  expect(exportedNames(text)).toEqual(['*', '*', 'C', 'D', 'E'])
})

it('the provider entry exports exactly the port type names', () => {
  expect(exportedNames(sourceOf('provider.ts'))).toEqual(PROVIDER_TYPES)
})

it('the provider entry uses only the export type { … } from form', () => {
  const statements = exportStatements(sourceOf('provider.ts'))
  expect(statements.length).toBeGreaterThan(0)
  for (const statement of statements)
    expect(statement).toMatch(/^export type \{[^}]*\} from (["'])\.\/[^"']+\1;?$/u)
})

it('reads a module the way a mutation sandbox writes it', () => {
  const text = withoutNoise(
    [
      '// @ts-nocheck',
      '/* export * from "./hidden.ts" */',
      ';',
      "export type { A } from './a.ts'; // export * from './b.ts'",
      ';',
    ].join('\n'),
  )
  expect(exportedNames(text)).toEqual(['A'])
  expect(exportStatements(text)).toEqual(["export type { A } from './a.ts'"])
})
