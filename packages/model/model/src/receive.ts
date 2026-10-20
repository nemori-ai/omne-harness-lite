import { randomUUID } from 'node:crypto'
import {
  decodeModelOperationId,
  type ModelCommands,
  type ModelClock,
  type ModelOperationId,
  type Reply,
  type SendDemand,
  type Snapshot,
  type TransportFact,
  type ModelFailure,
} from '@omne-harness/model-contract'

type Open = Parameters<ModelCommands<unknown>['openReceiveWindow']>[0]
type Preserve = Parameters<ModelCommands<unknown>['preserve']>[0]
type Completion = 'continue' | 'terminal' | 'stream-lost'
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
  | { kind: 'done' }
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
  refresh(): Promise<void>
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
  function reading(window: string): Stage {
    return { kind: 'reading', window, facts: [], bytes: 0, flush: false, timer: null }
  }
  async function reject(failure: ModelFailure): Reply<void> {
    stage = { kind: 'failed', failure }
    try {
      await iterator.return?.()
    } catch {
      stage = { kind: 'failed', failure: unavailable('resource-release-failed') }
      return { failure: stage.failure }
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
  return {
    pendingOperation: () =>
      stage.kind === 'open' || stage.kind === 'preserve' ? stage.input.operation : null,
    async run(signal: AbortSignal): Reply<void> {
      while (!signal.aborted) {
        if (stage.kind === 'done') return { ok: undefined }
        if (stage.kind === 'failed') return { failure: stage.failure }
        if (stage.kind === 'ready') {
          const entry = stage
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
          continue
        }
        if (stage.kind === 'next') {
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
          continue
        }
        if (stage.kind === 'open') {
          const entry = stage
          const result = await write(entry, () => commands.openReceiveWindow(entry.input))
          if ('failure' in result) {
            if (
              'unconfirmed' in result ||
              result.failure.kind === 'commit-unknown' ||
              result.failure.kind === 'unavailable'
            )
              return { failure: result.failure }
            return reject(result.failure)
          }
          stage = reading(entry.input.window)
          await input.refresh()
          continue
        }
        if (stage.kind === 'preserve') {
          const entry = stage
          const result = await write(entry, () => commands.preserve(entry.input))
          if ('failure' in result) {
            if (
              'unconfirmed' in result ||
              result.failure.kind === 'commit-unknown' ||
              result.failure.kind === 'unavailable'
            )
              return { failure: result.failure }
            input.rejectContent()
            await input.refresh()
            return reject(result.failure)
          }
          input.confirm(result.ok)
          await input.refresh()
          if (entry.completion !== 'continue') {
            try {
              await iterator.return?.()
            } catch {
              stage = { kind: 'failed', failure: unavailable('resource-release-failed') }
              return { failure: stage.failure }
            }
            if (entry.completion === 'stream-lost') return reject(unavailable('fact-stream-failed'))
            stage = { kind: 'done' }
          } else stage = { kind: 'next' }
          continue
        }
        const batch = stage
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
          continue
        }
        if (!next.done) {
          batch.facts.push(structuredClone(next.value))
          batch.bytes += Buffer.byteLength(JSON.stringify(next.value), 'utf8')
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
          continue
        batch.timer?.abort()
        stage = {
          kind: 'ready',
          window: batch.window,
          facts: batch.facts,
          completion: next.done ? 'stream-lost' : terminal ? 'terminal' : 'continue',
        }
      }
      return { ok: undefined }
    },
  }
}
