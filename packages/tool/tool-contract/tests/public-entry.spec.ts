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

it('exports the body port, the identity decoders, the default result policy and the contract functions', () => {
  expect(Object.keys(tool).sort()).toEqual([
    'TOOL_IDENTITY_MAX_LENGTH',
    'createDefaultParameterCodec',
    'decodeToolCallId',
    'decodeToolCursor',
    'decodeToolDeliveryId',
    'decodeToolInstanceId',
    'decodeToolOperationId',
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
    'describedAdoption',
    'evaluateToolAvailability',
    'judgeConsumerRef',
    'judgeFixedToolRequest',
    'judgeHandoff',
    'judgeToolArguments',
    'judgeToolDefinition',
    'judgeToolState',
    'presentTool',
    'projectToolResult',
    'renderToolResult',
    'toolBodyContract',
  ])
})

it('keeps the readers of the author off the root and on the binding entry', async () => {
  // A handle and a registration hide the executor (public-api); only a trusted binding provider
  // imports the `./binding` entry that reads it.
  expect(Object.keys(tool)).not.toContain('readToolOperation')
  expect(Object.keys(tool)).not.toContain('readToolRegistration')
  const binding = await import('@omne-harness/tool-contract/binding')
  expect(Object.keys(binding).sort()).toEqual(['readToolOperation', 'readToolRegistration'])
})

it.each(['src/index.ts', 'dist/index.d.ts'])(
  'names neither reader nor slot type in the root entry %s',
  entry => {
    const root = readFileSync(memberPath(entry), 'utf8')
    expect(root).not.toMatch(/readTool(Operation|Registration)|Tool(Operation|Registration)Slot/u)
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

describe('root and binding entries have no Cordis', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/index.ts'],
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
    ['source', 'src/binding.ts'],
    ['javascript', 'dist/binding.js'],
    ['declaration', 'dist/binding.d.ts'],
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
