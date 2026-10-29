import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as tool from '@omne-harness/tool-contract'
import {
  describeImport,
  memberPath,
  specifiersOf,
  walkModules,
  type ModuleKind,
} from './module-graph.ts'

it('exports on the root only the names members outside the Tool group import, and their closure', () => {
  // SPEC「公开入口的分组」rule 1: the root runtime names are the reference codecs and the two
  // identity decoders and the RC block declaration/schema consumed outside the Tool group,
  // and by rule 3 the relation
  // check of a result push, which receivers outside the group call. The grouping table of the
  // switch is in the PR (tmp/issue-626/provider-split.md).
  expect(Object.keys(tool).sort()).toEqual([
    'backgroundCallsBlock',
    'backgroundCallsSchema',
    'decodeToolCallId',
    'decodeToolOperationId',
    'encodeToolInvocationRef',
    'encodeToolOperationRef',
    'judgeToolDelivery',
    'readToolOperationRef',
    'resolveToolInvocationRef',
    'resolveToolOperationRef',
  ])
})

it('exports the provider protocol on the provider entry, and no name on both entries', async () => {
  const provider = await import('@omne-harness/tool-contract/provider')
  expect(Object.keys(provider).sort()).toEqual([
    'TOOL_IDENTITY_MAX_LENGTH',
    'TOOL_REFERENCE_MAX_LENGTH',
    'createDefaultParameterCodec',
    'decodeToolCursor',
    'decodeToolDeliveryId',
    'decodeToolInstanceId',
    'decodeToolInvocationRef',
    'decodeToolOperationRef',
    'decodeToolResultVersion',
    'decodeToolRevision',
    'decodeToolWaitId',
    'defaultResultPolicy',
    'defaultResultPolicyAdoption',
    'defaultResultPolicyRules',
    'defineCommandTool',
    'defineFunctionTool',
    'defineToolOperation',
    'defineToolWaitContract',
    'deriveDefinition',
    'describedAdoption',
    'evaluateToolAvailability',
    'foldResident',
    'judgeConsumerRef',
    'judgeFixedToolRequest',
    'judgeHandoff',
    'judgeImplementationFacts',
    'judgePreparationFact',
    'judgeToolArguments',
    'judgeToolDefinition',
    'judgeToolInvokeRequest',
    'judgeToolState',
    'planAdoption',
    'presentTool',
    'projectToolBackgroundCalls',
    'projectToolResult',
    'readToolInvocationRef',
    'refreshAvailability',
    'renderToolResult',
    'sameBindingKey',
    'sameShape',
    'sameSourceLayer',
    'shapeOf',
    'toolBodyContract',
    'toolStreamCallCodec',
  ])
  for (const name of Object.keys(provider)) expect(Object.keys(tool)).not.toContain(name)
})

it('exports every type name from exactly one of the root and provider entries', () => {
  // The source entries are explicit export lists; a name listed in both would be two entries for
  // one name, which the SPEC forbids.
  const names = (entry: string) =>
    [...readFileSync(memberPath(entry), 'utf8').matchAll(/export (?:type )?\{([^}]*)\}/gu)]
      .flatMap(match => (match[1] as string).split(','))
      .map(name => name.trim())
      .filter(name => name.length > 0)
  const rootNames = names('src/index.ts')
  const providerNames = names('src/provider.ts')
  expect(rootNames.length).toBeGreaterThan(0)
  expect(new Set(rootNames).size).toBe(rootNames.length)
  expect(new Set(providerNames).size).toBe(providerNames.length)
  expect(rootNames.filter(name => providerNames.includes(name))).toEqual([])
})

it('keeps the readers of the author off the root and on the binding entry', async () => {
  // A handle and a registration hide the executor (public-api); only a trusted binding provider
  // imports the `./binding` entry that reads it.
  expect(Object.keys(tool)).not.toContain('readToolOperation')
  expect(Object.keys(tool)).not.toContain('readToolRegistration')
  const provider = await import('@omne-harness/tool-contract/provider')
  expect(Object.keys(provider)).not.toContain('readToolOperation')
  expect(Object.keys(provider)).not.toContain('readToolRegistration')
  const binding = await import('@omne-harness/tool-contract/binding')
  expect(Object.keys(binding).sort()).toEqual([
    'readOwnSlot',
    'readToolOperation',
    'readToolRegistration',
  ])
})

it('reads an own property on the binding entry without running a getter', async () => {
  // Every implementation reads an untrusted value the same way: an inherited key is absent, an
  // accessor is reported and never called, and only an own data property yields its value.
  const { readOwnSlot } = await import('@omne-harness/tool-contract/binding')
  let ran = false
  const value = Object.create(
    { inherited: 1 },
    {
      data: { value: 'x', enumerable: true },
      getter: {
        get: () => {
          ran = true
          return 'y'
        },
      },
    },
  ) as object
  expect(readOwnSlot(value, 'data')).toEqual({ kind: 'value', value: 'x' })
  expect(readOwnSlot(value, 'getter')).toEqual({ kind: 'accessor' })
  expect(readOwnSlot(value, 'inherited')).toEqual({ kind: 'absent' })
  expect(ran).toBe(false)
})

it('exports the conformance suites and the non-durable doubles on the testing entry only', async () => {
  const testing = await import('@omne-harness/tool-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'NotApplicable',
    'clockAnswers',
    'completedFinal',
    'completionOf',
    'createMemoryAuthorizedToolStartAuthority',
    'createMemoryToolClock',
    'createMemoryToolDecisionBridge',
    'createMemoryToolEnvironment',
    'createMemoryToolExecutorBinding',
    'createMemoryToolOutputCustody',
    'createMemoryToolResourceResponses',
    'createMemoryToolResultReceiver',
    'createMemoryToolStartAuthority',
    'crossTenantAnswers',
    'decisionBridgeAnswers',
    'environmentAnswers',
    'executorBindingAnswers',
    'finalAnswer',
    'isNotApplicable',
    'isProgress',
    'memoryToolClockFixture',
    'memoryToolDecisionBridgeFixture',
    'memoryToolEnvironmentFixture',
    'memoryToolExecutorBindingFixture',
    'memoryToolOutputCustodyFixture',
    'memoryToolResourceResponsesFixture',
    'memoryToolResultReceiverFixture',
    'memoryToolStartAuthorityFixture',
    'memoryToolStartAuthorizationFixture',
    'memoryToolStartFenceFixture',
    'outputCustodyAnswers',
    'resendRecalls',
    'resourceResponsesAnswers',
    'runConformanceCase',
    'startAuthorityAnswers',
    'testingTenant',
    'testingWorkspace',
    'toolClockConformance',
    'toolCredentialsConformance',
    'toolDecisionBridgeConformance',
    'toolEnvironmentAllocationConformance',
    'toolEnvironmentConformance',
    'toolExecutorBindingConformance',
    'toolOutputCustodyConformance',
    'toolResourceResponsesConformance',
    'toolResultReceiverConformance',
    'toolStartAuthorityConformance',
    'toolStartAuthorizationConformance',
    'toolStartFenceConformance',
  ])
  const provider = await import('@omne-harness/tool-contract/provider')
  for (const name of Object.keys(testing)) {
    expect(Object.keys(tool)).not.toContain(name)
    expect(Object.keys(provider)).not.toContain(name)
  }
})

it('declares every non-durable double as durability none', async () => {
  const testing = await import('@omne-harness/tool-contract/testing')
  const doubles = [
    testing.createMemoryToolClock(),
    testing.createMemoryToolDecisionBridge(),
    testing.createMemoryToolEnvironment(),
    testing.createMemoryToolExecutorBinding(),
    testing.createMemoryToolOutputCustody(),
    testing.createMemoryToolResourceResponses(),
    testing.createMemoryToolStartAuthority(),
  ]
  for (const double of doubles) expect(double.durability).toBe('none')
})

it.each(['src/index.ts', 'dist/index.d.ts', 'src/provider.ts', 'dist/provider.d.ts'])(
  'names neither reader nor slot type in the entry %s',
  entry => {
    const root = readFileSync(memberPath(entry), 'utf8')
    expect(root).not.toMatch(
      /\breadTool(Operation|Registration)\b|\bTool(Operation|Registration)Slot\b/u,
    )
  },
)

/** The other Tool packages. The contract package must not depend on any of them. */
const toolMember = /^@omne-harness\/tool(-cordis-contract|-host-local)?(\/|$)/u

/** A root graph must not reach Cordis, a Cordis entry of any package, or another Tool package. */
function forbiddenFromRoot(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    toolMember.test(specifier) ||
    /(^|\/)cordis(\.d)?\.(ts|js)$/u.test(specifier)
  )
}

describe('contract package depends on no Tool member', () => {
  it('lists neither Cordis nor another Tool package in its manifest', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      exports: Record<string, unknown>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(
      declared.filter(name => toolMember.test(name) || name.startsWith('@deepseek-ai/')),
    ).toEqual([])
    expect(Object.keys(manifest.exports)).not.toContain('./cordis')
  })

  it('has no Cordis in its production install closure', () => {
    expect(routesToCordis(memberPath('.'), [])).toEqual([])
  })
})

/** Production dependency routes from a workspace package to Cordis, through workspace packages. */
function routesToCordis(directory: string, route: readonly string[]): string[][] {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.entries(manifest.dependencies ?? {}).flatMap(([name, range]) => {
    if (name === '@deepseek-ai/cordis') return [[...route, name]]
    if (!range.startsWith('workspace:') || route.includes(name)) return []
    return routesToCordis(realpathSync(join(directory, 'node_modules', name)), [...route, name])
  })
}

describe('root, provider, binding and testing entries have no Cordis', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/index.ts'],
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
    ['source', 'src/provider.ts'],
    ['javascript', 'dist/provider.js'],
    ['declaration', 'dist/provider.d.ts'],
    ['source', 'src/binding.ts'],
    ['javascript', 'dist/binding.js'],
    ['declaration', 'dist/binding.d.ts'],
    ['source', 'src/testing.ts'],
    ['javascript', 'dist/testing.js'],
    ['declaration', 'dist/testing.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    expect(graph.files.size).toBeGreaterThan(1)
    const forbidden = graph.imports.filter(edge => forbiddenFromRoot(edge.specifier))
    expect(forbidden.map(describeImport)).toEqual([])
    for (const file of graph.files) expect(file).not.toMatch(/[/\\]cordis(\.d)?\.(ts|js)$/u)
  })

  it('sees every import form that can load a module', () => {
    // A guard for the walker itself: a walker that misses one of these forms would pass the
    // checks above while the root still loaded Cordis.
    const text = [
      "import '@deepseek-ai/cordis'",
      "import type { Context } from 'a-type'",
      "export { x } from './b.js'",
      "export * from 'c'",
      "const d = await import('@omne-harness/tool-host-local/cordis')",
    ].join('\n')
    expect(specifiersOf(text)).toEqual([
      '@deepseek-ai/cordis',
      'a-type',
      './b.js',
      'c',
      '@omne-harness/tool-host-local/cordis',
    ])
  })
})
