import type { Message } from '@omne-harness/message'
import { encodeEntry } from './entries.ts'
import type { DeliveredInputs } from './faces.ts'
import { entries, invalid, rejected } from './decision-support.ts'
import type { InputId } from './identity.ts'
import { inputsToDeliver } from './intake.ts'
import { judgeAdvance, type DecideReads, type Decision, type EncodedEntry } from './judgments.ts'
import type { SessionCommand } from './ports.ts'
import type { Participation, WorkSnapshot } from './values.ts'

export function deliveryReads(
  command: SessionCommand,
  admitted: (input: InputId) => Message | undefined,
): Pick<DecideReads, 'delivered'> {
  if (command.kind !== 'recordMessage' || !('inputs' in command.input.value)) return {}
  return {
    delivered: command.input.value.inputs.flatMap(input => {
      const message = admitted(input)
      return message === undefined ? [] : [{ input, message }]
    }),
  }
}

// A step took a batch: each input `inputsToDeliver` names gets one delivery. The model view
// holds an input from here on, not from its acceptance.
export function decideDelivery(
  snapshot: WorkSnapshot,
  participation: Participation,
  value: DeliveredInputs,
  admitted: DecideReads['delivered'],
): Decision {
  if (participation.joint !== 'delivered')
    return invalid('participation.joint', 'not the delivery of a taken batch')
  const judgment = judgeAdvance(snapshot, {
    kind: 'participation',
    execution: participation.execution,
    joint: participation.joint,
  })
  if (judgment.kind === 'stale-advance')
    return invalid('participation.execution', 'not the execution of the active Run')
  if (judgment.kind !== 'ok') return rejected(judgment)
  const refused = refusedDelivery(snapshot, value.inputs)
  if (refused !== null) return refused
  const messages = new Map((admitted ?? []).map(item => [item.input, item.message]))
  const out: EncodedEntry[] = []
  for (const input of value.inputs) {
    const message = messages.get(input)
    if (message === undefined)
      return invalid('value.inputs', 'an input without the message Session admitted')
    out.push(
      encodeEntry(
        {
          kind: 'message.delivered',
          input,
          message,
          source: value.source,
          admission: value.admission,
          consumption: null,
          participation,
        },
        { owner: 'agent', via: 'agent-participant', source: value.source },
      ),
    )
  }
  return entries(out)
}

function refusedDelivery(snapshot: WorkSnapshot, named: readonly InputId[]): Decision | null {
  if (named.length === 0 || new Set(named).size !== named.length)
    return invalid('value.inputs', 'empty, or an input named twice')
  if (inputsToDeliver(snapshot, named).length !== named.length)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  const known = new Set([...snapshot.pending, ...(snapshot.taken ?? [])])
  return named.every(input => known.has(input))
    ? null
    : invalid('value.inputs', 'not an input this Run can take')
}
