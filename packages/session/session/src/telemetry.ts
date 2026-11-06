// The projection of the measurement events and the named diagnostics onto the telemetry port (SPEC
// 「遥测投影」). Whoever assembles the instance builds this facade over the port of the provider and
// hands `measure` and `diagnose` to the factory. The facade keeps no clock: the provider times a
// segment between `startSegment` and `end`. It depends on the root entry of telemetry-contract
// only, never on a provider or on Cordis.
import { tenantScope, type TenantId } from '@omne-harness/legal-identity'
import type { RunId, SessionId } from '@omne-harness/session-contract'
import {
  defineEvent,
  defineSegment,
  isSegment,
  type Binding,
  type OwnedRef,
  type Segment,
  type SegmentDefinition,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import type { SessionDiagnose, SessionDiagnostic } from './diagnostics.ts'
import type { SessionMeasure, SessionRoundCompleteEvent, SessionSegmentEvent } from './measure.ts'

const OWNER = 'session'
const COMPONENT = 'session'
/** The owner of every reference this facade writes: the session as work, the Run as attempt. */
const REF_OWNER = '@omne-harness/session'
const SEGMENT_PREFIX = 'omne.session.'

/**
 * How many distinct operation names get a segment definition. The face operations are a closed
 * set well under this; the bound only keeps an unexpected name from growing the cache.
 */
export const SESSION_SEGMENT_DEFINITION_LIMIT = 64

const ROUND_OUTCOMES = ['completed', 'failed', 'cancelled', 'unknown'] as const
const DIAGNOSTIC_REASONS = [
  'retries-exhausted',
  'agent-absent',
  'clock-refused',
  'attempt-replaced',
  'other',
] as const

/** A Run reached its terminal entry (SPEC「测量事件」round-complete). `attempt` is the Run. */
export const sessionRoundCompleteEvent = defineEvent({
  owner: OWNER,
  name: 'omne.session.round-complete',
  version: 1,
  level: 'info',
  schema: {
    outcome: { kind: 'enum', values: ROUND_OUTCOMES },
    operation: { kind: 'ref', owner: REF_OWNER, maxBytes: 128 },
  },
})

/** A coordinator step stopped on a failure (SPEC「诊断出口」). The detail text is not projected. */
export const sessionDiagnosticEvent = defineEvent({
  owner: OWNER,
  name: 'omne.session.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    owner: { kind: 'enum', values: ['S1', 'C2'] },
    step: {
      kind: 'enum',
      values: ['read', 'startRun', 'replay', 'invoke', 'receive', 'finishRun', 'freeze'],
    },
    reason: { kind: 'enum', values: DIAGNOSTIC_REASONS },
  },
})

/** What the facade dropped itself, before the port: by reason, never by record. */
export type TelemetryDropped = Readonly<{
  /** No tenant on the event (TC-4: such a record is never scoped to `system`), or a name the contract refuses. */
  invalid: number
  /** The open-segment table or the definition cache was full. */
  capacity: number
}>

export type SessionTelemetryBase = Readonly<{
  /** The instance of the binding: the row or process that runs this session instance. */
  instance: OwnedRef
  /** The most segments open at once. A start over it is dropped and counted (G7). */
  maxOpenSegments: number
}>

export type SessionTelemetry = Readonly<{
  measure: SessionMeasure
  diagnose: SessionDiagnose
  dropped(): TelemetryDropped
}>

function roundOutcome(outcome: string | null): (typeof ROUND_OUTCOMES)[number] {
  return ROUND_OUTCOMES.find(known => known === outcome) ?? 'unknown'
}

function diagnosticReason(reason: string): (typeof DIAGNOSTIC_REASONS)[number] {
  return DIAGNOSTIC_REASONS.find(known => known === reason) ?? 'other'
}

/**
 * Creates the facade. Every record is bound on its own, because the scope of a binding cannot be
 * patched (TC-15) and each event names its own tenant. Throws TypeError for a `maxOpenSegments`
 * that is not a positive integer; nothing else here throws.
 */
export function createSessionTelemetry(
  port: TelemetryPort,
  base: SessionTelemetryBase,
): SessionTelemetry {
  const { instance, maxOpenSegments } = base
  if (!Number.isSafeInteger(maxOpenSegments) || maxOpenSegments < 1)
    throw new TypeError('session telemetry: maxOpenSegments is a positive integer')
  const open = new Map<number, Segment>()
  const definitions = new Map<string, SegmentDefinition>()
  const dropped = { invalid: 0, capacity: 0 }

  /** The binding of one record, or undefined for a tenant that legal-identity did not mint. */
  function bindingOf(
    tenant: TenantId,
    session: SessionId | null,
    run: RunId | null = null,
  ): Binding | undefined {
    try {
      return {
        scope: tenantScope(tenant),
        component: COMPONENT,
        instance,
        ...(session === null ? {} : { work: { owner: REF_OWNER, ref: session } }),
        ...(run === null ? {} : { attempt: { owner: REF_OWNER, ref: run } }),
      }
    } catch {
      return undefined
    }
  }

  /** The segment definition of an operation, made once per name; undefined when dropped. */
  function definitionOf(operation: string): SegmentDefinition | undefined {
    const known = definitions.get(operation)
    if (known !== undefined) return known
    if (definitions.size >= SESSION_SEGMENT_DEFINITION_LIMIT) {
      dropped.capacity += 1
      return undefined
    }
    try {
      const definition = defineSegment({
        owner: OWNER,
        name: SEGMENT_PREFIX + operation,
        version: 1,
      })
      definitions.set(operation, definition)
      return definition
    } catch {
      dropped.invalid += 1
      return undefined
    }
  }

  function start(event: Extract<SessionSegmentEvent, { phase: 'start' }>): void {
    if (event.tenant === undefined) {
      dropped.invalid += 1
      return
    }
    const definition = definitionOf(event.operation)
    if (definition === undefined) return
    if (open.size >= maxOpenSegments) {
      dropped.capacity += 1
      return
    }
    const binding = bindingOf(event.tenant, event.session)
    if (binding === undefined) {
      dropped.invalid += 1
      return
    }
    const segment = port.bind(binding).startSegment(definition)
    // A dropped start is the provider's count; there is nothing to pair the end with.
    if (isSegment(segment)) open.set(event.span, segment)
  }

  /** An end without an open start (dropped, or over the limit) ends nothing and counts nothing. */
  function end(event: Extract<SessionSegmentEvent, { phase: 'end' }>): void {
    const segment = open.get(event.span)
    if (segment === undefined) return
    open.delete(event.span)
    segment.end(event.outcome)
  }

  function roundComplete(event: SessionRoundCompleteEvent): void {
    const binding =
      event.tenant === undefined ? undefined : bindingOf(event.tenant, event.session, event.run)
    if (binding === undefined) {
      dropped.invalid += 1
      return
    }
    port.bind(binding).event(sessionRoundCompleteEvent, {
      outcome: roundOutcome(event.outcome),
      operation: event.operation,
    })
  }

  function diagnose(diagnostic: SessionDiagnostic): void {
    const binding = bindingOf(diagnostic.tenant, diagnostic.session, diagnostic.run)
    if (binding === undefined) {
      dropped.invalid += 1
      return
    }
    port.bind(binding).event(sessionDiagnosticEvent, {
      owner: diagnostic.owner,
      step: diagnostic.step,
      reason: diagnosticReason(diagnostic.reason),
    })
  }

  return Object.freeze({
    measure: event => {
      if (event.kind === 'round-complete') roundComplete(event)
      else if (event.phase === 'start') start(event)
      else end(event)
    },
    diagnose,
    dropped: () => ({ ...dropped }),
  })
}
