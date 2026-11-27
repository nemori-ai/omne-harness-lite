import type { SayPhrase } from '@omne-harness/shell-contract'
import type { PhraseFeed } from './say-note.ts'

export type PhraseRelay = PhraseFeed & { bind(source: PhraseFeed): () => void }

const NONE: readonly SayPhrase[] = []

/** What the page reads the shell's phrases through: none until a shell binds them, none again once it is gone; a change of shell is told only when the phrases differ. */
export function phraseRelay(): PhraseRelay {
  let source: PhraseFeed | undefined
  let stop: () => void = () => undefined
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of Array.from(listeners)) listener()
  }
  const phrases = () => source?.phrases() ?? NONE
  const follow = (next: PhraseFeed | undefined) => {
    const was = JSON.stringify(phrases())
    stop()
    source = next
    stop = next?.watch(changed) ?? (() => undefined)
    if (JSON.stringify(phrases()) !== was) changed()
  }
  return {
    phrases,
    watch(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    bind(next) {
      follow(next)
      return () => {
        if (source === next) follow(undefined)
      }
    },
  }
}
