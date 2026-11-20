export type LoadFailureChoice = 'reload' | 'close'
export type UnresponsiveChoice = 'wait' | 'reload' | 'close'

/** The utility process as recovery sees it: `failed` is a start that did not reach ready. */
export type UtilityState = 'starting' | 'ready' | 'failed'

export type RecoveryActions = Readonly<{
  reload(): void
  close(): void
  /** The question closes itself when the signal aborts; its answer is then ignored. */
  askLoadFailed(signal: AbortSignal): Promise<LoadFailureChoice>
  askUnresponsive(signal: AbortSignal): Promise<UnresponsiveChoice>
}>

export type Recovery = Readonly<{
  failed(): void
  unresponsive(): void
  responsive(): void
  utility(state: UtilityState): void
}>

export const RELOAD_CYCLE_MS = 30_000

type Question = Readonly<{ kind: 'load' | 'hung'; controller: AbortController }>

/** One automatic reload per run of failures, then ask; every reload waits for a ready utility. */
export function createRecovery(
  actions: RecoveryActions,
  now: () => number,
  utility: UtilityState = 'ready',
): Recovery {
  let reloadedAt: number | undefined
  let question: Question | undefined
  let queued: 'auto' | 'manual' | undefined

  function reload(kind: 'auto' | 'manual'): void {
    if (utility !== 'ready') {
      queued = kind
      return
    }
    queued = undefined
    if (kind === 'auto') reloadedAt = now()
    actions.reload()
  }

  function close(): void {
    queued = undefined
    actions.close()
  }

  function dismiss(kind: Question['kind']): void {
    if (question?.kind !== kind) return
    question.controller.abort()
    question = undefined
  }

  function ask<Choice extends string>(
    kind: Question['kind'],
    asked: (signal: AbortSignal) => Promise<Choice>,
    act: (choice: Choice) => void,
  ): void {
    const controller = new AbortController()
    const current: Question = { kind, controller }
    question = current
    void asked(controller.signal).then(
      choice => {
        if (question !== current) return
        question = undefined
        act(choice)
      },
      () => {
        if (question === current) question = undefined
      },
    )
  }

  function askLoadFailed(): void {
    ask('load', actions.askLoadFailed, choice =>
      choice === 'reload' ? reload('manual') : close(),
    )
  }

  return {
    failed() {
      dismiss('hung')
      if (question !== undefined || queued !== undefined) return
      const at = now()
      if (reloadedAt === undefined || at - reloadedAt >= RELOAD_CYCLE_MS) return reload('auto')
      askLoadFailed()
    },
    unresponsive() {
      if (question !== undefined) return
      ask('hung', actions.askUnresponsive, choice => {
        if (choice === 'reload') reload('manual')
        else if (choice === 'close') close()
      })
    },
    responsive() {
      dismiss('hung')
    },
    utility(state) {
      utility = state
      if (queued === undefined) return
      if (state === 'ready') return reload(queued)
      if (state !== 'failed') return
      // The utility process could not start: the wait has no known end, so the person decides.
      queued = undefined
      if (question === undefined) askLoadFailed()
    },
  }
}
