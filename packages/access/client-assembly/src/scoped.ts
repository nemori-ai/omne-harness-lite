import type { guestContractOfTree } from '@omne-harness/public-contract'

/** One protocol of the acting tenant as `scoped` answers it: its contract is data, in the answer's tree. */
export type ScopedProtocol = Readonly<{
  name: string
  major: number
  contract: Parameters<typeof guestContractOfTree>[0]
}>

/** Where the connection is in following the protocols of the tenant its login acts for. */
export type ScopedState =
  | Readonly<{ kind: 'off' }>
  | Readonly<{ kind: 'reading'; again: boolean; failures: number }>
  | Readonly<{ kind: 'following' }>

export type ScopedEvent =
  | Readonly<{ kind: 'signed-in' | 'unreadable' | 'scoped-changed' | 'switched' | 'signed-out' }>
  | Readonly<{ kind: 'read'; protocols: readonly ScopedProtocol[] }>

/** What a step asks of the connection: a read after so many failures in a row, what a read told put, all it put taken. */
export type ScopedEffect =
  | Readonly<{ kind: 'read'; failures: number }>
  | Readonly<{ kind: 'place'; protocols: readonly ScopedProtocol[] }>
  | Readonly<{ kind: 'take-all' }>

export type ScopedStep = Readonly<{ state: ScopedState; effects: readonly ScopedEffect[] }>

export const SCOPED_OFF: ScopedState = Object.freeze({ kind: 'off' })

const READ_NOW: ScopedStep = {
  state: { kind: 'reading', again: false, failures: 0 },
  effects: [{ kind: 'read', failures: 0 }],
}

const TAKE_ALL = { kind: 'take-all' } as const

/** The connection's following of `scoped`, a total function: a cell no run reaches leaves the state as it is. */
export function stepScoped(state: ScopedState, event: ScopedEvent): ScopedStep {
  const still: ScopedStep = { state, effects: [] }
  if (state.kind === 'off') return event.kind === 'signed-in' ? READ_NOW : still
  if (event.kind === 'signed-out') return { state: SCOPED_OFF, effects: [TAKE_ALL] }
  if (event.kind === 'switched')
    return { state: READ_NOW.state, effects: [TAKE_ALL, ...READ_NOW.effects] }
  if (state.kind === 'following') return event.kind === 'scoped-changed' ? READ_NOW : still
  if (event.kind === 'scoped-changed') return { state: { ...state, again: true }, effects: [] }
  if (event.kind === 'unreadable') {
    const failures = state.failures + 1
    return {
      state: { kind: 'reading', again: false, failures },
      effects: [{ kind: 'read', failures }],
    }
  }
  if (event.kind !== 'read') return still
  const place = { kind: 'place', protocols: event.protocols } as const
  return state.again
    ? { state: READ_NOW.state, effects: [place, ...READ_NOW.effects] }
    : { state: { kind: 'following' }, effects: [place] }
}

/** What a read changes of what is put, by key: the keys to take, and the protocols to put (a changed one is in both). */
export function placedDiff(
  placed: ReadonlyMap<string, string>,
  told: ReadonlyMap<string, string>,
): Readonly<{ take: readonly string[]; put: readonly string[] }> {
  const take = [...placed].filter(([key, data]) => told.get(key) !== data).map(([key]) => key)
  const put = [...told].filter(([key, data]) => placed.get(key) !== data).map(([key]) => key)
  return { take, put }
}
