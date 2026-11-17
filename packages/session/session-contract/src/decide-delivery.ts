import { encodeEntry } from './entries.ts'
import type { DeliveredInputs } from './faces.ts'
import { entries, invalid, rejected } from './decision-support.ts'
import { inputsToDeliver } from './intake.ts'
import { judgeAdvance, type Decision, type EncodedEntry } from './judgments.ts'
import type { Participation, WorkSnapshot } from './values.ts'

// A step took a batch: each input `inputsToDeliver` names gets one delivery. The model view
// holds an input from here on, not from its acceptance.
export function decideDelivery(
  snapshot: WorkSnapshot,
  participation: Participation,
  value: DeliveredInputs,
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
  const known = new Set([...snapshot.pending, ...(snapshot.taken ?? [])])
  const named = value.deliveries.map(delivery => delivery.input)
  if (named.length === 0 || new Set(named).size !== named.length)
    return invalid('value.deliveries', 'empty, or an input named twice')
  if (inputsToDeliver(snapshot, named).length !== named.length)
    return rejected({ kind: 'changed', revision: snapshot.revision })
  const out: EncodedEntry[] = []
  for (const { input, message } of value.deliveries) {
    if (!known.has(input)) return invalid('value.deliveries', 'not an input this Run can take')
    if (message.role !== 'user' && message.role !== 'system_reminder')
      return invalid('value.deliveries', 'not the message of an input')
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
