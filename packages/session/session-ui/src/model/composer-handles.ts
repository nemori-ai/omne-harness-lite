import type { SendHow } from './session-machine.ts'

/** One way to send what is written: as it comes, before the others, or after this run. */
export type SendWay = 'send' | SendHow

/** What the composer on show lets an action do: it stays the one owner of its words. */
export type ComposerHandle = Readonly<{
  session: string
  focus: () => void
  insert: (text: string) => void
  /** Sends what is written; answers why not when it cannot. */
  send: (way: SendWay) => true | string
}>

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
