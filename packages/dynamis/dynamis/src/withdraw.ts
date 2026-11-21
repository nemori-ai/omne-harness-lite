import { byText, remove, sameInstance, standing, type Instance, type Registry } from './registry.ts'

export type Call = Readonly<{
  id: string
  instance: Instance
  state: 'running' | 'done' | 'unknown'
  recorded: boolean
}>

export type Ledger = Readonly<{ calls: readonly Call[] }>

export type Admitted =
  | Readonly<{ kind: 'admitted'; ledger: Ledger }>
  | Readonly<{ kind: 'recognised'; ledger: Ledger }>
  | Readonly<{ kind: 'refused'; reason: 'retiring' | 'absent' | 'call-in-use' }>

export type Moved =
  | Readonly<{ kind: 'moved'; ledger: Ledger }>
  | Readonly<{ kind: 'refused'; reason: 'no-such-call' | 'not-running' }>

export type Reconciled =
  | Readonly<{ kind: 'known'; state: 'running' | 'done'; ledger: Ledger }>
  | Readonly<{ kind: 'still-unknown'; ledger: Ledger }>
  | Readonly<{ kind: 'refused'; reason: 'no-such-call' }>

export type DrainReport =
  | Readonly<{ kind: 'serving' }>
  | Readonly<{ kind: 'draining'; running: readonly string[] }>
  | Readonly<{ kind: 'drained' }>
  | Readonly<{ kind: 'absent'; unknown: readonly string[] }>

export type Withdrawn =
  | Readonly<{ kind: 'withdrawn'; registry: Registry }>
  | Readonly<{ kind: 'refused'; reason: 'in-flight' | 'not-retiring' }>

const ledgerOf = (calls: readonly Call[]): Ledger =>
  Object.freeze({
    calls: Object.freeze([...calls].sort((left, right) => byText(left.id, right.id))),
  })

export const noCalls: Ledger = ledgerOf([])

const callOf = (ledger: Ledger, id: string): Call | undefined =>
  ledger.calls.find(call => call.id === id)

const replaced = (ledger: Ledger, next: Call): Ledger =>
  ledgerOf(ledger.calls.map(call => (call.id === next.id ? Object.freeze(next) : call)))

/** The ids of the calls pinned to an instance that are in one state. */
const idsOf = (ledger: Ledger, instance: Instance, state: Call['state']): string[] =>
  ledger.calls
    .filter(call => call.state === state && sameInstance(call.instance, instance))
    .map(call => call.id)

export function admit(
  registry: Registry,
  ledger: Ledger,
  instance: Instance,
  id: string,
): Admitted {
  const known = callOf(ledger, id)
  if (known !== undefined)
    return sameInstance(known.instance, instance)
      ? { kind: 'recognised', ledger }
      : { kind: 'refused', reason: 'call-in-use' }
  const held = standing(registry, instance)
  if (held !== 'serving') return { kind: 'refused', reason: held }
  const pinned = Object.freeze({ fiber: instance.fiber, generation: instance.generation })
  const call: Call = Object.freeze({ id, instance: pinned, state: 'running', recorded: false })
  return { kind: 'admitted', ledger: ledgerOf([...ledger.calls, call]) }
}

/** Applies a change to a running call; a call that is done stays as it is, an unknown one refuses. */
function onRunning(ledger: Ledger, id: string, change: (call: Call) => Call): Moved {
  const call = callOf(ledger, id)
  if (call === undefined) return { kind: 'refused', reason: 'no-such-call' }
  if (call.state === 'unknown') return { kind: 'refused', reason: 'not-running' }
  return { kind: 'moved', ledger: call.state === 'done' ? ledger : replaced(ledger, change(call)) }
}

export const record = (ledger: Ledger, id: string): Moved =>
  onRunning(ledger, id, call => ({ ...call, recorded: true }))

export const finish = (ledger: Ledger, id: string): Moved =>
  onRunning(ledger, id, call => ({ ...call, state: 'done', recorded: true }))

/** The instance is gone without a drain: what it was running is now unknown. */
export function lost(ledger: Ledger, instance: Instance): Ledger {
  return ledgerOf(
    ledger.calls.map(call =>
      call.state === 'running' && sameInstance(call.instance, instance)
        ? Object.freeze({ ...call, state: 'unknown' as const })
        : call,
    ),
  )
}

/** An unknown call becomes done only on a durable record of its effect; it is never run again. */
export function reconcile(ledger: Ledger, id: string): Reconciled {
  const call = callOf(ledger, id)
  if (call === undefined) return { kind: 'refused', reason: 'no-such-call' }
  if (call.state !== 'unknown') return { kind: 'known', state: call.state, ledger }
  if (!call.recorded) return { kind: 'still-unknown', ledger }
  return { kind: 'known', state: 'done', ledger: replaced(ledger, { ...call, state: 'done' }) }
}

export function drain(registry: Registry, ledger: Ledger, instance: Instance): DrainReport {
  const held = standing(registry, instance)
  if (held === 'serving') return { kind: 'serving' }
  if (held === 'absent') return { kind: 'absent', unknown: idsOf(ledger, instance, 'unknown') }
  const running = idsOf(ledger, instance, 'running')
  return running.length > 0 ? { kind: 'draining', running } : { kind: 'drained' }
}

export function complete(registry: Registry, ledger: Ledger, instance: Instance): Withdrawn {
  const report = drain(registry, ledger, instance)
  if (report.kind === 'serving') return { kind: 'refused', reason: 'not-retiring' }
  if (report.kind === 'draining') return { kind: 'refused', reason: 'in-flight' }
  return { kind: 'withdrawn', registry: remove(registry, instance) }
}

export const settled = (ledger: Ledger): Ledger =>
  ledgerOf(ledger.calls.filter(call => call.state !== 'done'))
