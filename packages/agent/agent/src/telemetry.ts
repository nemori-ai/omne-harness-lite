// The projection of the measurement events onto the telemetry port (SPEC「遥测投影」). Whoever
// assembles the runtime builds this facade over the port of the provider and hands `measure` to
// the factory. The facade keeps no clock: the provider times a segment between `startSegment` and
// `end`. It depends on the root entry of telemetry-contract only, never on a provider or on Cordis.
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
/** The owner of the reference this facade writes: the execution as attempt. */
const REF_OWNER = '@omne-harness/agent'

/** One pass of work for one execution (SPEC「测量事件」): the acceptance, or one drive. */
export const agentPassSegments: Readonly<Record<AgentSegmentEvent['pass'], SegmentDefinition>> =
  Object.freeze({
    accept: defineSegment({ owner: OWNER, name: 'omne.agent.pass.accept', version: 1 }),
    run: defineSegment({ owner: OWNER, name: 'omne.agent.pass.run', version: 1 }),
  })

export type AgentTelemetryBase = Readonly<{
  /** The instance of the binding: the row or process that runs this Agent runtime. */
  instance: OwnedRef
}>

export type AgentTelemetry = Readonly<{
  measure: AgentMeasure
}>

/**
 * Creates the facade. Every record is bound on its own, because the scope of a binding cannot be
 * patched (TC-15) and each event names its own tenant. A pass without a tenant is handed to
 * `port.discard` as `invalid` (TC-4), so the provider counts it. Nothing here throws.
 *
 * The open-segment table holds only the segments the provider admitted, and the provider admits a
 * start only within its own `maxOpenSegments`, so the table never grows past the provider's bound.
 */
export function createAgentTelemetry(
  port: TelemetryPort,
  base: AgentTelemetryBase,
): AgentTelemetry {
  const { instance } = base
  const open = new Map<number, Segment>()

  /** The binding of one record, or undefined for a tenant that legal-identity did not mint. */
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
    const segment = port.bind(binding).startSegment(definition)
    // A dropped start is the provider's count; there is nothing to pair the end with.
    if (isSegment(segment)) open.set(event.span, segment)
  }

  /** An end without an open start (dropped by the provider, or never started) ends nothing. */
  function end(event: Extract<AgentSegmentEvent, { phase: 'end' }>): void {
    const segment = open.get(event.span)
    if (segment === undefined) return
    open.delete(event.span)
    segment.end(event.outcome)
  }

  return Object.freeze({
    measure: event => {
      if (event.phase === 'start') start(event)
      else end(event)
    },
  })
}
