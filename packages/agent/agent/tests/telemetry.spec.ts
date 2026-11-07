// SPEC「测量事件」and「遥测投影」: the Agent segment names the tenant of the runtime binding, and the
// facade over the telemetry port turns each pass into a telemetry segment of that tenant with the
// execution as attempt. The port is the capturing double of telemetry-contract, so what it admits
// is what a provider would admit (TC-2, TC-4). A pass without a tenant goes to the port's
// `discard`, so the provider counts it; the test records each discard by name and reason.
import { actingScopeEquals, tenantScope } from '@omne-harness/legal-identity'
import type { Emitter, TelemetryPort } from '@omne-harness/telemetry-contract'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { describe, expect, it, vi } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { agentPassSegments, createAgentTelemetry } from '../src/telemetry.ts'
import { execution, ok, tenantA } from './journal-support.ts'
import { eventsOf, invoke, loopAssembly } from './loop-support.ts'

const instance = { owner: '@omne-harness/harness-server', ref: 'agent-host' }

/** The facade over the capturing double, with every `discard` the facade makes, by name and reason. */
function facade(options: Readonly<{ capacity?: number }> = {}) {
  const capture = createCapturingTelemetry(options)
  const discards: Array<readonly [string, string]> = []
  const port: TelemetryPort = {
    bind: binding => capture.port.bind(binding),
    discard: (definition, reason) => {
      discards.push([definition.name, reason])
      return capture.port.discard(definition, reason)
    },
  }
  const telemetry = createAgentTelemetry(port, { instance })
  return { capture, discards, telemetry }
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
    const { capture, discards, telemetry } = facade()
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
    expect(capture.dropped()).toBe(0)
    expect(discards).toEqual([])
  })

  it('a pass without a tenant is discarded through the port as invalid, under the segment it would have been; its end does nothing', () => {
    const { capture, discards, telemetry } = facade()
    telemetry.measure(start(1, 'run', false))
    telemetry.measure(end(1, 'ok', 'run', false))
    expect(capture.records()).toEqual([])
    expect(discards).toEqual([['omne.agent.pass.run', 'invalid']])
    expect(capture.dropped()).toBe(1)
  })

  it('a start the provider drops is not paired: its end ends nothing and counts nothing', () => {
    const { capture, telemetry } = facade({ capacity: 1 })
    telemetry.measure(start(1))
    telemetry.measure(start(2))
    expect(capture.dropped()).toBe(1)
    telemetry.measure(end(2, 'ok'))
    expect(capture.records().map(record => record.kind)).toEqual(['segment-start'])
    expect(capture.dropped()).toBe(1)
  })

  it('over the real runtime, one invoke is captured as the accept pass then the run passes of the tenant', async () => {
    const capture = createCapturingTelemetry()
    const telemetry = createAgentTelemetry(capture.port, { instance })
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
    expect(capture.dropped()).toBe(0)
  })
})

describe('provider release and measurement pairing', () => {
  it('does not restore a pair released before start returns', () => {
    const capture = createCapturingTelemetry()
    const endSegment = vi.fn()
    const port: TelemetryPort = {
      ...capture.port,
      bind(binding) {
        const emitter = capture.port.bind(binding)
        return {
          ...emitter,
          startSegment(definition, options) {
            const segment = emitter.startSegment(definition)
            options?.onRelease?.()
            return 'carrier' in segment ? { ...segment, end: endSegment } : segment
          },
        }
      },
    }
    const telemetry = createAgentTelemetry(port, { instance })
    telemetry.measure(start(1))
    telemetry.measure(end(1, 'ok'))
    expect(endSegment).not.toHaveBeenCalled()
  })

  it('an old release cannot remove the current pair of a reused measurement span', () => {
    const capture = createCapturingTelemetry()
    const releases: Array<NonNullable<Parameters<Emitter['startSegment']>[1]>> = []
    const port: TelemetryPort = {
      ...capture.port,
      bind(binding) {
        const emitter = capture.port.bind(binding)
        return {
          ...emitter,
          startSegment(definition, options) {
            releases.push(options ?? {})
            return emitter.startSegment(definition)
          },
        }
      },
    }
    const telemetry = createAgentTelemetry(port, { instance })
    telemetry.measure(start(1))
    telemetry.measure(start(1))
    releases[0]?.onRelease?.()
    telemetry.measure(end(1, 'ok'))
    const records = capture.records()
    expect(records).toHaveLength(3)
    expect(records[2]).toMatchObject({
      kind: 'segment-end',
      segment: records[1]?.kind === 'segment-start' ? records[1].segment : undefined,
    })
  })

  it('clear releases the pair so a late measurement end does not call a cleared segment', () => {
    const { capture, telemetry } = facade()
    telemetry.measure(start(1))
    capture.clear()
    telemetry.measure(end(1, 'ok'))
    expect(capture.records()).toEqual([])
    expect(capture.dropped()).toBe(0)
  })
})
