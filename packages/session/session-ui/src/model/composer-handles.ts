import type { SendHow } from './session-machine.ts'

/** One way to send what is written: as it comes, before the others, or after this run. */
export type SendWay = 'send' | SendHow

/** What the composer on show lets an action do: it stays the one owner of its words. */
export type ComposerHandle = Readonly<{
  session: string
  reachable: () => boolean
  focus: () => void
  insert: (text: string) => void
  send: (way: SendWay) => true | string
  /** Puts words at the start of what is written, for the person to go on. */
  write: (text: string) => void
  /** Sends these words as they are, leaving what is written alone. */
  say: (text: string) => void
}>

/** What other modules may do to the composer on show: each answers why not when none is open. */
export type SessionComposer = Readonly<{
  write: (text: string) => true | string
  say: (text: string) => true | string
}>

const NO_COMPOSER = '没有打开的输入框'

export function composerOf(handles: ComposerHandles): SessionComposer {
  const act = (use: (handle: ComposerHandle) => void, within: boolean) => (): true | string => {
    const handle = handles.current()
    if (handle === undefined || (within && !handle.reachable())) return NO_COMPOSER
    use(handle)
    return true
  }
  return {
    write: text => act(handle => handle.write(text), true)(),
    say: text => act(handle => handle.say(text), false)(),
  }
}

/** The composer on show, if any: the last one mounted wins, and leaving takes only itself away. */
export class ComposerHandles {
  #shown: ComposerHandle | undefined

  current(): ComposerHandle | undefined {
    return this.#shown
  }

  show(handle: ComposerHandle): () => void {
    this.#shown = handle
    return () => {
      if (this.#shown === handle) this.#shown = undefined
    }
  }
}
