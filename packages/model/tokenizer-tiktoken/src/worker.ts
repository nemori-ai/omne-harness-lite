import { parentPort } from 'node:worker_threads'
import { fail } from '@omne-harness/operation-result'
import { PieceCache } from './piece-cache.ts'
import { createWorkerTokenizer, type WorkerTokenizer } from './tokenizer.ts'
import { parseCommand, type WorkerCommand, type WorkerReply } from './worker-protocol.ts'

type WorkerState = Readonly<{
  generation: number
  tokenizers: readonly WorkerTokenizer[]
  cache: PieceCache
}>
const port = parentPort
if (port === null) throw new Error('tokenizer worker requires a parent port')
let state: WorkerState | undefined
function reply(value: WorkerReply): void {
  port?.postMessage(value)
}

function initialize(command: Extract<WorkerCommand, { kind: 'initialize' }>): void {
  if (state !== undefined) throw new Error('tokenizer worker is already initialized')
  try {
    const tokenizers: WorkerTokenizer[] = []
    for (const resources of command.input.resources) {
      const created = createWorkerTokenizer(resources)
      if ('failure' in created) {
        reply({
          kind: 'initialization-failed',
          generation: command.generation,
          diagnostic:
            created.failure.kind === 'unavailable'
              ? created.failure.diagnostic
              : JSON.stringify(created.failure),
        })
        return
      }
      tokenizers.push(created.ok)
    }
    state = {
      generation: command.generation,
      tokenizers,
      cache: new PieceCache(command.input.limits),
    }
    reply({ kind: 'ready', generation: command.generation })
  } catch (error) {
    reply({
      kind: 'initialization-failed',
      generation: command.generation,
      diagnostic: error instanceof Error ? error.message : 'tokenizer initialization failed',
    })
  }
}

function count(current: WorkerState, command: Extract<WorkerCommand, { kind: 'count' }>): void {
  const tokenizer = current.tokenizers[command.resource]
  if (tokenizer === undefined) throw new Error('tokenizer resource is not initialized')
  const cancellation = new Int32Array(command.cancellation)
  const cancelled = () => {
    if (Atomics.load(cancellation, 0) !== 0) throw new Error('tokenizer count cancelled')
  }
  try {
    cancelled()
    const result = tokenizer.count(command.segments, command.lease, current.cache, cancelled)
    cancelled()
    reply({
      kind: 'counted',
      generation: command.generation,
      job: command.job,
      lease: command.lease,
      result,
      stats: current.cache.snapshot(),
    })
  } catch (error) {
    reply({
      kind: 'counted',
      generation: command.generation,
      job: command.job,
      lease: command.lease,
      result: fail({
        kind: 'unavailable',
        diagnostic: error instanceof Error ? error.message : 'tokenizer count failed',
      }),
      stats: current.cache.snapshot(),
    })
  }
}

function receive(message: unknown): void {
  const command = parseCommand(message)
  if (command.kind === 'initialize') {
    initialize(command)
    return
  }
  if (state === undefined || command.generation !== state.generation)
    throw new Error('tokenizer worker generation mismatch')
  if (command.kind === 'clear') {
    state.cache.clear(command.lease)
    reply({
      kind: 'cleared',
      generation: command.generation,
      lease: command.lease,
      stats: state.cache.snapshot(),
    })
    return
  }
  count(state, command)
}

port.on('message', receive)
