import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Effect, Reply, ToolFailure, ToolTerminal } from '@omne-harness/tool-contract'
import {
  isProgramSettled,
  owesDisposal,
  type PositionExclusion,
  type PositionStop,
  type PositionTarget,
  type ProgramFence,
  type ProgramPosition,
  type ProgramTable,
  type ToolChildren,
} from '@omne-harness/tool-contract/provider'
import { invalid, type CallInput } from './boundary.ts'
import { createLedgerAccess } from './ledger-access.ts'
import type { ToolAccessGuard } from './ledger-guards.ts'
import { put, type Decision, type Snapshot } from './ledger-decider.ts'
import type { LedgerDomain, LedgerWrite, ToolLedgerStore } from './ledger-store.ts'
import { createLedgerTransactions, type Decide } from './ledger-transactions.ts'

type Answer<T> = Decision<T>
type Registration = Pick<ProgramPosition, 'ordinal' | 'child' | 'admission' | 'target'>
type Retention = Readonly<{
  result: Extract<ProgramPosition, { state: 'retained' }>['result']
  terminal: ToolTerminal
  effect: Effect
}>

const reply = <T>(outcome: Outcome<T, ToolFailure>): Answer<T> => ({ kind: 'reply', outcome })
const commit = <T>(writes: readonly LedgerWrite[], value: T): Answer<T> => ({
  kind: 'commit',
  writes,
  value,
})
const refused = (reason: string) => invalid('position', reason)
const stored = (position: ProgramPosition): Answer<ProgramPosition> =>
  commit([put({ kind: 'position', position })], position)
const kept = (position: ProgramPosition): Answer<ProgramPosition> => reply(succeed(position))
const sameTarget = (left: PositionTarget, right: PositionTarget) =>
  left.name === right.name && left.command === right.command && left.digest === right.digest
const ordinalOf = (value: number): Outcome<number, ToolFailure> =>
  Number.isSafeInteger(value) && value >= 0 ? succeed(value) : invalid('ordinal', 'whole-number')

export function tableOf(snapshot: Snapshot): ProgramTable {
  const fence = snapshot.program?.fence
  return {
    phase: snapshot.program?.phase ?? 'open',
    ...(fence === undefined ? {} : { fence }),
    positions: [...snapshot.positions.values()].sort((a, b) => a.ordinal - b.ordinal),
  }
}

/** TL-67: a call with positions reports completed only when its table is sealed and every position settled. */
export function programUnsettled(snapshot: Snapshot): boolean {
  if (snapshot.program === null && snapshot.positions.size === 0) return false
  return !isProgramSettled(tableOf(snapshot))
}

function at(snapshot: Snapshot, ordinal: number): Outcome<ProgramPosition, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const position = snapshot.positions.get(ordinal)
  return position === undefined ? refused('unknown-position') : succeed(position)
}

/** TL-66: a position is registered only while the table is open. The same position gives the same record. */
export function decideRegister(snapshot: Snapshot, given: Registration): Answer<ProgramPosition> {
  if (snapshot.call === null) return reply(invalid('call', 'unknown-call'))
  const known = snapshot.positions.get(given.ordinal)
  if (known !== undefined) {
    const same =
      known.child === given.child &&
      known.admission === given.admission &&
      sameTarget(known.target, given.target)
    return same ? kept(known) : reply(fail({ kind: 'conflict', operation: known.admission }))
  }
  if (snapshot.program?.phase === 'sealed') return reply(refused('table-sealed'))
  if (snapshot.program?.phase === 'closing') return reply(refused('table-closed'))
  const position: ProgramPosition = { ...given, state: 'registered' }
  const opened: readonly LedgerWrite[] =
    snapshot.program === null ? [put({ kind: 'program', program: { phase: 'open' } })] : []
  return commit([...opened, put({ kind: 'position', position })], position)
}

/** TL-68: only a position that was never handed off is excluded here; a handed one is first looked up. */
export function decideExclude(
  snapshot: Snapshot,
  ordinal: number,
  exclusion: PositionExclusion,
  unaccepted: boolean,
): Answer<ProgramPosition> {
  const found = at(snapshot, ordinal)
  if ('failure' in found) return reply(found)
  const position = found.ok
  const { ordinal: place, child, admission, target } = position
  const excluded: ProgramPosition = {
    ordinal: place,
    child,
    admission,
    target,
    state: 'excluded',
    exclusion,
  }
  switch (position.state) {
    case 'registered':
      return stored(excluded)
    case 'handed':
      return unaccepted ? stored(excluded) : reply(refused('handed-off'))
    case 'excluded':
      return kept(position)
    case 'retained':
      return reply(fail({ kind: 'conflict', operation: position.admission }))
  }
}

export function decideHandOff(snapshot: Snapshot, ordinal: number): Answer<ProgramPosition> {
  const found = at(snapshot, ordinal)
  if ('failure' in found) return reply(found)
  const position = found.ok
  switch (position.state) {
    case 'registered':
      return snapshot.program?.phase === 'closing'
        ? reply(refused('table-closed'))
        : stored({ ...position, state: 'handed', background: false })
    case 'handed':
    case 'retained':
      return kept(position)
    case 'excluded':
      return reply(refused('excluded'))
  }
}

export function decideBackground(snapshot: Snapshot, ordinal: number): Answer<ProgramPosition> {
  const found = at(snapshot, ordinal)
  if ('failure' in found) return reply(found)
  const position = found.ok
  return position.state === 'handed' && !position.background
    ? stored({ ...position, background: true })
    : kept(position)
}

export function decideRetain(
  snapshot: Snapshot,
  ordinal: number,
  given: Retention,
): Answer<ProgramPosition> {
  const found = at(snapshot, ordinal)
  if ('failure' in found) return reply(found)
  const position = found.ok
  switch (position.state) {
    case 'handed': {
      const { background: _, stop: _stop, ...base } = position
      return stored({ ...base, state: 'retained', ...given, late: false })
    }
    case 'retained':
      return position.result === given.result
        ? kept(position)
        : stored({ ...position, ...given, late: true })
    case 'registered':
    case 'excluded':
      return reply(fail({ kind: 'conflict', operation: position.admission }))
  }
}

const relationOf = (position: ProgramPosition): ProgramFence['cut'][number]['relation'] => {
  if (position.state !== 'handed') return 'unplaced'
  return position.background ? 'background' : 'foreground'
}

/** TL-69: the barrier this snapshot gets, or null when the one that stands already covers it. */
export function fenceOver(
  snapshot: Snapshot,
  reach: ProgramFence['reach'],
  cause: ProgramFence['cause'],
): ProgramFence | null {
  const standing = snapshot.program?.fence
  if (standing !== undefined)
    return standing.reach === 'all' || reach === 'foreground' ? null : { ...standing, reach }
  const cut = [...snapshot.positions.values()]
    .filter(position => position.state === 'registered' || position.state === 'handed')
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(position => ({ ordinal: position.ordinal, relation: relationOf(position) }))
  return { reach, cause, cut }
}

export function closingWrites(
  snapshot: Snapshot,
  reach: ProgramFence['reach'],
  cause: ProgramFence['cause'],
): readonly LedgerWrite[] {
  if (snapshot.program === null && snapshot.positions.size === 0) return []
  const fence = fenceOver(snapshot, reach, cause)
  return fence === null ? [] : [put({ kind: 'program', program: { phase: 'closing', fence } })]
}

/** TL-66, TL-69: one commit closes registration and sets the reach, the cause and the cut. */
export function decideClose(
  snapshot: Snapshot,
  reach: ProgramFence['reach'],
  cause: ProgramFence['cause'],
): Answer<ProgramTable> {
  if (snapshot.call === null) return reply(invalid('call', 'unknown-call'))
  const fence = fenceOver(snapshot, reach, cause)
  if (fence === null) return reply(succeed(tableOf(snapshot)))
  const closed = put({ kind: 'program', program: { phase: 'closing', fence } })
  return commit([closed], { ...tableOf(snapshot), phase: 'closing', fence })
}

export function decideStopping(
  snapshot: Snapshot,
  ordinal: number,
  progress: PositionStop,
): Answer<ProgramPosition> {
  const found = at(snapshot, ordinal)
  if ('failure' in found) return reply(found)
  const position = found.ok
  return position.state === 'handed' && position.stop !== progress
    ? stored({ ...position, stop: progress })
    : kept(position)
}

export function decideSeal(snapshot: Snapshot): Answer<ProgramTable> {
  if (snapshot.call === null) return reply(invalid('call', 'unknown-call'))
  if (snapshot.program?.phase === 'sealed') return reply(succeed(tableOf(snapshot)))
  if (snapshot.program?.phase === 'closing') return reply(succeed(tableOf(snapshot)))
  return commit([put({ kind: 'program', program: { phase: 'sealed' } })], {
    ...tableOf(snapshot),
    phase: 'sealed',
  })
}

export type ToolPositionsInput<P> = Readonly<{
  store: Pick<ToolLedgerStore, 'read' | 'commit'>
  access: ToolAccessGuard<P>
  commitAttempts: number
  lookup(
    input: CallInput<P> & Readonly<{ admission: ProgramPosition['admission'] }>,
  ): Reply<Readonly<{ kind: string }>>
  bar?(
    input: CallInput<P> & Readonly<{ parent: CallInput<P>['call']; ordinal: number }>,
  ): Reply<unknown>
  stop?(
    input: CallInput<P> & Readonly<{ parent: CallInput<P>['call']; ordinal: number }>,
  ): Promise<PositionStop>
}>

const CLOSED: PositionExclusion = { kind: 'closed', reason: 'the program ended before this call' }

export function createToolPositions<P>(input: ToolPositionsInput<P>): ToolChildren<P> {
  const { entry } = createLedgerAccess(input.access)
  const { transact } = createLedgerTransactions(input.store, input.commitAttempts)
  const unknown = fail({
    kind: 'unavailable' as const,
    dependency: 'ledger-store',
    diagnostic: 'the outcome of the position commit is unknown; repeat it',
  })
  const ports = {
    entry,
    transact: <T>(domain: LedgerDomain, decide: Decide<T>): Reply<T> =>
      transact(domain, null, decide, unknown),
    async unaccepted(context: CallInput<P>, position: ProgramPosition): Reply<boolean> {
      const { child: call, admission } = position
      const looked = await input.lookup({ ...context, call, admission })
      return 'failure' in looked ? looked : succeed(looked.ok.kind === 'not-accepted')
    },
  }
  const domainOf = (context: CallInput<P>): LedgerDomain => ({
    kind: 'call',
    tenant: context.tenant,
    call: context.call,
  })
  const write = async <T>(input: unknown, decide: Decide<T>): Reply<T> => {
    const context = await ports.entry(input, 'write')
    return 'failure' in context ? context : ports.transact(domainOf(context.ok), decide)
  }
  const placed = async <T>(
    input: Readonly<{ ordinal: number }>,
    decide: (snapshot: Snapshot, ordinal: number) => Answer<T>,
  ): Reply<T> => {
    const ordinal = ordinalOf(input.ordinal)
    return 'failure' in ordinal ? ordinal : write(input, snapshot => decide(snapshot, ordinal.ok))
  }
  return {
    register: input =>
      placed(input, (snapshot, ordinal) =>
        decideRegister(snapshot, {
          ordinal,
          child: input.child,
          admission: input.admission,
          target: input.target,
        }),
      ),
    async exclude(input) {
      const context = await ports.entry(input, 'write')
      if ('failure' in context) return context
      const ordinal = ordinalOf(input.ordinal)
      if ('failure' in ordinal) return ordinal
      const current = await ports.transact(domainOf(context.ok), snapshot =>
        reply(at(snapshot, ordinal.ok)),
      )
      if ('failure' in current) return current
      const unaccepted =
        current.ok.state === 'handed'
          ? await ports.unaccepted(context.ok, current.ok)
          : succeed(false)
      if ('failure' in unaccepted) return unaccepted
      return ports.transact(domainOf(context.ok), snapshot =>
        decideExclude(snapshot, ordinal.ok, input.exclusion, unaccepted.ok),
      )
    },
    handOff: input => placed(input, decideHandOff),
    background: input => placed(input, decideBackground),
    retain: input =>
      placed(input, (snapshot, ordinal) =>
        decideRetain(snapshot, ordinal, {
          result: input.result,
          terminal: input.terminal,
          effect: input.effect,
        }),
      ),
    seal: input => write(input, decideSeal),
    close: input => write(input, snapshot => decideClose(snapshot, input.reach, input.cause)),
    async dispose(given) {
      const context = await ports.entry(given, 'write')
      if ('failure' in context) return context
      const domain = domainOf(context.ok)
      const read = () => ports.transact(domain, snapshot => reply(succeed(tableOf(snapshot))))
      const table = await read()
      if ('failure' in table) return table
      for (const position of owesDisposal(table.ok)) {
        const { ordinal, child: call, state } = position
        const excluded = (unaccepted: boolean) =>
          ports.transact(domain, snapshot => decideExclude(snapshot, ordinal, CLOSED, unaccepted))
        if (state === 'registered') {
          await excluded(false)
          continue
        }
        // TL-66, TL-68: bar the start, then exclude the admission under its own identity, then the position.
        const at = { ...context.ok, call, parent: context.ok.call, ordinal }
        const barred = (await input.bar?.(at)) ?? succeed(null)
        if ('failure' in barred) continue
        const unaccepted = await ports.unaccepted(context.ok, position)
        if ('failure' in unaccepted) continue
        if (unaccepted.ok) {
          await excluded(true)
          continue
        }
        const progress = (await input.stop?.(at)) ?? 'unknown'
        await ports.transact(domain, snapshot => decideStopping(snapshot, ordinal, progress))
      }
      return read()
    },
    stopping: input =>
      placed(input, (snapshot, ordinal) => decideStopping(snapshot, ordinal, input.progress)),
    async table(input) {
      const context = await ports.entry(input, 'lookup')
      if ('failure' in context) return context
      return ports.transact(domainOf(context.ok), snapshot => reply(succeed(tableOf(snapshot))))
    },
  }
}
