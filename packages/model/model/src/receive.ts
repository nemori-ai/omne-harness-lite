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

type Open = Parameters<ModelCommands<unknown>['openReceiveWindow']>[0]
type Preserve = Parameters<ModelCommands<unknown>['preserve']>[0]
type Completion = 'continue' | 'terminal' | 'stream-lost'
export type ReceivedTerminal = {
  snapshot: Snapshot
  termination: Termination | null
  failure: ModelFailure | null
}
export type TerminalCompetition = { replaced: boolean }
type Stage =
  | {
      kind: 'reading'
      window: string
      facts: TransportFact[]
      bytes: number
      flush: boolean
      timer: AbortController | null
    }
  | { kind: 'ready'; window: string; facts: TransportFact[]; completion: Completion }
  | { kind: 'next' }
  | { kind: 'open'; input: Open; pending: boolean }
  | { kind: 'preserve'; input: Preserve; pending: boolean; completion: Completion }
  | { kind: 'terminal'; evidence: ReceivedTerminal; published: boolean }
  | { kind: 'failed'; failure: ModelFailure }
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

/** Owns exactly one iterator and keeps every in-flight read in its original receive window. */
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
  let stage: Stage = {
    kind: 'reading',
    window: input.window,
    facts: [],
    bytes: 0,
    flush: false,
    timer: null,
  }
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
  function reading(window: string): Stage {
    return { kind: 'reading', window, facts: [], bytes: 0, flush: false, timer: null }
  }
  async function reject(failure: ModelFailure): Promise<{ failure: ModelFailure }> {
    stage = { kind: 'failed', failure }
    const closed = await release()
    if ('failure' in closed) {
      stage = { kind: 'failed', failure: closed.failure }
      return closed
    }
    return { failure }
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
  function unconfirmed(result: { failure: ModelFailure; unconfirmed?: true }): boolean {
    return (
      'unconfirmed' in result ||
      result.failure.kind === 'commit-unknown' ||
      result.failure.kind === 'unavailable'
    )
  }
  function publishTerminal(
    entry: Extract<Stage, { kind: 'terminal' }>,
  ): Awaited<Reply<ReceivedTerminal>> {
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
      input: {
        ...demand.execution,
        operation: newOperation(),
        expected: current.ok.state.revision,
        dispatch: demand.dispatch,
        window: entry.window,
        facts: entry.facts,
      },
    }
    return { ok: null }
  }
  async function prepareWindow(): Reply<null> {
    const current = await commands.loadRecovery(demand)
    if ('failure' in current) return current
    stage = {
      kind: 'open',
      pending: false,
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
  async function openWindow(entry: Extract<Stage, { kind: 'open' }>): Reply<null> {
    const result = await write(entry, () => commands.openReceiveWindow(entry.input))
    if ('failure' in result) {
      if (unconfirmed(result)) return { failure: result.failure }
      return reject(result.failure)
    }
    stage = reading(entry.input.window)
    input.refresh()
    return { ok: null }
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
  ): Reply<null> {
    if (unconfirmed(result)) return { failure: result.failure }
    // Only a definite expected conflict can create a new terminal intent.
    if (
      entry.completion !== 'continue' &&
      result.failure.kind === 'conflict' &&
      result.failure.operation === entry.input.operation &&
      result.failure.revision !== entry.input.expected
    ) {
      return replaceTerminalPreserve(entry, result.failure, competition)
    }
    input.rejectContent()
    const rejected = await reject(result.failure)
    input.refresh()
    return rejected
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
  ): Reply<null> {
    const result = await write(entry, () => commands.preserve(entry.input))
    if ('failure' in result) return preserveFailure(entry, result, competition)
    if (entry.completion === 'continue') stage = { kind: 'next' }
    else {
      stage = terminalEvidence(entry, result.ok)
    }
    input.confirm(result.ok)
    if (stage.kind === 'terminal') stage.published = true
    input.refresh()
    return { ok: null }
  }
  function armBatchTimer(batch: Extract<Stage, { kind: 'reading' }>): void {
    if (batch.facts.length === 1 && input.batchDelayMs > 0) {
      const timer = new AbortController()
      batch.timer = timer
      // A soft trigger. It never detaches an already-pending next from this window.
      void input.clock
        .waitUntil(
          new Date(Date.parse(input.clock.now()) + input.batchDelayMs).toISOString(),
          timer.signal,
        )
        .then(
          result => {
            if (result === 'elapsed') batch.flush = true
          },
          () => {
            batch.flush = true
          },
        )
    }
  }
  async function readBatch(batch: Extract<Stage, { kind: 'reading' }>): Reply<null> {
    let next: IteratorResult<TransportFact>
    try {
      next = await iterator.next()
    } catch {
      batch.timer?.abort()
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
      stage = {
        kind: 'ready',
        window: batch.window,
        facts: batch.facts,
        completion: 'stream-lost',
      }
      return { ok: null }
    }
    if (!next.done) {
      batch.facts.push(structuredClone(next.value))
      batch.bytes += Buffer.byteLength(JSON.stringify(next.value), 'utf8')
      armBatchTimer(batch)
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
    batch.timer?.abort()
    stage = {
      kind: 'ready',
      window: batch.window,
      facts: batch.facts,
      completion: next.done ? 'stream-lost' : terminal ? 'terminal' : 'continue',
    }
    return { ok: null }
  }
  function advance(entry: Stage, competition: TerminalCompetition): Reply<ReceivedTerminal | null> {
    switch (entry.kind) {
      case 'terminal':
        return Promise.resolve(publishTerminal(entry))
      case 'failed':
        return Promise.resolve({ failure: entry.failure })
      case 'ready':
        return preparePreserve(entry)
      case 'next':
        return prepareWindow()
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
    async run(
      signal: AbortSignal,
      competition: TerminalCompetition,
    ): Reply<ReceivedTerminal | null> {
      while (!signal.aborted || stage.kind === 'terminal') {
        const result = await advance(stage, competition)
        if ('failure' in result || result.ok) return result
      }
      return { ok: null }
    },
  }
}
