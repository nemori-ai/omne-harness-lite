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

/** What the facade dropped itself, before the port: by reason, never by record. */
export type TelemetryDropped = Readonly<{
  /** No tenant on the event: such a record is never scoped to `system` (TC-4). */
  invalid: number
  /** The open-segment table was full. */
  capacity: number
}>

export type AgentTelemetryBase = Readonly<{
  /** The instance of the binding: the row or process that runs this Agent runtime. */
  instance: OwnedRef
  /** The most segments open at once. A start over it is dropped and counted (G7). */
  maxOpenSegments: number
}>

export type AgentTelemetry = Readonly<{
  measure: AgentMeasure
  dropped(): TelemetryDropped
}>

/**
 * Creates the facade. Every record is bound on its own, because the scope of a binding cannot be
 * patched (TC-15) and each event names its own tenant. Throws TypeError for a `maxOpenSegments`
 * that is not a positive integer; nothing else here throws.
 */
export function createAgentTelemetry(
  port: TelemetryPort,
  base: AgentTelemetryBase,
): AgentTelemetry {
  const { instance, maxOpenSegments } = base
  if (!Number.isSafeInteger(maxOpenSegments) || maxOpenSegments < 1)
    throw new TypeError('agent telemetry: maxOpenSegments is a positive integer')
  const open = new Map<number, Segment>()
  const dropped = { invalid: 0, capacity: 0 }

  /** The binding of one record, or undefined for a tenant that legal-identity did not mint. */
  function bindingOf(tenant: TenantId, execution: AgentExecutionId): Binding | undefined {
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
    if (event.tenant === undefined) {
      dropped.invalid += 1
      return
    }
    if (open.size >= maxOpenSegments) {
      dropped.capacity += 1
      return
    }
    const binding = bindingOf(event.tenant, event.execution)
    if (binding === undefined) {
      dropped.invalid += 1
      return
    }
    const segment = port.bind(binding).startSegment(agentPassSegments[event.pass])
    // A dropped start is the provider's count; there is nothing to pair the end with.
    if (isSegment(segment)) open.set(event.span, segment)
  }

  /** An end without an open start (dropped, or over the limit) ends nothing and counts nothing. */
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
    dropped: () => ({ ...dropped }),
  })
}
