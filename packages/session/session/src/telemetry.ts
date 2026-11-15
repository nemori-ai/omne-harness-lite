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
const REF_OWNER = '@omne-harness/session'
const SEGMENT_PREFIX = 'omne.session.'

export const SESSION_SEGMENT_DEFINITION_LIMIT = 64

const ROUND_OUTCOMES = ['completed', 'failed', 'cancelled', 'unknown'] as const
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

export const sessionDiagnosticEvent = defineEvent({
  owner: OWNER,
  name: 'omne.session.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    owner: { kind: 'enum', values: ['S1', 'C2'] },
    step: {
      kind: 'enum',
      values: [
        'read',
        'startRun',
        'replay',
        'invoke',
        'submit',
        'receive',
        'finishRun',
        'freeze',
        'detach',
        'claim',
        'resume',
      ],
    },
    reason: { kind: 'enum', values: DIAGNOSTIC_REASONS },
  },
})

export type SessionTelemetryBase = Readonly<{
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

// Bind each record on its own: the scope of a binding cannot be patched and each event names its own tenant.
export function createSessionTelemetry(
  port: TelemetryPort,
  base: SessionTelemetryBase,
): SessionTelemetry {
  const { instance } = base
  const open = new Map<number, { segment: Segment; lifetime: { released: boolean } }>()
  const definitions = new Map<string, SegmentDefinition>()

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

  function systemBinding(): Binding {
    return { scope: systemScope(), component: COMPONENT, instance }
  }

  function start(event: Extract<SessionSegmentEvent, { phase: 'start' }>): void {
    const { definition, checked } = definitionOf(event.operation)
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
    const lifetime = { released: false }
    const segment = port.bind(binding).startSegment(definition, {
      onRelease() {
        lifetime.released = true
        if (open.get(event.span)?.lifetime === lifetime) open.delete(event.span)
      },
    })
    if (isSegment(segment) && !lifetime.released) open.set(event.span, { segment, lifetime })
  }

  function end(event: Extract<SessionSegmentEvent, { phase: 'end' }>): void {
    const entry = open.get(event.span)
    if (entry === undefined) return
    open.delete(event.span)
    entry.segment.end(event.outcome)
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
