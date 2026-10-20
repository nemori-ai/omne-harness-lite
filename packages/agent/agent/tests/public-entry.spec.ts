import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as agent from '@omne-harness/agent'
import { describeImport, memberPath, walkModules, type ModuleKind } from './module-graph.ts'

/** Cordis and the Agent packages that bind to Cordis or to a host. The implementation reaches none. */
function forbidden(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    /^@omne-harness\/agent-(cordis-contract|host-local)(\/|$)/u.test(specifier) ||
    /^@omne-harness\/tool(\/|$)/u.test(specifier)
  )
}

it('root entry exports the runtime factory only; the construction shapes are types', () => {
  expect(Object.keys(agent).sort()).toEqual(['createAgentRuntime'])
})

it('testing entry exports the memory Journal, the scripted doubles, the clock and the assembly', async () => {
  const testing = await import('@omne-harness/agent/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'TEST_OWNER',
    'createManualAgentClock',
    'createMemoryAgentJournal',
    'createScriptedAccessCheck',
    'createScriptedActionAdmission',
    'createScriptedDecisionCards',
    'createScriptedExtensions',
    'createScriptedMaterials',
    'createScriptedMessageHandoff',
    'createScriptedModelContext',
    'createScriptedModelSelection',
    'createScriptedReads',
    'createScriptedRequestPreparation',
    'createScriptedToolRuntime',
    'createTableAdoptions',
    'createTableConditions',
    'createTestAgentDependencies',
    'readyPreparation',
    'testAdoption',
    'testEvidence',
  ])
})

describe('implementation has no Cordis', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/index.ts'],
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
    ['source', 'src/testing/index.ts'],
    ['javascript', 'dist/testing/index.js'],
    ['declaration', 'dist/testing/index.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    expect(graph.imports.filter(edge => forbidden(edge.specifier)).map(describeImport)).toEqual([])
    expect([...graph.files].filter(file => /[/\\]tests[/\\]/u.test(file))).toEqual([])
    if (!entry.includes('testing')) {
      expect(
        graph.imports
          .filter(
            edge => edge.specifier.includes('testing') || edge.specifier.startsWith('node:assert'),
          )
          .map(describeImport),
      ).toEqual([])
    }
  })

  it('depends on the contract packages and on neither Cordis, a Cordis or host Agent package, nor the Tool implementation', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toEqual({
      '@omne-harness/agent-contract': 'workspace:*',
      '@omne-harness/content-block': 'workspace:*',
      '@omne-harness/legal-identity': 'workspace:*',
      '@omne-harness/model-contract': 'workspace:*',
      '@omne-harness/operation-result': 'workspace:*',
      '@omne-harness/tool-contract': 'workspace:*',
    })
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(forbidden)).toEqual([])
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
