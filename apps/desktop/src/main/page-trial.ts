import { beginSupervision, supervise, type SuperviseConfig } from '@omne-harness/assembly'
import type { Told } from '@omne-harness/assembly-cordis'

/** What became of one load of the page: it rendered, or why it did not. */
export type Mount = 'mounted' | 'load-failed' | 'renderer-gone' | 'not-mounted' | 'closed'

export type TrialOutcome =
  | Readonly<{ kind: 'settled' | 'no-fallback' | 'superseded' | 'closed' }>
  | Readonly<{ kind: 'went-back'; to: string; falls: number }>

export type TrialDeps = Readonly<{
  watch(): Promise<Mount>
  /** After a mount: whether the page stayed up for the stable time. */
  stable(): Promise<boolean>
  reload(): void
  after(ms: number): Promise<void>
  tell(kind: 'settled' | 'fell-to-limit'): Told
  config: SuperviseConfig
}>

/** A version switched to, until it settles or falls to the limit: a load that does not render or stay up is one fall. */
export async function runTrial(deps: TrialDeps): Promise<TrialOutcome> {
  let state = beginSupervision().state
  for (;;) {
    const mount = await deps.watch()
    if (mount === 'closed') return { kind: 'closed' }
    if (mount === 'mounted' && (await deps.stable())) {
      const told = deps.tell('settled')
      return { kind: told.outcome === 'superseded' ? 'superseded' : 'settled' }
    }
    const step = supervise(state, { kind: 'exited', code: 1 }, deps.config)
    state = step.state
    if (state.kind === 'held') {
      const told = deps.tell('fell-to-limit')
      const to = told.pointer?.current
      if (told.outcome === 'rolled-back' && to !== undefined)
        return { kind: 'went-back', to, falls: state.falls }
      return { kind: told.outcome === 'superseded' ? 'superseded' : 'no-fallback' }
    }
    const wait = step.actions.find(action => action.kind === 'wait')
    await deps.after(wait?.kind === 'wait' ? wait.ms : 0)
    state = supervise(state, { kind: 'waited' }, deps.config).state
    deps.reload()
  }
}
