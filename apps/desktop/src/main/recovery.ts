export type LoadFailureChoice = 'reload' | 'close'
export type UnresponsiveChoice = 'wait' | 'reload' | 'close'

export type RecoveryActions = Readonly<{
  reload(): void
  close(): void
  askLoadFailed(): Promise<LoadFailureChoice>
  askUnresponsive(): Promise<UnresponsiveChoice>
}>

export type Recovery = Readonly<{
  failed(): void
  unresponsive(): void
  responsive(): void
}>

export const RELOAD_CYCLE_MS = 30_000

/** One automatic reload per run of failures; a failure soon after it asks the person. */
export function createRecovery(actions: RecoveryActions, now: () => number): Recovery {
  let reloadedAt: number | undefined
  let asking = false
  let hung = false

  async function ask<Choice extends string>(
    question: () => Promise<Choice>,
    act: (choice: Choice) => void,
  ): Promise<void> {
    if (asking) return
    asking = true
    try {
      act(await question())
    } finally {
      asking = false
    }
  }

  return {
    failed() {
      const at = now()
      if (reloadedAt === undefined || at - reloadedAt >= RELOAD_CYCLE_MS) {
        reloadedAt = at
        return actions.reload()
      }
      void ask(actions.askLoadFailed, choice =>
        choice === 'reload' ? actions.reload() : actions.close(),
      )
    },
    unresponsive() {
      hung = true
      void ask(actions.askUnresponsive, choice => {
        if (!hung || choice === 'wait') return
        if (choice === 'reload') actions.reload()
        else actions.close()
      })
    },
    responsive() {
      hung = false
    },
  }
}
