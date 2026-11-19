import type { SessionEntry, SessionEntryKind } from './entries.ts'
import type { InputId, RunId } from './identity.ts'
import type { RunTerminal } from './values.ts'

export type InputFate =
  | Readonly<{ kind: 'pending'; returnedFrom: RunId | null }>
  | Readonly<{ kind: 'taken'; run: RunId }>
  | Readonly<{ kind: 'answered'; run: RunId; terminal: 'active' | RunTerminal['outcome'] }>
  | Readonly<{ kind: 'settled'; by: 'cancelled' | 'archived' | 'frozen'; run: RunId | null }>
  | Readonly<{ kind: 'refused'; reason: string }>

/** The entry kinds the fate of an input is folded from; a reader asks the log for these only. */
export const INPUT_FATE_KINDS: readonly SessionEntryKind[] = Object.freeze([
  'intake.routed',
  'intake.handed-over',
  'run.started',
  'run.batch-taken',
  'message.assistant',
  'run.terminal',
  'intake.released',
  'session.archived',
  'session.frozen',
])

type Fold = Readonly<{ fate: InputFate; frozen: boolean }>
type Entry<K extends SessionEntryKind> = Extract<SessionEntry, { kind: K }>
type Step<K extends SessionEntryKind> = (input: InputId, fold: Fold, entry: Entry<K>) => InputFate

const runOf = (fate: InputFate): RunId | null => ('run' in fate ? fate.run : null)

// What the end of a Run does to an input it holds: the same table as the reducer's leases.
function afterTerminal(fate: InputFate, terminal: RunTerminal): InputFate {
  if (runOf(fate) !== terminal.run) return fate
  if (fate.kind === 'answered') return { ...fate, terminal: terminal.outcome }
  if (fate.kind !== 'taken') return fate
  return terminal.outcome === 'failed'
    ? { kind: 'pending', returnedFrom: terminal.run }
    : { kind: 'settled', by: 'cancelled', run: terminal.run }
}

const handedOver: Step<'intake.handed-over'> = (input, { fate }, entry) =>
  entry.input === input && entry.result.kind === 'rejected' && fate.kind === 'pending'
    ? { kind: 'refused', reason: entry.result.reason }
    : fate

const batchTaken: Step<'run.batch-taken'> = (input, { fate }, entry) =>
  entry.batch.ordered.includes(input) ? { kind: 'taken', run: entry.run } : fate

const replied: Step<'message.assistant'> = (_input, { fate }) =>
  fate.kind === 'taken' ? { kind: 'answered', run: fate.run, terminal: 'active' } : fate

const released: Step<'intake.released'> = (input, { fate, frozen }, entry) =>
  fate.kind === 'pending' && entry.inputs.includes(input)
    ? { kind: 'settled', by: frozen ? 'frozen' : 'cancelled', run: null }
    : fate

const archived: Step<'session.archived'> = (_input, { fate }) =>
  fate.kind === 'pending' || fate.kind === 'taken'
    ? { kind: 'settled', by: 'archived', run: runOf(fate) }
    : fate

const STEPS: { readonly [K in SessionEntryKind]?: Step<K> } = {
  'intake.handed-over': handedOver,
  'run.batch-taken': batchTaken,
  'message.assistant': replied,
  'run.terminal': (_input, { fate }, entry) => afterTerminal(fate, entry.terminal),
  'intake.released': released,
  'session.archived': archived,
}

const accepts = (input: InputId, entry: SessionEntry): boolean =>
  entry.kind === 'intake.routed' && 'input' in entry && entry.input === input

/** Where one input is now, from the entries of its session in log order. Null: never accepted. */
export function foldInputFate(input: InputId, entries: Iterable<SessionEntry>): InputFate | null {
  let fate: InputFate | null = null
  let frozen = false
  for (const entry of entries) {
    if (accepts(input, entry)) fate = { kind: 'pending', returnedFrom: null }
    if (entry.kind === 'session.frozen') frozen = true
    const step = STEPS[entry.kind] as Step<SessionEntryKind> | undefined
    if (fate !== null && step !== undefined) fate = step(input, { fate, frozen }, entry)
  }
  return fate
}
