// The projection of the measurement events and the named diagnostics onto the telemetry port (SPEC
// 「遥测投影」). Whoever assembles the instance builds this facade over the port of the provider and
// hands `measure` and `diagnose` to the factory. The facade keeps no clock: the provider times a
// segment between `startSegment` and `end`. It depends on the root entry of telemetry-contract
// only, never on a provider or on Cordis.
import { systemScope, tenantScope, type TenantId } from '@omne-harness/legal-identity'
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
 * How many distinct operation names get a cached segment definition. The face operations are a
 * closed set well under this; the bound only keeps an unexpected name from growing the cache. An
 * operation over it gets its definition made again on each start.
 */
export const SESSION_SEGMENT_DEFINITION_LIMIT = 64

const ROUND_OUTCOMES = ['completed', 'failed', 'cancelled', 'unknown'] as const
/**
 * The reasons a diagnostic carries: this member's own four, then the closed failure kinds a Session
 * port answers (session-contract `SessionFailure`), so an `unavailable` stays `unavailable`.
 */
const DIAGNOSTIC_REASONS = [
  'retries-exhausted',
  'agent-absent',
  'clock-refused',
  'attempt-replaced',
  'archived',
  'changed',
  'commit-unknown',
  'conflict',
  'denied',
  'frozen',
  'invalid',
  'quarantined',
  'stale-advance',
  'terminal',
  'unavailable',
  'unsupported',
  'no-input',
  'run-active',
  'not-ready',
  'login-required',
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

export type SessionTelemetryBase = Readonly<{
  /** The instance of the binding: the row or process that runs this session instance. */
  instance: OwnedRef
}>

export type SessionTelemetry = Readonly<{
  measure: SessionMeasure
  diagnose: SessionDiagnose
}>

function roundOutcome(outcome: string | null): (typeof ROUND_OUTCOMES)[number] {
  return ROUND_OUTCOMES.find(known => known === outcome) ?? 'unknown'
}

function diagnosticReason(reason: string): (typeof DIAGNOSTIC_REASONS)[number] {
  return DIAGNOSTIC_REASONS.find(known => known === reason) ?? 'other'
}

/**
 * Creates the facade. Every record is bound on its own, because the scope of a binding cannot be
 * patched (TC-15) and each event names its own tenant. A segment of a system-scope read is a fact of
 * the service and is bound to the `system` scope. A record of tenant work without a tenant is handed
 * to `port.discard` as `invalid` (TC-4), so the provider counts it. Nothing here throws.
 *
 * The open-segment table holds only the segments the provider admitted, and the provider admits a
 * start only within its own `maxOpenSegments`, so the table never grows past the provider's bound.
 */
export function createSessionTelemetry(
  port: TelemetryPort,
  base: SessionTelemetryBase,
): SessionTelemetry {
  const { instance } = base
  const open = new Map<number, Segment>()
  const definitions = new Map<string, SegmentDefinition>()

  /** The binding of one record, or undefined for a tenant that legal-identity did not mint. */
  function bindingOf(
    tenant: TenantId | undefined,
    session: SessionId | null,
    run: RunId | null = null,
  ): Binding | undefined {
    if (tenant === undefined) return undefined
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

  /**
   * The segment definition of an operation, cached up to the limit. `checked` is false when the
   * contract refuses the name: the definition then only names the record for `discard`.
   */
  function definitionOf(
    operation: string,
  ): Readonly<{ definition: SegmentDefinition; checked: boolean }> {
    const known = definitions.get(operation)
    if (known !== undefined) return { definition: known, checked: true }
    const name = SEGMENT_PREFIX + operation
    try {
      const definition = defineSegment({ owner: OWNER, name, version: 1 })
      if (definitions.size < SESSION_SEGMENT_DEFINITION_LIMIT)
        definitions.set(operation, definition)
      return { definition, checked: true }
    } catch {
      return { definition: { signal: 'segment', owner: OWNER, name, version: 1 }, checked: false }
    }
  }

  /** The binding of a system-scope read: no tenant and no work, since such a read names no session. */
  function systemBinding(): Binding {
    return { scope: systemScope(), component: COMPONENT, instance }
  }

  function start(event: Extract<SessionSegmentEvent, { phase: 'start' }>): void {
    const { definition, checked } = definitionOf(event.operation)
    // An event that names both a tenant and the system scope is malformed: tenant work is never
    // relabelled as `system` (TC-4), so it is discarded like a record without a tenant.
    const binding =
      event.scope !== 'system'
        ? bindingOf(event.tenant, event.session)
        : event.tenant === undefined
          ? systemBinding()
          : undefined
    if (!checked || binding === undefined) {
      port.discard(definition, 'invalid')
      return
    }
    const segment = port.bind(binding).startSegment(definition)
    // A dropped start is the provider's count; there is nothing to pair the end with.
    if (isSegment(segment)) open.set(event.span, segment)
  }

  /** An end without an open start (dropped by the provider, or never started) ends nothing. */
  function end(event: Extract<SessionSegmentEvent, { phase: 'end' }>): void {
    const segment = open.get(event.span)
    if (segment === undefined) return
    open.delete(event.span)
    segment.end(event.outcome)
  }

  function roundComplete(event: SessionRoundCompleteEvent): void {
    const binding = bindingOf(event.tenant, event.session, event.run)
    if (binding === undefined) {
      port.discard(sessionRoundCompleteEvent, 'invalid')
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
      port.discard(sessionDiagnosticEvent, 'invalid')
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
  })
}
