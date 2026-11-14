import { tenantScope, type TenantId } from '@omne-harness/legal-identity'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import {
  defineSegment,
  isSegment,
  type Binding,
  type OwnedRef,
  type Segment,
  type SegmentDefinition,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import type { AgentMeasure, AgentSegmentEvent } from './measure.ts'

const OWNER = 'agent'
const COMPONENT = 'agent'
const REF_OWNER = '@omne-harness/agent'

export const agentPassSegments: Readonly<Record<AgentSegmentEvent['pass'], SegmentDefinition>> =
  Object.freeze({
    accept: defineSegment({ owner: OWNER, name: 'omne.agent.pass.accept', version: 1 }),
    run: defineSegment({ owner: OWNER, name: 'omne.agent.pass.run', version: 1 }),
  })

export type AgentTelemetryBase = Readonly<{
  instance: OwnedRef
}>

export type AgentTelemetry = Readonly<{
  measure: AgentMeasure
}>

export function createAgentTelemetry(
  port: TelemetryPort,
  base: AgentTelemetryBase,
): AgentTelemetry {
  const { instance } = base
  const open = new Map<number, { segment: Segment; lifetime: { released: boolean } }>()

  function bindingOf(
    tenant: TenantId | undefined,
    execution: AgentExecutionId,
  ): Binding | undefined {
    if (tenant === undefined) return undefined
    try {
      return {
        scope: tenantScope(tenant),
        component: COMPONENT,
        instance,
        attempt: { owner: REF_OWNER, ref: execution },
      }
    } catch {
      return undefined
    }
  }

  function start(event: Extract<AgentSegmentEvent, { phase: 'start' }>): void {
    const definition = agentPassSegments[event.pass]
    const binding = bindingOf(event.tenant, event.execution)
    if (binding === undefined) {
      port.discard(definition, 'invalid')
      return
    }
    const lifetime = { released: false }
    const segment = port.bind(binding).startSegment(definition, {
      onRelease() {
        lifetime.released = true
        if (open.get(event.span)?.lifetime === lifetime) open.delete(event.span)
      },
    })
    if (isSegment(segment) && !lifetime.released) open.set(event.span, { segment, lifetime })
  }

  function end(event: Extract<AgentSegmentEvent, { phase: 'end' }>): void {
    const entry = open.get(event.span)
    if (entry === undefined) return
    open.delete(event.span)
    entry.segment.end(event.outcome)
  }

  return Object.freeze({
    measure: event => {
      if (event.phase === 'start') start(event)
      else end(event)
    },
  })
}
