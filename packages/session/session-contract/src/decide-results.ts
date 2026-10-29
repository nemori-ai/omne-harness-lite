import { validateBinding, validateResult } from './call-state.ts'
import type { ConsumptionId } from './identity.ts'
import type { WorkSnapshot, ProducedResult } from './values.ts'
import type { SessionCommand } from './ports.ts'
import { judgeAdvance, type Decision } from './judgments.ts'
import { resultParticipationError } from './result-state.ts'
import { encodeEntry } from './entries.ts'
import {
  completeEvidence,
  entries,
  invalid,
  originOf,
  rejected,
  sourceOf,
} from './decision-support.ts'
import { digestOf } from './operations.ts'

export const consumptionIdOf = (binding: unknown): ConsumptionId =>
  `consumption_${digestOf(binding)}` as ConsumptionId

export function resultRefusal(
  snapshot: WorkSnapshot,
  consumption: ConsumptionId,
  result: ProducedResult,
  operation: SessionCommand['input']['operation'],
): Decision | null {
  const position = snapshot.consumptions.find(item => item.id === consumption)
  if (position === undefined || digestOf(position.binding.producer) !== digestOf(result.producer))
    return invalid('consumption', 'no matching producer binding')
  validateResult(position.binding, result)
  if (!result.version || !completeEvidence(result.source))
    return invalid('result', 'incomplete version or source')
  const prior = position.results.find(item => item.result.version === result.version)
  if (prior !== undefined && digestOf(prior.result) !== digestOf(result))
    return rejected({ kind: 'conflict', operation })
  return null
}

export function decideResults(snapshot: WorkSnapshot, command: SessionCommand): Decision {
  const source = sourceOf(command.input.operation, command.kind)
  if (command.kind === 'bindExternalCall') {
    if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
    if (command.input.expected !== snapshot.revision)
      return rejected({ kind: 'changed', revision: snapshot.revision })
    const { binding, qualification } = command.input
    validateBinding(snapshot, binding)
    if (
      !binding.producer.call ||
      !binding.action ||
      !completeEvidence(binding.request) ||
      !completeEvidence(qualification)
    )
      return invalid('binding', 'incomplete binding or qualification')
    const consumption = consumptionIdOf(binding)
    const prior = snapshot.consumptions.find(
      item => digestOf(item.binding.producer) === digestOf(binding.producer),
    )
    if (prior !== undefined && digestOf(prior.binding) !== digestOf(binding))
      return rejected({ kind: 'conflict', operation: command.input.operation })
    return entries([
      encodeEntry(
        {
          kind: 'call.bound',
          consumption,
          binding,
          reference: binding.producer.call,
          purpose: binding.producer.kind === 'model' ? 'main' : 'action',
        },
        originOf(source),
      ),
    ])
  }
  if (command.kind === 'preserveResult') {
    const { consumption, result, custody, participation } = command.input
    const refusal = resultRefusal(snapshot, consumption, result, command.input.operation)
    if (refusal !== null) return refusal
    if (!completeEvidence(custody) || (participation !== null && participation.joint !== 'custody'))
      return invalid('custody', 'incomplete custody or wrong participation')
    const position = snapshot.consumptions.find(item => item.id === consumption)
    if (position === undefined) return invalid('consumption', 'missing original binding')
    if (participation !== null) {
      const error = resultParticipationError(snapshot, position.binding, participation)
      if (error !== null) return invalid('participation', error)
    }
    const prior = position.results.find(item => item.result.version === result.version)
    if (prior?.custody != null && digestOf(prior.custody) !== digestOf(custody))
      return rejected({ kind: 'conflict', operation: command.input.operation })
    return entries([
      encodeEntry(
        { kind: 'call.result-preserved', consumption, result, custody, participation },
        originOf(custody),
      ),
    ])
  }
  if (command.kind === 'completeConsumption' || command.kind === 'completeExternalConsumption') {
    const { completion } = command.input
    const refusal = resultRefusal(
      snapshot,
      completion.consumption,
      completion.result,
      command.input.operation,
    )
    if (refusal !== null) return refusal
    const position = snapshot.consumptions.find(item => item.id === completion.consumption)
    if (position === undefined) return invalid('consumption', 'missing original binding')
    if (command.kind === 'completeExternalConsumption') {
      if (snapshot.lifecycle === 'archived') return rejected({ kind: 'archived' })
      if (command.input.expected !== snapshot.revision)
        return rejected({ kind: 'changed', revision: snapshot.revision })
      if (
        position.binding.initiatingAttempt !== null ||
        position.binding.consumer.position !== command.input.completion.position
      )
        return invalid('completion.position', 'not the original external consumption position')
      if (!completeEvidence(command.input.qualification))
        return invalid('qualification', 'incomplete evidence')
    } else {
      if (command.input.participation.joint !== 'processed')
        return invalid('participation', 'not a processed handover')
      const judgment = judgeAdvance(snapshot, {
        kind: 'participation',
        ...command.input.participation,
      })
      if (judgment.kind !== 'ok') return rejected(judgment)
      const error = resultParticipationError(
        snapshot,
        position.binding,
        command.input.participation,
      )
      if (error !== null) return invalid('participation', error)
    }
    const proof =
      command.kind === 'completeConsumption'
        ? command.input.completion.completion
        : command.input.completion.processing
    if (!completeEvidence(proof)) return invalid('completion', 'incomplete evidence')
    const prior = position.results.find(item => item.result.version === completion.result.version)
    if (prior?.completion != null && digestOf(prior.completion) !== digestOf(proof))
      return rejected({ kind: 'conflict', operation: command.input.operation })
    const out = [
      encodeEntry(
        {
          kind: 'call.result-processed',
          consumption: completion.consumption,
          result: completion.result,
          completion: proof,
          participation:
            command.kind === 'completeConsumption' ? command.input.participation : null,
          position:
            command.kind === 'completeExternalConsumption'
              ? command.input.completion.position
              : null,
        },
        originOf(proof),
      ),
    ]
    if (
      command.kind === 'completeExternalConsumption' &&
      prior?.completion == null &&
      command.input.completion.message !== null
    ) {
      const message = command.input.completion.message
      out.push(
        encodeEntry(
          {
            kind: `message.${message.role}`,
            message,
            source: proof,
            admission: command.input.qualification,
            consumption: completion.consumption,
            participation: null,
          },
          originOf(proof),
        ),
      )
    }
    return entries(out)
  }
  return invalid('command', 'not a result command')
}
