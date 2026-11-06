// SPEC「测量事件」and「遥测投影」: the Agent segment names the tenant of the runtime binding, and the
// facade over the telemetry port turns each pass into a telemetry segment of that tenant with the
// execution as attempt. The port is the capturing double of telemetry-contract, so what it admits
// is what a provider would admit (TC-2, TC-4).
import { actingScopeEquals, tenantScope } from '@omne-harness/legal-identity'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { describe, expect, it, vi } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { agentPassSegments, createAgentTelemetry } from '../src/telemetry.ts'
import { execution, ok, tenantA } from './journal-support.ts'
import { eventsOf, invoke, loopAssembly } from './loop-support.ts'

const instance = { owner: '@omne-harness/harness-server', ref: 'agent-host' }

function facade(maxOpenSegments = 8) {
  const capture = createCapturingTelemetry()
  const telemetry = createAgentTelemetry(capture.port, { instance, maxOpenSegments })
  return { capture, telemetry }
}

/** The execution and, unless a case leaves it out, the tenant of the binding. */
function who(withTenant: boolean) {
  return withTenant ? { execution: execution(), tenant: tenantA } : { execution: execution() }
}

function start(
  span: number,
  pass: 'accept' | 'run' = 'accept',
  withTenant = true,
): AgentMeasureEvent {
  return { kind: 'segment', segment: 'agent', phase: 'start', span, pass, ...who(withTenant) }
}

function end(
  span: number,
  outcome: 'ok' | 'failure',
  pass: 'accept' | 'run' = 'accept',
  withTenant = true,
): AgentMeasureEvent {
  return {
    kind: 'segment',
    segment: 'agent',
    phase: 'end',
    span,
    pass,
    ...who(withTenant),
    outcome,
  }
}

describe('the tenant of the Agent segment', () => {
  it('every start and end carries the tenant of the binding', async () => {
    const events: AgentMeasureEvent[] = []
    const assembly = await loopAssembly([execution()], d => d, undefined, undefined, {
      measure: event => events.push(event),
    })
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    await vi.waitFor(() => {
      expect(events.filter(event => event.pass === 'run').at(-1)?.phase).toBe('end')
    })
    expect(events.length).toBeGreaterThanOrEqual(4)
    for (const event of events) expect(event.tenant).toBe(tenantA)
  })
})

describe('the Agent pass as a telemetry segment', () => {
  it('start and end become one segment named after the pass, scoped to the tenant, with the execution as attempt', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'accept'))
    telemetry.measure(end(1, 'ok', 'accept'))
    telemetry.measure(start(2, 'run'))
    telemetry.measure(end(2, 'failure', 'run'))
    const records = capture.records()
    expect(records.map(record => `${record.kind}:${record.definition.name}`)).toEqual([
      'segment-start:omne.agent.pass.accept',
      'segment-end:omne.agent.pass.accept',
      'segment-start:omne.agent.pass.run',
      'segment-end:omne.agent.pass.run',
    ])
    const [first, second] = records
    if (first?.kind !== 'segment-start' || second?.kind !== 'segment-end') throw new Error('shape')
    expect(first.definition).toBe(agentPassSegments.accept)
    expect(first.definition.owner).toBe('agent')
    expect(second.segment).toBe(first.segment)
    expect(second.outcome).toBe('ok')
    expect(first.binding.component).toBe('agent')
    expect(first.binding.instance).toEqual(instance)
    expect(first.binding.attempt).toEqual({ owner: '@omne-harness/agent', ref: 'exec-1' })
    expect(first.binding.work).toBeUndefined()
    expect(actingScopeEquals(first.binding.scope, tenantScope(tenantA))).toBe(true)
    expect(records[3]).toMatchObject({ kind: 'segment-end', outcome: 'failure' })
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
  })

  it('an event without a tenant makes no record and counts as invalid; it is never scoped to system', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1, 'accept', false))
    telemetry.measure(end(1, 'ok', 'accept', false))
    expect(capture.records()).toEqual([])
    expect(capture.dropped()).toBe(0)
    expect(telemetry.dropped()).toEqual({ invalid: 1, capacity: 0 })
  })

  it('the open-segment table is bounded: a start over the limit is dropped and counted, an end frees its entry', () => {
    const { capture, telemetry } = facade(1)
    telemetry.measure(start(1))
    telemetry.measure(start(2))
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 1 })
    telemetry.measure(end(2, 'ok'))
    telemetry.measure(end(1, 'ok'))
    telemetry.measure(start(3))
    telemetry.measure(end(3, 'failure'))
    expect(
      capture
        .records()
        .map(record => (record.kind === 'segment-end' ? record.outcome : record.kind)),
    ).toEqual(['segment-start', 'ok', 'segment-start', 'failure'])
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 1 })
  })

  it('refuses a maxOpenSegments that is not a positive integer', () => {
    const { capture } = facade()
    expect(() => createAgentTelemetry(capture.port, { instance, maxOpenSegments: 1.5 })).toThrow(
      TypeError,
    )
  })

  it('over the real runtime, one invoke is captured as the accept pass then the run passes of the tenant', async () => {
    const capture = createCapturingTelemetry()
    const telemetry = createAgentTelemetry(capture.port, { instance, maxOpenSegments: 16 })
    const assembly = await loopAssembly([execution()], d => d, undefined, undefined, {
      measure: telemetry.measure,
    })
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    await vi.waitFor(() => {
      const runs = capture
        .records()
        .filter(record => record.definition.name === 'omne.agent.pass.run')
      expect(runs.at(-1)?.kind).toBe('segment-end')
    })
    const names = capture.records().map(record => `${record.kind}:${record.definition.name}`)
    expect(names.slice(0, 3)).toEqual([
      'segment-start:omne.agent.pass.accept',
      'segment-end:omne.agent.pass.accept',
      'segment-start:omne.agent.pass.run',
    ])
    for (const record of capture.records()) {
      expect(actingScopeEquals(record.binding.scope, tenantScope(tenantA))).toBe(true)
      expect(record.binding.attempt).toEqual({ owner: '@omne-harness/agent', ref: 'exec-1' })
    }
    expect(telemetry.dropped()).toEqual({ invalid: 0, capacity: 0 })
  })
})
