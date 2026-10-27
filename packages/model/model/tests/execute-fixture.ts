import type {
  Adoption,
  FixedModelRequest,
  MaterializationReceipt,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  MaterializedTransport,
  ModelTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'

export const adoption = (name: string): Adoption => ({
  owner: 'execute-test',
  name,
  revision: '1',
  digest: `digest-${name}`,
})
export const request: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [
    {
      adoption: adoption('supplier'),
      recipient: 'recipient',
      model: 'model',
      credential: { kind: 'factory' },
    },
  ],
  fallback: true,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'recipient/model', accepts: ['recipient/model'], foreignThinking: 'omit' },
  ],
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}
export const receipt: MaterializationReceipt = {
  supplier: request.suppliers[0].adoption,
  representation: request.representation,
  payloadDigest: 'payload',
}
export const ended = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
} satisfies TransportFact
export const delta = { kind: 'block-delta', index: '0', delta: 'visible' } satisfies TransportFact
export const SECRET = 'secret-body-credential-abort-reason'
export const signal = () => new AbortController().signal

export function scripted() {
  return createScriptedTransport({
    receipt,
    facts: [delta],
    ending: { kind: 'terminated', termination: ended.termination },
    rejection: null,
  })
}

export function gate() {
  let open = () => {}
  const wait = new Promise<void>(resolve => {
    open = resolve
  })
  return { wait, open }
}

export function controlled(
  options: Readonly<{
    prepare?: () => Promise<void>
    materialize?: () => Promise<void>
    rejection?: Readonly<{ at: 'prepare' | 'materialize'; failure: TransportFailure }>
    prepareOutcome?: (
      result: Outcome<PreparedTransport, TransportFailure>,
    ) => Outcome<PreparedTransport, TransportFailure>
    materializeOutcome?: (
      result: Outcome<MaterializedTransport, TransportFailure>,
    ) => Outcome<MaterializedTransport, TransportFailure>
    receipt?: () => MaterializationReceipt
    start?: (signal: AbortSignal) => AsyncIterable<TransportFact>
    next?: () => Promise<IteratorResult<TransportFact>>
    facts?: readonly TransportFact[]
    cleanupFailures?: readonly string[]
    closing?: (step: string) => Promise<void>
  }> = {},
) {
  const calls: string[] = []
  const signals: AbortSignal[] = []
  let index = 0
  const iterator: AsyncIterableIterator<TransportFact> = {
    [Symbol.asyncIterator]() {
      calls.push('iterator')
      return this
    },
    async next() {
      calls.push('next')
      if (options.next) return options.next()
      const fact = (options.facts ?? [delta, ended])[index++]
      return fact === undefined ? { done: true, value: undefined } : { done: false, value: fact }
    },
    async return() {
      calls.push('return')
      await options.closing?.('return')
      if (options.cleanupFailures?.includes('return')) throw new Error(SECRET)
      return { done: true, value: undefined }
    },
  }
  const materialized: MaterializedTransport = {
    get receipt() {
      return options.receipt?.() ?? receipt
    },
    start(given) {
      calls.push('start')
      signals.push(given)
      return options.start?.(given) ?? iterator
    },
    async close() {
      calls.push('materialized.close')
      await options.closing?.('materialized.close')
      if (options.cleanupFailures?.includes('materialized.close')) throw new Error(SECRET)
    },
  }
  const prepared: PreparedTransport = {
    async materialize(given) {
      calls.push('materialize')
      signals.push(given)
      await options.materialize?.()
      const result =
        options.rejection?.at === 'materialize'
          ? fail(options.rejection.failure)
          : succeed(materialized)
      return options.materializeOutcome?.(result) ?? result
    },
    async close() {
      calls.push('prepared.close')
      await options.closing?.('prepared.close')
      if (options.cleanupFailures?.includes('prepared.close')) throw new Error(SECRET)
    },
  }
  const transport: ModelTransport = {
    async prepare() {
      calls.push('prepare')
      await options.prepare?.()
      const result =
        options.rejection?.at === 'prepare' ? fail(options.rejection.failure) : succeed(prepared)
      return options.prepareOutcome?.(result) ?? result
    },
  }
  return { transport, calls, signals }
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const facts: T[] = []
  for await (const fact of iterable) facts.push(fact)
  return facts
}
