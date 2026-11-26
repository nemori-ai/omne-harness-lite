import type { AcceptedInput, OriginalInputAcceptance } from '@omne-harness/agent-contract'
import type { InputId } from '@omne-harness/session-contract'
import {
  admittedMessageDigest,
  type SessionAdmittedInput,
} from '@omne-harness/session-storage-sql/participants'

/** What a check asks Session about one input the Agent holds; null when the input names no source. */
export function admittedInput(value: AcceptedInput): SessionAdmittedInput | null {
  return value.source === null
    ? null
    : {
        input: String(value.id) as InputId,
        origin: value.source,
        messageDigest: admittedMessageDigest(value.content),
      }
}

export function openedInputs(
  originals: readonly OriginalInputAcceptance[],
): readonly [SessionAdmittedInput, ...SessionAdmittedInput[]] | null {
  const admitted: SessionAdmittedInput[] = []
  for (const { entry } of originals) {
    const one = admittedInput(entry.kind === 'invoke' ? entry.initial : entry.value)
    if (one === null) return null
    admitted.push(one)
  }
  const [first, ...rest] = admitted
  return first === undefined ? null : [first, ...rest]
}
