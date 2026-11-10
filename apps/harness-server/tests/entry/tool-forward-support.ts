import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  decodeToolCallId,
  type FixedToolRequest,
  type ToolCatalog,
} from '@omne-harness/tool-contract'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { sessionWorkIssuerOf } from '../../src/entry/principals.ts'
import { releaseOf } from '../../src/entry/tool-release.ts'
import { governanceOf } from '../../src/entry/tool-release-manifest.ts'
import { RELEASE_REQUEST_CONTEXT, RELEASE_TOOL_SCOPE } from '../../src/rows/tool-runtime/scope.ts'
import { releaseFixture, TEST_CONSTRUCTION, tree } from '../rows/tool-host/support.ts'
import { fixtureTenant, okOf } from './support.ts'

export async function forwardWorld() {
  const fixture = await releaseFixture()
  const originalRelease = releaseOf(fixture.root)
  if (originalRelease.kind !== 'trusted') throw new Error('release unavailable')
  const base = originalRelease.manifest.entries.find(entry => entry.asset.name === 'Shell')
  if (base === undefined) throw new Error('fixture Shell missing')
  const toy = {
    ...base,
    asset: { name: 'ToyEcho', adoption: { ...base.asset.adoption, name: 'ToyEcho' } },
  }
  const release = {
    ...originalRelease,
    manifest: { ...originalRelease.manifest, entries: [...originalRelease.manifest.entries, toy] },
  }
  if (release.kind !== 'trusted') throw new Error('release unavailable')
  const tenant = fixtureTenant('a')
  const principal = okOf(
    sessionWorkIssuerOf(fixture.env)({ tenant, session: 'forward-test' }),
    'principal',
  )
  const call = okOf(decodeToolCallId('forward-parent'), 'call')
  const request = (name: keyof typeof TEST_CONSTRUCTION | 'ToyEcho'): FixedToolRequest => {
    const entry = release.manifest.entries.find(item => item.asset.name === name)
    if (entry === undefined) throw new Error('no release entry')
    const module =
      name === 'TodoItems'
        ? release.modules.todoItemsToolModule
        : name === 'Web'
          ? release.modules.webToolModule
          : name === 'Tools'
            ? release.modules.toolsToolModule
            : name === 'Shell' || name === 'ToyEcho'
              ? release.modules.shellToolModule
              : release.modules.filesToolModule
    const author = okOf(
      module.createAuthor(tree(TEST_CONSTRUCTION[name === 'ToyEcho' ? 'Shell' : name])),
      'author',
    )
    const definition = okOf(
      judgeToolDefinition(deriveDefinition(governanceOf(entry), author.facts)),
      'definition',
    )
    return {
      availability: {
        kind: 'available',
        definition,
        executor: entry.module.executor,
        layer: { kind: 'official' },
      },
      invocation: {
        kind: 'direct',
        source: { owner: 'fixture', record: 'parent', revision: '1', digest: 'fixture' },
      },
      command: 'help',
      arguments: { original: '{}', effective: '{}', complete: true },
      settings: entry.settings,
      context: RELEASE_REQUEST_CONTEXT,
      workspace: null,
      environment: definition.declarations.environment,
      requesterScope: okOf(decodeScopeRef({ ref: 'forward-test-scope' }), 'scope'),
      resources: [],
      scope: RELEASE_TOOL_SCOPE,
      consumer: {
        owner: '@omne-harness/agent',
        work: 'forward-test',
        position: '1',
        purpose: 'action',
      },
      batchDecision: null,
      mode: 'foreground',
      limits: { concurrency: 1, foregroundMs: 234, backgroundAfterMs: null },
    }
  }
  const catalog: ToolCatalog<unknown> = {
    inspect: async input =>
      input.name === 'Files' ||
      input.name === 'Shell' ||
      input.name === 'Tools' ||
      input.name === 'ToyEcho'
        ? { ok: request(input.name).availability }
        : { failure: { kind: 'invalid', field: 'name', reason: 'unknown' } },
    search: async () => ({
      failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
    }),
    usage: async () => ({
      failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
    }),
  }
  let toyResident = false
  const view: LocalToolCatalogViewSource<unknown> = {
    read: async () => ({
      ok: {
        scope: { owner: 'fixture', record: 'forward-test', revision: '1', digest: 'fixture' },
        revision: String(toyResident),
        entries: release.manifest.entries.map(entry => ({
          key: { layer: { kind: 'official' }, asset: entry.asset },
          resident: entry.asset.name === 'ToyEcho' ? toyResident : true,
        })),
      },
    }),
  }
  return {
    view,
    setToyResident: (value: boolean) => {
      toyResident = value
    },
    fixture,
    release,
    tenant,
    principal,
    call,
    request,
    catalog,
    parent: { principal, tenant, request: request('Tools') },
    close: () => fixture.root.fiber.dispose(),
  }
}
