import type { SessionLogObservation } from './projection.ts'
import type { WorkSnapshot } from './values.ts'
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
import { equalValue, evidenceFields, nonempty, unavailableAt } from './session-validation.ts'

/** The original event is already committed; validate identity without restoring old mutable state. */
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
        if (prior === undefined) unavailableAt('registration.original')
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
        if (prior === undefined) unavailableAt('association.registration')
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
          if (prior === undefined) unavailableAt('result.original')
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
          if (prior === undefined) unavailableAt('waiting.registration')
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
