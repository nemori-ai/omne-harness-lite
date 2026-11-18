import { isDeepStrictEqual } from 'node:util'
import type { ModelCommandsEvidence } from '@omne-harness/model/commands'
import type { ModelFailure } from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  SendDemand,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import { dispatchKey } from './materialization-proof.ts'

export type ReceiveProofInput = Parameters<ModelCommandsEvidence['receive']>[0]
export interface ModelReceiveEvidenceReader {
  prove(input: ReceiveProofInput): ReturnType<ModelCommandsEvidence['receive']>
}
export type ReceiveEvidenceOptions = Readonly<{
  execution(input: ExecutionRef): { ok: ActorRef } | { failure: ModelFailure }
}>

export type ReceiveRecord = Readonly<{
  yielded(fact: TransportFact): void
  bodyClaimed(): void
  prove(window: string, batch: readonly TransportFact[]): boolean
}>

const UNPROVEN = Object.freeze({
  kind: 'unavailable',
  dependency: 'model-receive-evidence',
  diagnostic: 'receive-window-unproven',
} satisfies ModelFailure)

type Proven = Readonly<{ window: string; batch: readonly TransportFact[] }>

// The rules and why they prove that no content was handed out: verification/proofs/receive-evidence.md
export function createReceiveRecord(): ReceiveRecord {
  let tail: TransportFact[] = []
  let bodyRead = false
  let ended = false
  let voided = false
  let last: Proven | null = null

  function refuse(): false {
    voided = true
    tail = []
    return false
  }

  return {
    yielded(fact) {
      if (voided) return
      tail.push(structuredClone(fact))
      if (fact.kind === 'ended') ended = true
    },
    bodyClaimed() {
      bodyRead = true
    },
    prove(window, batch) {
      if (voided) return false
      if (last?.window === window) return isDeepStrictEqual(last.batch, batch) || refuse()
      if ((bodyRead && !ended) || !isDeepStrictEqual(tail, batch)) return refuse()
      last = { window, batch: tail }
      tail = []
      return true
    },
  }
}

export function receiveRecords(options: ReceiveEvidenceOptions) {
  const records = new Map<string, Readonly<{ owner: object; record: ReceiveRecord }>>()
  const reader: ModelReceiveEvidenceReader = Object.freeze({
    prove(input: ReceiveProofInput) {
      if (input.execution === null) return { failure: UNPROVEN }
      const qualification = options.execution(input.execution)
      if ('failure' in qualification) return qualification
      const id = dispatchKey(input)
      const held = id === null ? undefined : records.get(id)
      if (held === undefined || !held.record.prove(input.window, input.facts))
        return { failure: UNPROVEN }
      return {
        ok: {
          window: input.window,
          batchDigest: input.batchDigest,
          paused: true as const,
          noPrefetch: true as const,
        },
      }
    },
  })
  return {
    reader,
    open(owner: object, demand: SendDemand<unknown>): ReceiveRecord | null {
      const id = dispatchKey(demand)
      if (id === null || records.has(id)) return null
      const record = createReceiveRecord()
      records.set(id, { owner, record })
      return record
    },
    release(owner: object, demand: SendDemand<unknown>): void {
      const id = dispatchKey(demand)
      if (id !== null && records.get(id)?.owner === owner) records.delete(id)
    },
  }
}

export function recordingFacts(
  source: AsyncIterable<TransportFact>,
  record: ReceiveRecord,
): AsyncIterable<TransportFact> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]()
      return {
        async next() {
          const result = await iterator.next()
          if (!result.done) record.yielded(result.value)
          return result
        },
        return: async () => (await iterator.return?.()) ?? { done: true, value: undefined },
        throw: async (error: unknown) => {
          if (iterator.throw) return iterator.throw(error)
          throw error
        },
      }
    },
  }
}
