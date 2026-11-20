import { randomUUID } from 'node:crypto'
import {
  decodeModelOperationId,
  type ModelOperationId,
  type Reply,
  type Snapshot,
  type ModelFailure,
  type Termination,
} from '@omne-harness/model-contract'
import {
  type ModelCommands,
  type ModelClock,
  type SendDemand,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import { executionFailure, verdictOf, type WriteVerdict } from './commands/execution-write.ts'
import { readInstant } from './commands/instants.ts'

type Open = Parameters<ModelCommands<unknown>['openReceiveWindow']>[0]
type Preserve = Parameters<ModelCommands<unknown>['preserve']>[0]
type Completion = 'continue' | 'terminal' | 'stream-lost'
export type ReceiveEnd = {
  termination: Termination | null
  failure: ModelFailure | null
}
type ReceivedTerminal = ReceiveEnd & { snapshot: Snapshot }
export type TerminalCompetition = { replaced: boolean }
/** A batch to save. `successor` is the window already open for the read still in flight. */
type Ready = {
  kind: 'ready'
  window: string
  facts: TransportFact[]
  arrivals: (string | null)[]
  completion: Completion
  successor: string | null
}
type Read = { next: IteratorResult<TransportFact> } | 'lost'
type Stage =
  | {
      kind: 'reading'
      window: string
      facts: TransportFact[]
      arrivals: (string | null)[]
      bytes: number
      flush: boolean
      timer: AbortController | null
      due: Promise<'due'> | null
    }
  | Ready
  | { kind: 'next' }
  | { kind: 'open'; input: Open; pending: boolean; held: Ready | null }
  | {
      kind: 'preserve'
      input: Preserve & Readonly<{ arrivals: readonly (string | null)[] }>
      pending: boolean
      completion: Completion
      successor: string | null
    }
  | { kind: 'terminal'; evidence: ReceivedTerminal; published: boolean }
  | { kind: 'refused'; refusal: ModelFailure }
  | { kind: 'superseded'; failure: ModelFailure }
type Batch = Extract<Stage, { kind: 'reading' }>
function reading(window: string): Batch {
  return {
    kind: 'reading',
    window,
    facts: [],
    arrivals: [],
    bytes: 0,
    flush: false,
    timer: null,
    due: null,
  }
}
function ready(batch: Batch, completion: Completion): Ready {
  batch.timer?.abort()
  return {
    kind: 'ready',
    window: batch.window,
    facts: batch.facts,
    arrivals: batch.arrivals,
    completion,
    successor: null,
  }
}
/** Starts the delay of a batch at the arrival of its first fact; without that instant it is due at once. */
function armBatchTimer(batch: Batch, clock: ModelClock, delayMs: number): void {
  const from = batch.arrivals[0] ?? null
  if (batch.facts.length !== 1 || delayMs <= 0) return
  batch.flush = from === null
  if (from === null) return
  const timer = new AbortController()
  batch.timer = timer
  batch.due = new Promise(resolve => {
    const due = (): void => {
      batch.flush = true
      resolve('due')
    }
    void clock
      .waitUntil(new Date(Date.parse(from) + delayMs).toISOString(), timer.signal)
      .then(result => {
        if (result === 'elapsed') due()
      }, due)
  })
}
export function newOperation(): ModelOperationId {
  const value = decodeModelOperationId(`mop_${randomUUID()}`)
  if ('ok' in value) return value.ok
  throw new Error('invalid generated Model operation')
}
const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: 'model-receive',
  diagnostic,
})

export function createReceiver<P>(input: {
  commands: ModelCommands<P>
  clock: ModelClock
  demand: SendDemand<P>
  window: string
  facts: AsyncIterable<TransportFact>
  batchBytes: number
  batchDelayMs: number
  beginContent(): void
  rejectContent(): void
  confirm(snapshot: Snapshot): void
  refresh(): void
}) {
  const { commands, demand } = input
  const iterator = input.facts[Symbol.asyncIterator]()
  let inFlight: Promise<Read> | null = null
  let stage: Stage = reading(input.window)
  let released: Reply<void> | undefined
  function release(): Reply<void> {
    released ??= (async () => {
      try {
        await iterator.return?.()
        return { ok: undefined }
      } catch {
        return { failure: unavailable('resource-release-failed') }
      }
    })()
    return released
  }
  async function supersede(failure: ModelFailure): Promise<{ failure: ModelFailure }> {
    stage = { kind: 'superseded', failure }
    const closed = await release()
    if ('failure' in closed) {
      stage = { kind: 'superseded', failure: closed.failure }
      return closed
    }
    return { failure }
  }
  function refuse(refusal: ModelFailure): { ok: ReceiveEnd } {
    stage = { kind: 'refused', refusal }
    return { ok: { termination: executionFailure(refusal), failure: refusal } }
  }
  async function write<T>(
    entry: { input: { operation: ModelOperationId }; pending: boolean },
    run: () => Reply<T>,
  ): Promise<Awaited<Reply<T>> & { unconfirmed?: true }> {
    try {
      let committed = false
      if (entry.pending) {
        const known = await commands.query({ ...demand, operation: entry.input.operation })
        if ('failure' in known) return { ...known, unconfirmed: true }
        committed = known.ok.kind === 'committed'
        if (known.ok.kind === 'unknown')
          return { failure: { kind: 'commit-unknown', operation: entry.input.operation } }
      }
      entry.pending = true
      const result = await run()
      return committed && 'failure' in result ? { ...result, unconfirmed: true } : result
    } catch {
      return { failure: unavailable('write-unconfirmed'), unconfirmed: true }
    }
  }
  function verdict(result: { failure: ModelFailure; unconfirmed?: true }): WriteVerdict {
    return 'unconfirmed' in result ? 'unconfirmed' : verdictOf(result.failure)
  }
  function publishTerminal(entry: Extract<Stage, { kind: 'terminal' }>): { ok: ReceiveEnd } {
    if (!entry.published) {
      input.confirm(entry.evidence.snapshot)
      entry.published = true
      input.refresh()
    }
    return { ok: entry.evidence }
  }
  async function preparePreserve(entry: Extract<Stage, { kind: 'ready' }>): Reply<null> {
    const current = await commands.loadRecovery(demand)
    if ('failure' in current) return current
    input.beginContent()
    stage = {
      kind: 'preserve',
      pending: false,
      completion: entry.completion,
      successor: entry.successor,
      input: {
        ...demand.execution,
        operation: newOperation(),
        expected: current.ok.state.revision,
        dispatch: demand.dispatch,
        window: entry.window,
        facts: entry.facts,
        arrivals: entry.arrivals,
      },
    }
    return { ok: null }
  }
  /** A read in flight is covered by an open window: the next one opens before this batch closes its own. */
  function prepareSave(entry: Ready): Reply<null> {
    return inFlight !== null && entry.successor === null
      ? prepareWindow(entry)
      : preparePreserve(entry)
  }
  async function prepareWindow(held: Ready | null): Reply<null> {
    const current = await commands.loadRecovery(demand)
    if ('failure' in current) return current
    stage = {
      kind: 'open',
      pending: false,
      held,
      input: {
        ...demand.execution,
        operation: newOperation(),
        expected: current.ok.state.revision,
        dispatch: demand.dispatch,
        window: randomUUID(),
      },
    }
    return { ok: null }
  }
  async function openWindow(entry: Extract<Stage, { kind: 'open' }>): Reply<ReceiveEnd | null> {
    const result = await write(entry, () => commands.openReceiveWindow(entry.input))
    if ('ok' in result) {
      stage = entry.held
        ? { ...entry.held, successor: entry.input.window }
        : reading(entry.input.window)
      input.refresh()
      return { ok: null }
    }
    switch (verdict(result)) {
      case 'unconfirmed':
        return { failure: result.failure }
      case 'outdated':
        stage = entry.held ?? { kind: 'next' }
        input.refresh()
        return { failure: result.failure }
      case 'superseded':
        return supersede(result.failure)
      case 'refused':
        return refuse(result.failure)
    }
  }
  async function replaceTerminalPreserve(
    entry: Extract<Stage, { kind: 'preserve' }>,
    failure: ModelFailure,
    competition: TerminalCompetition,
  ): Reply<null> {
    const known = await commands.query({ ...demand, operation: entry.input.operation })
    if ('failure' in known) return known
    if (known.ok.kind === 'unknown')
      return { failure: { kind: 'commit-unknown', operation: entry.input.operation } }
    if (known.ok.kind === 'committed') return { failure }
    const current = await commands.loadRecovery(demand)
    if ('failure' in current) return current
    if (
      competition.replaced ||
      current.ok.state.phase === 'settled' ||
      current.ok.execution?.instance !== entry.input.instance ||
      current.ok.execution.generation !== entry.input.generation
    )
      return { failure }
    competition.replaced = true
    stage = {
      ...entry,
      pending: false,
      input: {
        ...entry.input,
        operation: newOperation(),
        expected: current.ok.state.revision,
      },
    }
    return { ok: null }
  }
  async function preserveFailure(
    entry: Extract<Stage, { kind: 'preserve' }>,
    result: { failure: ModelFailure; unconfirmed?: true },
    competition: TerminalCompetition,
  ): Reply<ReceiveEnd | null> {
    switch (verdict(result)) {
      case 'unconfirmed':
        return { failure: result.failure }
      case 'outdated':
        if (entry.completion !== 'continue')
          return replaceTerminalPreserve(entry, result.failure, competition)
        input.rejectContent()
        stage = {
          kind: 'ready',
          window: entry.input.window,
          facts: [...entry.input.facts],
          arrivals: [...entry.input.arrivals],
          completion: entry.completion,
          successor: entry.successor,
        }
        input.refresh()
        return { failure: result.failure }
      case 'superseded': {
        input.rejectContent()
        const superseded = await supersede(result.failure)
        input.refresh()
        return superseded
      }
      case 'refused':
        input.rejectContent()
        input.refresh()
        return refuse(result.failure)
    }
  }
  function terminalEvidence(
    entry: Extract<Stage, { kind: 'preserve' }>,
    snapshot: Snapshot,
  ): Extract<Stage, { kind: 'terminal' }> {
    const ended = entry.input.facts.findLast(fact => fact.kind === 'ended')
    const terminal = ended?.termination
    const control = snapshot.state.control
    return {
      kind: 'terminal',
      published: false,
      evidence: {
        snapshot: structuredClone(snapshot),
        termination:
          terminal && terminal.kind !== 'interrupted'
            ? structuredClone(terminal)
            : terminal && control.kind === 'requested'
              ? { kind: 'interrupted', control: control.operation }
              : null,
        failure: entry.completion === 'stream-lost' ? unavailable('fact-stream-failed') : null,
      },
    }
  }
  async function preserveBatch(
    entry: Extract<Stage, { kind: 'preserve' }>,
    competition: TerminalCompetition,
  ): Reply<ReceiveEnd | null> {
    const result = await write(entry, () => commands.preserve(entry.input))
    if ('failure' in result) return preserveFailure(entry, result, competition)
    if (entry.completion !== 'continue') stage = terminalEvidence(entry, result.ok)
    else stage = entry.successor === null ? { kind: 'next' } : reading(entry.successor)
    input.confirm(result.ok)
    if (stage.kind === 'terminal') stage.published = true
    input.refresh()
    return { ok: null }
  }
  /** One read of the stream is in flight at most; a batch whose delay elapses first leaves it for the next. */
  function nextRead(batch: Batch): Promise<Read | 'due'> {
    inFlight ??= iterator.next().then(
      next => ({ next }),
      () => 'lost' as const,
    )
    return batch.due === null ? inFlight : Promise.race([inFlight, batch.due])
  }
  async function readBatch(batch: Batch): Reply<null> {
    const read = await nextRead(batch)
    if (read === 'due') {
      stage = ready(batch, 'continue')
      return { ok: null }
    }
    inFlight = null
    if (read === 'lost') {
      batch.arrivals.push(readInstant(input.clock))
      batch.facts.push({
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'stream-lost',
            upstreamStatus: null,
            diagnostic: 'managed-fact-stream-failed',
          },
        },
      })
      stage = ready(batch, 'stream-lost')
      return { ok: null }
    }
    const { next } = read
    batch.arrivals.push(readInstant(input.clock))
    if (!next.done) {
      batch.facts.push(structuredClone(next.value))
      batch.bytes += Buffer.byteLength(JSON.stringify(next.value), 'utf8')
      armBatchTimer(batch, input.clock, input.batchDelayMs)
    }
    const terminal = next.done || next.value.kind === 'ended'
    if (next.done)
      batch.facts.push({
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'stream-lost',
            upstreamStatus: null,
            diagnostic: 'managed-fact-stream-eof',
          },
        },
      })
    if (!terminal && input.batchDelayMs > 0 && !batch.flush && batch.bytes < input.batchBytes)
      return { ok: null }
    stage = ready(batch, next.done ? 'stream-lost' : terminal ? 'terminal' : 'continue')
    return { ok: null }
  }
  function advance(entry: Stage, competition: TerminalCompetition): Reply<ReceiveEnd | null> {
    switch (entry.kind) {
      case 'terminal':
        return Promise.resolve(publishTerminal(entry))
      case 'refused':
        return Promise.resolve(refuse(entry.refusal))
      case 'superseded':
        return Promise.resolve({ failure: entry.failure })
      case 'ready':
        return prepareSave(entry)
      case 'next':
        return prepareWindow(null)
      case 'open':
        return openWindow(entry)
      case 'preserve':
        return preserveBatch(entry, competition)
      case 'reading':
        return readBatch(entry)
    }
  }
  return {
    release,
    pendingOperation: () =>
      stage.kind === 'open' || stage.kind === 'preserve' ? stage.input.operation : null,
    async run(signal: AbortSignal, competition: TerminalCompetition): Reply<ReceiveEnd | null> {
      while (!signal.aborted || stage.kind === 'terminal' || stage.kind === 'refused') {
        const result = await advance(stage, competition)
        if ('failure' in result || result.ok) return result
      }
      return { ok: null }
    },
  }
}
