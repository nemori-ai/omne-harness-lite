import type { SwapWay } from './impact.ts'

/** Where one row stands under supervision once the process serves. */
export type RowStanding = 'serving' | 'waiting' | 'starting' | 'failed'

/** `left`: Cordis unloaded it. `returning`: its `apply` runs again. `started`: that `apply` returned. */
export type RowEvent = 'left' | 'returning' | 'started' | 'threw' | 'deadline'

export type RowExit = Readonly<{
  code: 0 | 3 | 4
  reason: 'row-returned' | 'dependency-deadline' | 'start-failed' | 'start-deadline'
}>

export type RowAction =
  | Readonly<{ kind: 'arm'; deadline: 'dependency' | 'start' }>
  | Readonly<{ kind: 'disarm' }>
  | (Readonly<{ kind: 'exit' }> & RowExit)

export type RowStep = Readonly<{ standing: RowStanding; actions: readonly RowAction[] }>

const stay = (standing: RowStanding): RowStep => ({ standing, actions: [] })

function whileWaiting(event: RowEvent, swap: SwapWay): RowStep {
  if (event === 'deadline')
    return {
      standing: 'waiting',
      actions: [{ kind: 'exit', code: 4, reason: 'dependency-deadline' }],
    }
  if (event !== 'returning') return stay('waiting')
  if (swap === 'restart')
    return {
      standing: 'waiting',
      actions: [{ kind: 'disarm' }, { kind: 'exit', code: 0, reason: 'row-returned' }],
    }
  return { standing: 'starting', actions: [{ kind: 'disarm' }, { kind: 'arm', deadline: 'start' }] }
}

function whileStarting(event: RowEvent): RowStep {
  switch (event) {
    case 'left':
      return {
        standing: 'waiting',
        actions: [{ kind: 'disarm' }, { kind: 'arm', deadline: 'dependency' }],
      }
    case 'started':
      return { standing: 'serving', actions: [{ kind: 'disarm' }] }
    case 'threw':
      return {
        standing: 'failed',
        actions: [{ kind: 'disarm' }, { kind: 'exit', code: 3, reason: 'start-failed' }],
      }
    case 'deadline':
      return {
        standing: 'starting',
        actions: [{ kind: 'exit', code: 3, reason: 'start-deadline' }],
      }
    case 'returning':
      return stay('starting')
  }
}

/** One row, one event: where it stands after, and what the supervisor does. `swap` is what the row declared. */
export function superviseRow(standing: RowStanding, event: RowEvent, swap: SwapWay): RowStep {
  switch (standing) {
    case 'serving':
      return event === 'left'
        ? { standing: 'waiting', actions: [{ kind: 'arm', deadline: 'dependency' }] }
        : stay('serving')
    case 'waiting':
      return whileWaiting(event, swap)
    case 'starting':
      return whileStarting(event)
    case 'failed':
      return stay('failed')
  }
}
