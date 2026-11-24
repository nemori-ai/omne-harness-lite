import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Effect, Reply, ToolFailure, ToolTerminal } from '@omne-harness/tool-contract'
import {
  isProgramSettled,
  type PositionExclusion,
  type PositionTarget,
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
  return {
    phase: snapshot.program?.phase ?? 'open',
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
      return stored({ ...position, state: 'handed', background: false })
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

/** A result is retained at the position it was handed off from, whatever the table says by then. */
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
      const { background: _, ...base } = position
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

export function decideSeal(snapshot: Snapshot): Answer<ProgramTable> {
  if (snapshot.call === null) return reply(invalid('call', 'unknown-call'))
  if (snapshot.program?.phase === 'sealed') return reply(succeed(tableOf(snapshot)))
  return commit([put({ kind: 'program', program: { phase: 'sealed' } })], {
    ...tableOf(snapshot),
    phase: 'sealed',
  })
}

export type ToolPositionsInput<P> = Readonly<{
  store: Pick<ToolLedgerStore, 'read' | 'commit'>
  access: ToolAccessGuard<P>
  commitAttempts: number
  /** Looks a child up under its own identity; a negative answer excludes its admission there. */
  lookup(
    input: CallInput<P> & Readonly<{ admission: ProgramPosition['admission'] }>,
  ): Reply<Readonly<{ kind: string }>>
}>

/** The position table of the ledger over this store: every method is one conditional commit. */
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
    async table(input) {
      const context = await ports.entry(input, 'lookup')
      if ('failure' in context) return context
      return ports.transact(domainOf(context.ok), snapshot => reply(succeed(tableOf(snapshot))))
    },
  }
}
