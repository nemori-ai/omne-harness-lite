/** Where a supervisor stands with the one child it keeps up. `falls` counts the falls since the child last settled. */
export type Supervision =
  | Readonly<{ kind: 'running'; falls: number }>
  | Readonly<{ kind: 'waiting'; falls: number }>
  | Readonly<{ kind: 'stopping' }>
  | Readonly<{ kind: 'held'; reason: HeldReason; code: number | null; falls: number }>
  | Readonly<{ kind: 'stopped'; code: number | null }>

export type HeldReason = 'configuration' | 'fall-limit'

export type SuperviseEvent =
  | Readonly<{ kind: 'exited'; code: number | null }>
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'waited' }>
  | Readonly<{ kind: 'stop' }>

export type SuperviseAction =
  | Readonly<{ kind: 'start' }>
  | Readonly<{ kind: 'wait'; ms: number }>
  | Readonly<{ kind: 'stop-child' }>
  | Readonly<{ kind: 'cancel-wait' }>
  | Readonly<{ kind: 'give-up'; reason: HeldReason; code: number | null }>

export type SuperviseStep = Readonly<{ state: Supervision; actions: readonly SuperviseAction[] }>

export type SuperviseConfig = Readonly<{
  fallLimit: number
  backoffBaseMs: number
  backoffMaxMs: number
}>

const PLANNED = 0
const MISCONFIGURED = 2
const CLOSED_INCOMPLETE = 5

export function beginSupervision(): SuperviseStep {
  return { state: { kind: 'running', falls: 0 }, actions: [{ kind: 'start' }] }
}

const backoff = (falls: number, config: SuperviseConfig): number =>
  Math.min(config.backoffMaxMs, config.backoffBaseMs * 2 ** Math.max(0, falls - 1))

function afterExit(falls: number, code: number | null, config: SuperviseConfig): SuperviseStep {
  if (code === PLANNED) return { state: { kind: 'running', falls }, actions: [{ kind: 'start' }] }
  if (code === MISCONFIGURED)
    return {
      state: { kind: 'held', reason: 'configuration', code, falls },
      actions: [{ kind: 'give-up', reason: 'configuration', code }],
    }
  const fallen = code === CLOSED_INCOMPLETE ? falls : falls + 1
  if (fallen > falls && fallen >= config.fallLimit)
    return {
      state: { kind: 'held', reason: 'fall-limit', code, falls: fallen },
      actions: [{ kind: 'give-up', reason: 'fall-limit', code }],
    }
  return {
    state: { kind: 'waiting', falls: fallen },
    actions: [{ kind: 'wait', ms: backoff(fallen, config) }],
  }
}

/** One step of the supervisor: the next state and what to do. An event that cannot come in a state changes nothing. */
export function supervise(
  state: Supervision,
  event: SuperviseEvent,
  config: SuperviseConfig,
): SuperviseStep {
  const still: SuperviseStep = { state, actions: [] }
  switch (state.kind) {
    case 'running':
      if (event.kind === 'exited') return afterExit(state.falls, event.code, config)
      if (event.kind === 'settled') return { state: { kind: 'running', falls: 0 }, actions: [] }
      if (event.kind === 'stop')
        return { state: { kind: 'stopping' }, actions: [{ kind: 'stop-child' }] }
      return still
    case 'waiting':
      if (event.kind === 'waited')
        return { state: { kind: 'running', falls: state.falls }, actions: [{ kind: 'start' }] }
      if (event.kind === 'stop')
        return { state: { kind: 'stopped', code: null }, actions: [{ kind: 'cancel-wait' }] }
      return still
    case 'stopping':
      return event.kind === 'exited'
        ? { state: { kind: 'stopped', code: event.code }, actions: [] }
        : still
    case 'held':
    case 'stopped':
      return still
  }
}
