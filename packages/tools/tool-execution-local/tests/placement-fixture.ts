import { vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { copyJsonValue, toOpaqueJson, type JsonValue } from '@omne-harness-lite/content-blocks'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import type {
  CurrentInputResult,
  NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import {
  environmentToolOf,
  type ExecutionRead,
  type SelectedTool,
  type ToolRuntimeOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  EnvironmentPlacementSource,
  EnvironmentPermission,
  EnvironmentDescription,
} from '@omne-harness-lite/execution-environments'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { createToolEnvironmentPlacementSource } from '../src/index.ts'

export const at = '2026-10-06T09:00:00Z'
export const scope = {
  tenant: unwrap(parseTenantId({ organization: 'placement-org', account: 'placement-user' })),
  session: unwrap(parseOpaqueIdentifier('placement-session', 'SessionRef')),
}
export const execution = unwrap(parseOpaqueIdentifier('placement-call', 'CallId'))
export const capability = { category: 'tool' as const, name: 'shell' }
const root = { category: 'agent_definition' as const, name: 'assistant' }
export const definition: ToolDefinition = {
  name: 'shell',
  description: 'Run a command',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {}, description: 'Command input' },
  permissions: { execute: { default: 'auto' } },
  settings: {
    targetEnvironment: {
      category: 'placement_identity',
      default: { bindingLayer: 'host_machine', facilities: ['command'] },
    },
  },
}
export function legalInput(tool: ToolDefinition = definition): NonConnectorEvaluationInput {
  const captured = copyJsonValue(tool)
  if ('failed' in captured) throw new Error('fixture tool must be ordinary JSON')
  return {
    tenant: scope.tenant,
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references: [{ capability }],
      attributes: [],
      source: { asset: 'root-asset', version: 1 },
    },
    holdings: [root, capability].map(value => ({
      holder: { layer: 'factory' },
      capability: value,
      asset: value === root ? 'root-asset' : 'shell-asset',
      basis: { kind: 'official' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: [],
      since: at,
    })),
    definitions: [
      {
        id: 'root-asset',
        capability: root,
        origin: 'official',
        versions: [
          {
            number: 1,
            content: { category: 'agent_definition', body: toOpaqueJson({}) },
            publishedAt: at,
          },
        ],
      },
      {
        id: 'shell-asset',
        capability,
        origin: 'official',
        versions: [
          { number: 1, content: { category: 'tool', definition: captured.ok }, publishedAt: at },
        ],
      },
    ],
  }
}
export function sessionPick(
  input: NonConnectorEvaluationInput,
  item: string,
  value: JsonValue,
): NonConnectorEvaluationInput {
  return {
    ...input,
    session: [
      ...(input.session ?? []),
      { capability, assignment: { item, value, immutable: false, since: at } },
    ],
  }
}
export const description: EnvironmentDescription = {
  reference: { provider: 'host', reference: 'instance' },
  bindingLayer: 'host_machine',
  binding: { kind: 'host_machine' },
  facilities: ['command', 'files'],
  instance: { id: 'instance', generation: 'one' },
  continuity: { kind: 'notGuaranteed' },
}

/** A real legal asset input is evaluated. Only the public original-execution observer is controlled. */
export function placementFixture(
  permission: EnvironmentPermission = 'always-allow',
  tool: ToolDefinition = definition,
) {
  const selected: SelectedTool = {
    capability: capabilityCanonicalString(capability),
    asset: 'shell-asset',
    version: '1',
    definition: tool,
    adoption: 'original',
  }
  const call = { execution, tool: environmentToolOf(selected) }
  const token = Object.freeze({}) as SessionAccess
  const release = vi.fn()
  const read = vi.fn<() => Promise<ExecutionRead>>(async () => ({
    kind: 'found',
    snapshot: {
      ref: { ...scope, callId: execution },
      origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
      selected,
      adoptedContext: [],
      state: { phase: 'running', startedAt: at },
    },
  }))
  const acquire = vi.fn<ToolRuntimeOperations['acquire']>(async () => ({
    kind: 'acquired',
    observer: {
      read,
      release,
      waitForEnd: read,
      frames: async () => ({ kind: 'rejected', reason: 'runtimeUnavailable' }),
    },
  }))
  let current: CurrentInputResult = { input: legalInput(tool) }
  const inputs = vi.fn(async () => current)
  const select = vi.fn<EnvironmentPlacementSource['select']>(async (_placement, candidates) =>
    candidates.length === 1 && candidates[0]
      ? { kind: 'selected', reference: candidates[0].reference }
      : { kind: 'rejected', reason: 'ambiguousEnvironment' },
  )
  const source = createToolEnvironmentPlacementSource(
    { name: 'current-tools', factoryPermission: permission },
    { tools: { acquire }, currentInputs: { read: inputs }, select },
  )
  return {
    source,
    token,
    call,
    selected,
    release,
    read,
    acquire,
    inputs,
    select,
    setCurrent(value: CurrentInputResult) {
      current = value
    },
    input: () => legalInput(tool),
    query: () => source.read(scope, token, call),
  }
}
