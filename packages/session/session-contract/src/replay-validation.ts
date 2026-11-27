import type { SessionLogObservation } from './projection.ts'
import type { RunEnd, WorkSnapshot } from './values.ts'
import {
  CallConflict,
  associated,
  legacyRegistration,
  registeredWaiting,
  validateBinding,
  validateRegistration,
  validateResult,
} from './call-state.ts'
import { validateControlIdentity } from './control-state.ts'
import { equalValue, evidenceFields, invalidAt, missingAt, nonempty } from './session-validation.ts'

const CONCLUSIONS: ReadonlySet<string> = new Set(['complete', 'fail', 'cancelled'])
const KINDS_WITHOUT_DETAIL: ReadonlySet<string> = new Set([
  'request-rejected',
  'compaction-invalid',
  'compaction-failed',
  'message-rejected',
  'extension-stop',
  'guard',
])

const textOrNull = (value: unknown, field: string): void => {
  if (value !== null && typeof value !== 'string') invalidAt(field, 'expected text or null')
}

function validateRunEnd(end: RunEnd): void {
  if (!CONCLUSIONS.has(end.conclusion)) invalidAt('ended.end.conclusion', 'not a conclusion')
  const { failure } = end
  if (failure === null) return
  switch (failure.kind) {
    case 'node-failed':
      nonempty(failure.node, 'ended.end.failure.node')
      nonempty(failure.category, 'ended.end.failure.category')
      nonempty(failure.failureKind, 'ended.end.failure.failureKind')
      if (failure.diagnostic !== undefined)
        nonempty(failure.diagnostic, 'ended.end.failure.diagnostic')
      return
    case 'model-refused':
      nonempty(failure.failure, 'ended.end.failure.failure')
      return
    case 'no-reply':
      textOrNull(failure.cause, 'ended.end.failure.cause')
      textOrNull(failure.upstreamStatus, 'ended.end.failure.upstreamStatus')
      textOrNull(failure.diagnostic, 'ended.end.failure.diagnostic')
      if (failure.throttled !== undefined && failure.throttled !== true)
        invalidAt('ended.end.failure.throttled', 'not true')
      return
    case 'cannot-fit':
      nonempty(failure.reason, 'ended.end.failure.reason')
      return
    default:
      if (!KINDS_WITHOUT_DETAIL.has(failure.kind)) invalidAt('ended.end.failure.kind', 'unknown')
  }
}

export function validateReplayedConsequences(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
): void {
  for (const consequence of observation.consequences) {
    switch (consequence.kind) {
      case 'call-registration': {
        nonempty(consequence.consumption, 'consumption')
        validateRegistration(snapshot, consequence.registration, observation.run)
        const prior = snapshot.callRegistrations?.find(
          item => item.consumption === consequence.consumption,
        )
        if (prior === undefined) missingAt('registration.original')
        let original = prior.registration
        if (
          consequence.registration.kind === 'tool-intent' &&
          prior.registration.kind === 'associated' &&
          prior.registration.binding.producer.kind === 'tool' &&
          prior.association !== null
        ) {
          const { producer: _producer, ...fields } = prior.registration.binding
          original = { kind: 'tool-intent', ...fields, purpose: 'action' }
        } else if (prior.association !== null) throw new CallConflict('registration.association')
        if (!equalValue(original, consequence.registration)) throw new CallConflict('registration')
        break
      }
      case 'call-association': {
        validateBinding(snapshot, consequence.binding, observation.run)
        evidenceFields(consequence.source, 'association.source')
        const prior = snapshot.callRegistrations?.find(
          item => item.consumption === consequence.consumption,
        )
        if (prior === undefined) missingAt('association.registration')
        if (
          !equalValue(prior.registration, associated(consequence.binding, 'action')) ||
          !equalValue(prior.association, consequence.source)
        )
          throw new CallConflict('association')
        break
      }
      case 'call':
      case 'producer': {
        validateBinding(snapshot, consequence.binding, observation.run)
        legacyRegistration(snapshot, consequence.consumption, consequence.binding)
        if (consequence.kind === 'producer' && consequence.result !== null) {
          validateResult(consequence.binding, consequence.result)
          const prior = snapshot.consumptions
            .find(item => item.id === consequence.consumption)
            ?.results.find(item => item.result.version === consequence.result?.version)
          if (prior === undefined) missingAt('result.original')
          if (!equalValue(prior.result, consequence.result)) throw new CallConflict('result')
        }
        break
      }
      case 'registered-waiting':
        registeredWaiting({ ...snapshot }, observation.run, consequence.calls, consequence.other)
        break
      case 'waiting': {
        const calls = consequence.waiting.flatMap(wait => {
          if (wait.kind !== 'producer') return []
          const prior = snapshot.callRegistrations?.find(
            item =>
              item.registration.kind === 'associated' &&
              equalValue(item.registration.binding, wait.binding),
          )
          if (prior === undefined) missingAt('waiting.registration')
          return [{ consumption: prior.consumption, position: wait.position }]
        })
        registeredWaiting(
          { ...snapshot },
          observation.run,
          calls,
          consequence.waiting.filter(wait => wait.kind !== 'producer'),
        )
        break
      }
      case 'control':
        validateControlIdentity(snapshot, consequence.progress)
        break
      case 'ended':
        evidenceFields(consequence.disposition, 'ended.disposition')
        if (consequence.cause !== null) evidenceFields(consequence.cause, 'ended.cause')
        if (consequence.end !== null) validateRunEnd(consequence.end)
        break
      case 'input-taken':
      case 'observed':
        break
      default: {
        const exhaustive: never = consequence
        return exhaustive
      }
    }
  }
}
