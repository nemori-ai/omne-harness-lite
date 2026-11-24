import {
  bareChord,
  chordOf,
  keymapOf,
  resolveKey,
  type ActionItem,
  type KeyView,
} from '@omne-harness/shell-contract'
import { blockingOverlay, ownsTyping } from '@omne-harness/ui-kit'
import type { KeyTarget } from './size.ts'

export type ActionKeys = Readonly<{
  actions: () => readonly ActionItem[]
  changes?: () => Readonly<Record<string, string | null>>
  mac: boolean
  refused?: (action: ActionItem, reason: string) => void
  failed?: (action: ActionItem, error: unknown) => void
  leave?: () => void
}>

type Outcomes = Pick<ActionKeys, 'refused' | 'failed'>

/** Runs one action the way every trigger does: asks first, tells why not, and reports a failure. */
export function runAction(action: ActionItem, outcomes: Outcomes): boolean {
  const can = action.available()
  if (can !== true) {
    outcomes.refused?.(action, can)
    return false
  }
  try {
    const done = action.run()
    if (done instanceof Promise) done.catch((error: unknown) => outcomes.failed?.(action, error))
  } catch (error) {
    outcomes.failed?.(action, error)
  }
  return true
}

function viewOf(event: KeyboardEvent): KeyView {
  return {
    composing: event.isComposing === true,
    overlay: typeof document !== 'undefined' && blockingOverlay() !== undefined,
    typing: event.target != null && ownsTyping(event.target),
  }
}

/** One listener in the bubble phase: what a page or control took is not looked at again. */
export function bindActionKeys(target: KeyTarget, keys: ActionKeys): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    const chord = chordOf(event, keys.mac)
    if (chord === null) return
    const actions = keys.actions()
    const keymap = keymapOf(actions, keys.changes?.(), keys.mac)
    const answer = resolveKey(keymap, chord, viewOf(event))
    if (answer.kind === 'leave') {
      event.preventDefault()
      keys.leave?.()
      return
    }
    if (answer.kind !== 'action') return
    const action = actions.find(item => item.id === answer.action)
    if (action === undefined) return
    if (bareChord(chord) && action.available() !== true) return
    event.preventDefault()
    if (event.repeat === true && action.repeat !== true) return
    runAction(action, keys)
  }
  target.addEventListener('keydown', onKey)
  return () => target.removeEventListener('keydown', onKey)
}
