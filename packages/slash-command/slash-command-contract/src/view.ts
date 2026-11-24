import type { Lookup } from './names.ts'
import { type Command, type Message, type Recognition, recognize } from './recognize.ts'

/** What the sender was shown: the command at the head, if any, and the full names referenced, first seen first. */
export type SenderView = Readonly<{ command: string | null; references: readonly string[] }>

export type Judgment =
  | Readonly<{ kind: 'accepted'; recognition: Message | Command; view: SenderView }>
  | Readonly<{ kind: 'refused'; reason: 'no-such-command'; name: string }>
  | Readonly<{ kind: 'refused'; reason: 'unavailable'; name: string; why: string }>
  | Readonly<{ kind: 'changed'; was: SenderView; now: SenderView }>

export function viewOf(recognition: Recognition): SenderView {
  if (recognition.kind === 'command') return { command: recognition.name, references: [] }
  if (recognition.kind === 'refused') return { command: null, references: [] }
  return {
    command: null,
    references: [...new Set(recognition.references.map(reference => reference.name))],
  }
}

export const sameView = (a: SenderView, b: SenderView): boolean =>
  a.command === b.command &&
  a.references.length === b.references.length &&
  a.references.every((name, at) => name === b.references[at])

/** The accepting side: recognize against the catalogue as it is now, then compare with what the sender was shown. */
export function judge(text: string, lookup: Lookup, shown?: SenderView): Judgment {
  const recognition = recognize(text, lookup)
  if (recognition.kind === 'refused')
    return recognition.reason === 'unavailable'
      ? { kind: 'refused', reason: 'unavailable', name: recognition.name, why: recognition.why }
      : { kind: 'refused', reason: 'no-such-command', name: recognition.name }
  const view = viewOf(recognition)
  if (shown !== undefined && !sameView(shown, view))
    return { kind: 'changed', was: shown, now: view }
  return { kind: 'accepted', recognition, view }
}
