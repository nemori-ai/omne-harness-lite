import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import { checkManifestAppendInput } from '@omne-harness-lite/assembly-manifest'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { isToolDefinition, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import {
  buildReport,
  buildSnapshots,
  buildTableContents,
  capability,
  effective,
  getAssetJudge,
  own,
  readRegistryRecord,
  readReport,
  refreshRun,
  requiredOwn,
  within,
  type Availability,
  type AvailabilityReport,
  type CommandAvailability,
} from '../src/index.ts'
import { fixture, root, tool, command, a, b } from './support.ts'

const ask = {
  category: 'tool',
  name: 'omne-official:Ask',
} satisfies AvailabilityReport['availability'][number]['capability']
const skill = {
  category: 'skill',
  name: 'example:reader',
} satisfies AvailabilityReport['skillGate'][number]
const dependency = { kind: 'external_service', name: 'read_service' }
const missing = { dependency, state: 'missing' }
const unreadable = { dependency, state: 'unreadable' }

function createReportFixture() {
  const f = fixture()
  const body = {
    name: ask.name,
    paradigm: 'multi',
    description: 'Ask for input',
    origin: { kind: 'authored' },
    permissions: { execute: { default: 'auto' } },
    commands: {
      request_approval: {
        description: 'Request approval',
        input: { type: 'object', properties: {}, additionalProperties: false },
      },
      request_input: {
        description: 'Request input',
        input: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  } satisfies ToolDefinition
  expect(isToolDefinition(body)).toBe(true)
  const definition = own(body)
  assert(definition !== undefined)
  const order = [b, ask, a, command]
  const references = order.map(id => ({
    capability: id,
    ...(id === ask ? { resident: true } : {}),
  }))
  const input: NonConnectorEvaluationInput = {
    ...f.input,
    root: { ...f.input.root, references },
    definitions: f.input.definitions.map(value => {
      if (value.capability.name === tool.name)
        return {
          ...value,
          capability: ask,
          versions: [
            {
              number: 1,
              publishedAt: '2026-09-27T00:00:00Z',
              content: { category: 'tool', definition },
            },
          ],
        }
      if (value.capability.name === root.name)
        return {
          ...value,
          versions: [
            {
              number: 1,
              publishedAt: '2026-09-27T00:00:00Z',
              content: {
                category: 'agent_definition',
                body: toOpaqueJson({ references, attributes: [] }),
              },
            },
          ],
        }
      return value
    }),
    holdings: f.input.holdings.map(value =>
      value.capability.name === tool.name ? { ...value, capability: ask } : value,
    ),
  }
  for (const value of input.definitions) {
    expect(getAssetJudge().judgeAssetValue('AssetDefinition', value)).toEqual({ ok: true })
  }
  expect(order.every(capability)).toBe(true)
  const evaluated = evaluate(input)
  assert('ok' in evaluated, JSON.stringify(evaluated))
  expect(effective(evaluated.ok)).toEqual(evaluated.ok)
  const built = buildTableContents(evaluated.ok, order, input.definitions)
  assert('plans' in built, JSON.stringify(built))
  const session = unwrap(parseOpaqueIdentifier('session_availability_report', 'SessionRef'))
  const ref = unwrap(parseOpaqueIdentifier('evaluation_availability_report', 'EvaluationRef'))
  const filledAt = unwrap(instantFromEpochMs(10))
  const computedAt = unwrap(instantFromEpochMs(20))
  const append = checkManifestAppendInput(session, 0, {
    evaluation: { kind: 'given', ref },
    tables: Object.fromEntries(
      built.plans.map(plan => [plan.category, { filledAt, composition: plan.composition }]),
    ),
    content: { evaluation: evaluated.ok, compositionOrder: order, filledBy: { kind: 'assembly' } },
  })
  assert('ok' in append, JSON.stringify(append))
  const checked = readRegistryRecord(
    { ...append.ok.record, session: append.ok.session, seq: 1, evaluationRef: ref },
    session,
    1,
  )
  assert(checked !== undefined)
  const snapshots = buildSnapshots(checked.record, built.plans)
  expect(
    snapshots.map(value => [value.category, value.filledAt, value.basedOn, value.filledBy]),
  ).toEqual([
    ['tool', 10, ref, { kind: 'assembly' }],
    ['skill', 10, ref, { kind: 'assembly' }],
    ['slash_command', 10, ref, { kind: 'assembly' }],
    ['loop_extension', 10, ref, { kind: 'assembly' }],
    ['mcp', 10, ref, { kind: 'assembly' }],
    ['plugin', 10, ref, { kind: 'assembly' }],
  ])
  const runId = 'run_availability_report'
  const attempt = 2
  expect(judgeAccountValue('RunId', runId)).toEqual({ ok: true })
  expect(judgeAccountValue('AttemptId', attempt)).toEqual({ ok: true })
  const report = buildReport(session, runId, attempt, computedAt, snapshots, evaluated.ok, [], [])
  return { report, session }
}

let cachedReportFixture: ReturnType<typeof createReportFixture> | undefined

function reportFixture() {
  cachedReportFixture ??= requiredOwn(createReportFixture())
  return cachedReportFixture
}

function withAvailability(report: AvailabilityReport, value: unknown) {
  return {
    ...report,
    availability: report.availability.map(item =>
      item.capability.name === ask.name ? { ...item, availability: value } : item,
    ),
  }
}

function withCommand(report: AvailabilityReport, value: unknown) {
  return {
    ...report,
    availability: report.availability.map(item =>
      item.capability.name === ask.name
        ? {
            ...item,
            commandAvailability: { request_approval: value, request_input: { kind: 'available' } },
          }
        : item,
    ),
  }
}

describe('complete availability reports', () => {
  it('preserves identified snapshots and attempt data through all public report readers', () => {
    const { report, session } = reportFixture()
    expect(report).toEqual({
      session,
      runId: 'run_availability_report',
      attempt: 2,
      computedAt: 20,
      snapshots: [
        { category: 'tool', filledAt: 10 },
        { category: 'skill', filledAt: 10 },
        { category: 'slash_command', filledAt: 10 },
        { category: 'loop_extension', filledAt: 10 },
        { category: 'mcp', filledAt: 10 },
        { category: 'plugin', filledAt: 10 },
      ],
      availability: [
        {
          capability: ask,
          availability: { kind: 'available' },
          commandAvailability: {
            request_approval: { kind: 'unavailable', reason: 'run_mode_unreadable' },
            request_input: { kind: 'available' },
          },
        },
        { capability: command, availability: { kind: 'available' } },
        { capability: b, availability: { kind: 'available' } },
        { capability: a, availability: { kind: 'available' } },
      ],
      mcpActions: [],
      endpointHoldings: [],
      skillGate: [],
      effectivePermissions: {
        'omne-official__Ask': {
          capability: ask,
          item: 'execute',
          value: { allowed: ['auto'] },
          from: 'factory',
          tenantAutoWritable: true,
        },
      },
    })
    const input = structuredClone({ ...report, availability: [...report.availability] })
    const read = readReport(input, session)
    expect(read).toEqual(report)
    assert(read !== undefined)
    expect(read).not.toBe(input)
    expect(read.availability).not.toBe(input.availability)
    expect(Object.isFrozen(read)).toBe(true)
    expect(Object.isFrozen(read.snapshots)).toBe(true)
    expect(Object.isFrozen(read.availability[0]?.commandAvailability?.request_approval)).toBe(true)
    expect(Object.isFrozen(read.effectivePermissions['omne-official__Ask'])).toBe(true)
    input.availability.splice(0)
    expect(read.availability).toHaveLength(4)
    expect(within({ kind: 'run', report }, session)).toEqual({ kind: 'run', report })
    expect(refreshRun({ kind: 'continue', runId: report.runId, report }, session)).toEqual({
      kind: 'continue',
      runId: report.runId,
      report,
    })
    expect(readReport(report, 'different_session')).toBeUndefined()
    expect(within({ kind: 'run', report }, 'different_session')).toBeUndefined()
    expect(
      refreshRun({ kind: 'continue', runId: 'different_run', report }, session),
    ).toBeUndefined()
  })
})

describe('availability variants', () => {
  const legal: readonly Availability[] = [
    { kind: 'available' },
    {
      kind: 'stand_in',
      for: [
        { dependency, state: 'missing' },
        { dependency: null, state: 'unreadable' },
      ],
    },
    { kind: 'unavailable', reason: [{ dependency, state: 'unreadable' }] },
  ]
  it.each(legal)('retains the complete $kind value', availability => {
    const { report, session } = reportFixture()
    const input = withAvailability(report, availability)
    expect(readReport(input, session)).toEqual(input)
  })

  const malformed: readonly { name: string; value: unknown }[] = [
    { name: 'non-object', value: null },
    { name: 'unknown kind', value: { kind: 'unknown' } },
    { name: 'missing kind', value: {} },
    { name: 'available with extra member', value: { kind: 'available', extra: true } },
    { name: 'stand-in without issues', value: { kind: 'stand_in' } },
    { name: 'unavailable without issues', value: { kind: 'unavailable' } },
    { name: 'stand-in with empty issues', value: { kind: 'stand_in', for: [] } },
    { name: 'unavailable with empty issues', value: { kind: 'unavailable', reason: [] } },
    { name: 'stand-in with wrong issue container', value: { kind: 'stand_in', for: {} } },
    {
      name: 'unavailable with wrong issue container',
      value: { kind: 'unavailable', reason: null },
    },
    {
      name: 'stand-in with extra member',
      value: { kind: 'stand_in', for: [missing], extra: true },
    },
    {
      name: 'unavailable with extra member',
      value: { kind: 'unavailable', reason: [unreadable], extra: true },
    },
    { name: 'issue without dependency', value: { kind: 'stand_in', for: [{ state: 'missing' }] } },
    { name: 'issue without state', value: { kind: 'unavailable', reason: [{ dependency }] } },
    {
      name: 'issue with extra member',
      value: { kind: 'stand_in', for: [{ ...missing, extra: true }] },
    },
    {
      name: 'unknown state string',
      value: { kind: 'unavailable', reason: [{ dependency, state: 'unknown' }] },
    },
    {
      name: 'mixed valid and invalid issues',
      value: { kind: 'stand_in', for: [missing, { dependency, state: 'unknown' }] },
    },
  ]
  it.each(malformed)('rejects $name', ({ value }) => {
    const { report, session } = reportFixture()
    expect(readReport(report, session)).toEqual(report)
    expect(readReport(withAvailability(report, value), session)).toBeUndefined()
  })
})

describe('command availability values', () => {
  const legal: readonly CommandAvailability[] = [
    { kind: 'available' },
    { kind: 'unavailable', reason: 'run_mode_never' },
    { kind: 'unavailable', reason: 'run_mode_unreadable' },
  ]
  it.each(legal)('retains $kind and its complete reason', value => {
    const { report, session } = reportFixture()
    const input = withCommand(report, value)
    expect(readReport(input, session)).toEqual(input)
  })
  const malformed: readonly { name: string; value: unknown }[] = [
    { name: 'non-object', value: null },
    { name: 'unknown kind', value: { kind: 'unknown' } },
    { name: 'missing kind', value: { reason: 'run_mode_never' } },
    { name: 'missing reason', value: { kind: 'unavailable' } },
    { name: 'unknown reason string', value: { kind: 'unavailable', reason: 'unknown' } },
    { name: 'available with reason', value: { kind: 'available', reason: 'run_mode_never' } },
    {
      name: 'unavailable with extra member',
      value: { kind: 'unavailable', reason: 'run_mode_never', extra: true },
    },
  ]
  it.each(malformed)('rejects $name', ({ value }) => {
    const { report, session } = reportFixture()
    expect(readReport(report, session)).toEqual(report)
    expect(readReport(withCommand(report, value), session)).toBeUndefined()
  })
})

describe('report entries and payload containers', () => {
  const malformedEntries: readonly { name: string; value: unknown }[] = [
    { name: 'non-object entry', value: null },
    {
      name: 'invalid capability',
      value: { capability: { category: 'tool', name: '' }, availability: { kind: 'available' } },
    },
    {
      name: 'unregistered capability category',
      value: { capability: root, availability: { kind: 'available' } },
    },
    {
      name: 'unknown capability category',
      value: {
        capability: { category: 'unknown', name: 'example:unknown' },
        availability: { kind: 'available' },
      },
    },
    {
      name: 'extra entry member',
      value: { capability: ask, availability: { kind: 'available' }, extra: true },
    },
    {
      name: 'non-tool command table',
      value: { capability: a, availability: { kind: 'available' }, commandAvailability: {} },
    },
    {
      name: 'array command table',
      value: { capability: ask, availability: { kind: 'available' }, commandAvailability: [] },
    },
    {
      name: 'null command table',
      value: { capability: ask, availability: { kind: 'available' }, commandAvailability: null },
    },
  ]
  it.each(malformedEntries)('rejects $name after admitting the complete report', ({ value }) => {
    const { report, session } = reportFixture()
    expect(readReport(report, session)).toEqual(report)
    expect(readReport({ ...report, availability: [value] }, session)).toBeUndefined()
  })

  const malformedPayloads: readonly { name: string; patch: object }[] = [
    { name: 'non-array availability', patch: { availability: {} } },
    { name: 'non-array skill gate', patch: { skillGate: {} } },
    { name: 'non-skill gate entry', patch: { skillGate: [tool] } },
    { name: 'invalid gate capability', patch: { skillGate: [{ category: 'skill', name: '' }] } },
    { name: 'duplicate gate capability', patch: { skillGate: [skill, skill] } },
    { name: 'non-array MCP actions', patch: { mcpActions: {} } },
    {
      name: 'unsupported nonempty MCP actions',
      patch: { mcpActions: [{ name: 'remote_action' }] },
    },
    { name: 'non-array endpoint holdings', patch: { endpointHoldings: {} } },
    { name: 'non-object permissions', patch: { effectivePermissions: null } },
    { name: 'array permissions', patch: { effectivePermissions: [] } },
  ]
  it.each(malformedPayloads)('rejects $name', ({ patch }) => {
    const { report, session } = reportFixture()
    expect(readReport(report, session)).toEqual(report)
    expect(readReport({ ...report, ...patch }, session)).toBeUndefined()
  })

  it('retains a valid skill gate and rejects duplicate availability identities', () => {
    const { report, session } = reportFixture()
    expect(capability(skill)).toBe(true)
    const gated = { ...report, skillGate: [skill] }
    expect(readReport(gated, session)).toEqual(gated)
    expect(refreshRun({ kind: 'continue', runId: report.runId, report: gated }, session)).toEqual({
      kind: 'continue',
      runId: report.runId,
      report: gated,
    })
    expect(
      readReport(
        { ...report, availability: [...report.availability, ...report.availability] },
        session,
      ),
    ).toBeUndefined()
  })
})
