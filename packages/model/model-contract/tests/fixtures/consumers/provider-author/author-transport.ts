// A transport as a provider author writes it: only the ports of the contract, no provider, no
// Cordis. It sends the business request when the stream starts and at no earlier step, runs each
// step once, and ends its stream with one termination. It measures nothing: a request that reaches
// it is sent. When the supplier refuses the request, the stream ends with the fault that the refusal
// maps to, and the transport does not send again. The two defect options write a defect on purpose,
// so that the conformance suite has something to refuse.
import { succeed } from '@omne-harness/operation-result'
import type {
  MaterializedTransport,
  ModelTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract'
import { terminationOfRefusal, type SupplierRefusal } from './author-response.ts'

export type TransportDefects = Readonly<{
  /** The request leaves at `prepare`, before anyone asked for it to be sent. */
  sendsAtPrepare?: boolean
  /** The stream gives its facts and then runs out without a termination. */
  neverEnds?: boolean
}>

export type AuthorTransport = Readonly<{ transport: ModelTransport; sends(): number }>

export function createAuthorTransport(
  defects: TransportDefects = {},
  refusal: SupplierRefusal | null = null,
): AuthorTransport {
  let sends = 0

  async function* facts(signal: AbortSignal): AsyncGenerator<TransportFact> {
    if (signal.aborted) {
      yield { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } }
      return
    }
    if (refusal !== null) {
      yield { kind: 'ended', termination: terminationOfRefusal(refusal) }
      return
    }
    yield { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
    yield { kind: 'block-delta', index: '0', delta: 'hello' }
    if (defects.neverEnds !== true)
      yield { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }
  }

  const transport: ModelTransport = {
    async prepare(request, supplier) {
      if (defects.sendsAtPrepare === true) sends += 1
      let materialized = false
      let started = false
      const ready: MaterializedTransport = {
        receipt: {
          supplier: supplier.adoption,
          representation: request.representation,
          payloadDigest: `payload-${request.source.digest}`,
        },
        start(signal) {
          if (started) throw new Error('this transport already started')
          started = true
          sends += 1
          return facts(signal)
        },
        async close() {},
      }
      const prepared: PreparedTransport = {
        async materialize() {
          if (materialized) throw new Error('this transport already materialized')
          materialized = true
          return succeed(ready)
        },
        async close() {},
      }
      return succeed(prepared)
    },
  }
  return { transport, sends: () => sends }
}
