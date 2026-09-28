import { expect, test, vi } from 'vitest'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { copyJsonValue, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { modelEntry, modelName, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import {
  buildReport,
  buildSnapshots,
  buildTableContents,
  createAssetRegistry,
  type AssetRegistryService,
  type AvailabilityReport,
  type RegistryDependencies,
  type RegistryEntry,
} from '@omne-harness-lite/asset-registry'
import { resolveCallTools, type CallToolRequest } from '../src/call-tools.ts'

const session = unwrap(parseOpaqueIdentifier('session_tool_resolution', 'SessionRef'))
const tenant = unwrap(parseTenantId({ organization: 'org_example', account: 'acc_example' }))
const root = { category: 'agent_definition', name: 'example:root' } as const
const tool = { category: 'tool', name: 'example:read' } as const
const definition = {
  name: tool.name,
  paradigm: 'single',
  description: 'Read a document',
  input: { type: 'object', properties: {}, additionalProperties: false },
  permissions: { execute: { default: 'auto' } },
  origin: { kind: 'authored' },
} as const satisfies ToolDefinition
const toolName = modelName(tool.name)
const now = '2026-09-27T00:00:00Z'
const instant = unwrap(instantFromEpochMs(1))

function request(changes: Partial<CallToolRequest> = {}): CallToolRequest {
  return { session, tools: [toolName], ...changes }
}

function entry(availability: RegistryEntry['availability'] = { kind: 'available' }): RegistryEntry {
  return {
    capability: tool,
    asset: 'ast_read',
    from: 'factory',
    content: { category: 'tool', definition },
    availability,
  }
}

function registryLookup(result: Awaited<ReturnType<AssetRegistryService['lookup']>>) {
  return { lookup: vi.fn(async () => result) }
}

test('resolves original order and carries unavailable or stand-in tools without execution filtering', async () => {
  const second = { ...definition, name: 'example:write', description: 'Write a document' }
  const lookup = vi
    .fn<AssetRegistryService['lookup']>()
    .mockResolvedValueOnce({ entry: entry({ kind: 'stand_in', for: [] }) })
    .mockResolvedValueOnce({
      entry: {
        ...entry({ kind: 'unavailable', reason: [] }),
        capability: { category: 'tool', name: second.name },
        content: { category: 'tool', definition: second },
      },
    })
  const result = await resolveCallTools(request({ tools: [toolName, modelName(second.name)] }), {
    lookup,
  })
  expect(result).toEqual({ tools: [modelEntry(definition), modelEntry(second)] })
  expect(lookup.mock.calls.map(call => call.slice(1, 4))).toEqual([
    ['tool', toolName, { kind: 'session' }],
    ['tool', modelName(second.name), { kind: 'session' }],
  ])
})

test('rejects duplicate names before any registry read, distinguishes absent from unreadable', async () => {
  const registry = registryLookup({ none: true })
  expect(await resolveCallTools(request({ tools: [toolName, toolName] }), registry)).toEqual({
    failure: 'invalidInput',
  })
  expect(registry.lookup).not.toHaveBeenCalled()
  expect(await resolveCallTools(request(), registry)).toEqual({
    failure: 'invalidInput',
    reason: 'unknownTool',
  })
  for (const failure of ['unavailable', 'sessionNotFound'] as const)
    expect(await resolveCallTools(request(), registryLookup({ failure }))).toEqual({
      failure: 'unavailable',
    })
})

test('checks run, attempt and session report identity before lookup', async () => {
  const report = { session, runId: 'run_a', attempt: 1 } as unknown as AvailabilityReport
  const registry = registryLookup({ entry: entry() })
  const valid = request({ run: 'run_a', attempt: 1, report })
  expect(await resolveCallTools(valid, registry)).toEqual({ tools: [modelEntry(definition)] })
  expect(registry.lookup).toHaveBeenCalledWith(session, 'tool', toolName, {
    kind: 'run',
    report,
  })
  for (const invalid of [
    request({ run: 'run_a', attempt: 1 }),
    request({ report }),
    request({ run: 'run_a', report }),
    request({ run: 'run_b', attempt: 1, report }),
    request({ run: 'run_a', attempt: 2, report }),
    request({ run: 'run_a', attempt: 1, report: { ...report, session: 'session_other' } }),
  ]) {
    registry.lookup.mockClear()
    expect(await resolveCallTools(invalid, registry)).toEqual({ failure: 'invalidInput' })
    expect(registry.lookup).not.toHaveBeenCalled()
  }
})

test('rejects a registry entry whose definition does not match the requested model name', async () => {
  const mismatch = { ...entry(), capability: { category: 'tool' as const, name: 'other:read' } }
  await expect(resolveCallTools(request(), registryLookup({ entry: mismatch }))).rejects.toThrow(
    'invalid tool entry',
  )
})

test('each continuation resolves the supplied names against its own report', async () => {
  const old = { ...definition, description: 'Old definition' }
  const current = { ...definition, description: 'New definition' }
  const firstReport = { session, runId: 'run_a', attempt: 1 } as unknown as AvailabilityReport
  const nextReport = { session, runId: 'run_a', attempt: 2 } as unknown as AvailabilityReport
  const lookup = vi.fn<AssetRegistryService['lookup']>(
    async (_session, _category, _name, within) => {
      if (typeof within !== 'object' || within === null || !('report' in within))
        throw new Error('expected a report-scoped lookup')
      return {
        entry: {
          ...entry(),
          content: {
            category: 'tool',
            definition: within.report === firstReport ? old : current,
          },
        },
      }
    },
  )
  expect(
    await resolveCallTools(request({ run: 'run_a', attempt: 1, report: firstReport }), {
      lookup,
    }),
  ).toEqual({ tools: [modelEntry(old)] })
  expect(
    await resolveCallTools(request({ run: 'run_a', attempt: 2, report: nextReport }), {
      lookup,
    }),
  ).toEqual({ tools: [modelEntry(current)] })
  expect(lookup).toHaveBeenCalledTimes(2)
})

test('real registry preserves report snapshot and refuses an unreadable report instead of falling back to current', async () => {
  const references = [{ capability: tool }]
  const definitions = [
    {
      id: 'ast_root',
      capability: root,
      origin: 'official',
      versions: [
        {
          number: 1,
          content: {
            category: 'agent_definition',
            body: toOpaqueJson({ references, attributes: [] }),
          },
          publishedAt: now,
        },
      ],
    },
    {
      id: 'ast_read',
      capability: tool,
      origin: 'official',
      versions: [{ number: 1, content: { category: 'tool', definition }, publishedAt: now }],
    },
  ] as const
  const evaluated = evaluate({
    tenant,
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references,
      attributes: [],
      source: { asset: 'ast_root', version: 1 },
    },
    holdings: definitions.map(item => ({
      holder: { layer: 'factory' as const },
      capability: item.capability,
      asset: item.id,
      basis: { kind: 'official' as const },
      versionSelection: { kind: 'current' as const },
      immutable: false,
      assignments: [],
      since: now,
    })),
    definitions,
  })
  if (!('ok' in evaluated))
    throw new Error(`fixture evaluation failed: ${JSON.stringify(evaluated)}`)
  const built = buildTableContents(evaluated.ok, [tool], definitions)
  if (!('plans' in built)) throw new Error(`fixture table failed: ${JSON.stringify(built)}`)
  const content = copyJsonValue({
    evaluation: evaluated.ok,
    compositionOrder: [tool],
    filledBy: { kind: 'assembly' },
  })
  if (!('ok' in content)) throw new Error('fixture record content is not JSON')
  const record: Parameters<typeof buildSnapshots>[0] = {
    session,
    seq: 1,
    evaluationRef: unwrap(parseOpaqueIdentifier('given_tool', 'EvaluationRef')),
    evaluation: {
      kind: 'given',
      ref: unwrap(parseOpaqueIdentifier('given_tool', 'EvaluationRef')),
    },
    tables: Object.fromEntries(
      built.plans.map(plan => [plan.category, { filledAt: 1, composition: plan.composition }]),
    ),
    content: content.ok,
  }
  const snapshots = buildSnapshots(record, built.plans)
  const report = buildReport(session, 'run_a', 1, instant, snapshots, evaluated.ok, [], [])
  let historyReadable = true
  const manifest: RegistryDependencies['manifest'] = {
    async readHead() {
      return { head: 1, latest: Object.fromEntries(snapshots.map(s => [s.category, record])) }
    },
    async readHistory() {
      return historyReadable ? { record } : { failure: 'unavailable' }
    },
    async append() {
      throw new Error('lookup must never append')
    },
    async readGiven() {
      throw new Error('lookup must not read given')
    },
    async readEvaluation() {
      throw new Error('lookup must not read evaluation')
    },
    async dependencyPresence() {
      throw new Error('lookup must not read dependency presence')
    },
  }
  const registry = createAssetRegistry({
    manifest,
    clock: { now: () => instant },
    sessionTenancy: { holdingTenant: async () => ({ tenant }) },
    historicalBody: {
      read: async () => ({ version: definitions[1].versions[0] }),
    },
    deployedMeta: [],
    diagnostic: () => {},
    diagnosticFailure: () => {},
    monotonicNow: () => 0n,
    conflictPolicy: { maxRetries: 0 },
    maxInFlight: 1,
  })
  try {
    const scoped = request({ run: 'run_a', attempt: 1, report })
    expect(await resolveCallTools(scoped, registry)).toEqual({ tools: [modelEntry(definition)] })
    historyReadable = false
    expect(await resolveCallTools(scoped, registry)).toEqual({ failure: 'unavailable' })
  } finally {
    await registry.close()
  }
})
