import { randomUUID } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ControlProgress, DurableEvidence, ToolStartRecord } from '@omne-harness/tool-contract'
import type {
  ControlDispatch,
  FactBatch,
  ToolExecutionFact,
  ToolLiveExecution,
  ToolStartLookup,
} from '@omne-harness/tool-contract/provider'

export function localAuthorEvidence(record: string, value: unknown): DurableEvidence {
  return { owner: 'tool-host-local', record, revision: '1', digest: canonicalDigest(value) }
}

export interface LocalAuthorExecution {
  readonly live: ToolLiveExecution
  readonly signal: AbortSignal
  readonly source: DurableEvidence
  publish(fact: ToolExecutionFact): void
  inspect(): ToolStartLookup
  pendingAcknowledgements(): number
  observationAvailable(available: boolean): void
  lose(continuity: DurableEvidence): void
}

export function createLiveAuthorExecution(
  input: Readonly<{
    start: ToolStartRecord
    release(): void
  }>,
): LocalAuthorExecution {
  const controller = new AbortController()
  const source = localAuthorEvidence(randomUUID(), input.start)
  const batches: FactBatch[] = []
  const acknowledgements = new Map<string, { digest: string; evidence: DurableEvidence }>()
  const controls = new Map<string, { digest: string; value: ControlProgress }>()
  const listeners = new Set<() => void>()
  let lookup: ToolStartLookup
  let readable = true
  let ended = false
  const wake = () => {
    for (const listener of listeners) listener()
  }
  const matches = (control: ControlDispatch) =>
    canonicalDigest(control.start) === canonicalDigest(input.start) &&
    canonicalDigest(control.tenant) === canonicalDigest(input.start.execution.tenant) &&
    control.call === input.start.execution.call
  const publish = (fact: ToolExecutionFact): void => {
    if (ended) throw new Error('the author execution ended')
    const cursor = String(batches.length + 1)
    const event = `${source.record}/${cursor}`
    batches.push({
      start: input.start,
      source,
      batch: cursor,
      after: batches.at(-1)?.cursor ?? null,
      cursor,
      events: [{ event, fact }],
    })
    if (fact.kind === 'final') {
      ended = true
      lookup = { kind: 'settled', source, event, fact }
      for (const control of controls.values()) {
        if (control.value.kind === 'accepted')
          control.value = { kind: 'stopped', evidence: control.value.evidence }
      }
    }
    wake()
  }
  const live: ToolLiveExecution = {
    async *facts({ after, signal }) {
      let index = after === null ? 0 : batches.findIndex(batch => batch.cursor === after) + 1
      if (after !== null && index === 0) throw new Error('unknown author fact cursor')
      while (!signal.aborted) {
        const batch = batches[index]
        if (batch !== undefined) {
          index += 1
          yield batch
          continue
        }
        if (ended) return
        await new Promise<void>(resolve => {
          const notify = () => {
            listeners.delete(notify)
            signal.removeEventListener('abort', notify)
            resolve()
          }
          listeners.add(notify)
          signal.addEventListener('abort', notify, { once: true })
          if (signal.aborted) notify()
        })
      }
    },
    async acknowledge(receipt) {
      const batch = batches.find(item => item.batch === receipt.batch)
      if (receipt.start !== input.start.operation || batch?.cursor !== receipt.cursor)
        return fail({ kind: 'invalid', field: 'receipt', reason: 'foreign or unknown fact batch' })
      const digest = canonicalDigest(receipt)
      const previous = acknowledgements.get(receipt.batch)
      if (previous !== undefined)
        return previous.digest === digest
          ? succeed(previous.evidence)
          : fail({ kind: 'conflict', operation: input.start.operation })
      const evidence = localAuthorEvidence(`ack/${source.record}/${receipt.batch}`, receipt)
      acknowledgements.set(receipt.batch, { digest, evidence })
      if (ended && acknowledgements.size === batches.length) input.release()
      return succeed(evidence)
    },
    async stop(control) {
      if (!matches(control)) return fail({ kind: 'denied', action: 'stop-author' })
      const digest = canonicalDigest(control)
      const old = controls.get(control.operation)
      if (old !== undefined)
        return old.digest === digest
          ? succeed(old.value)
          : fail({ kind: 'conflict', operation: control.operation })
      const evidence = localAuthorEvidence(`stop/${source.record}/${control.operation}`, control)
      const value: ControlProgress = { kind: ended ? 'already-ended' : 'accepted', evidence }
      controls.set(control.operation, { digest, value })
      if (!ended) controller.abort(control)
      return succeed(value)
    },
    async inspectControl(control) {
      if (!matches(control)) return fail({ kind: 'denied', action: 'inspect-author-control' })
      const old = controls.get(control.operation)
      if (old !== undefined && old.digest !== canonicalDigest(control))
        return fail({ kind: 'conflict', operation: control.operation })
      if (old !== undefined) return succeed(old.value)
      return succeed(
        lookup.kind === 'lost'
          ? { kind: 'unknown', diagnostic: 'the original execution continuity is lost' }
          : { kind: 'pending', diagnostic: 'control has not been received' },
      )
    },
    async answer() {
      return fail({
        kind: 'unavailable',
        dependency: 'author-waits',
        diagnostic: 'no wait response adapter',
      })
    },
    async inspectAnswer() {
      return fail({
        kind: 'unavailable',
        dependency: 'author-waits',
        diagnostic: 'no wait response adapter',
      })
    },
  }
  lookup = { kind: 'live', execution: live }
  return {
    live,
    publish,
    signal: controller.signal,
    source,
    inspect: (): ToolStartLookup =>
      readable ? lookup : { kind: 'unknown', diagnostic: 'execution observation unavailable' },
    pendingAcknowledgements: () => batches.length - acknowledgements.size,
    observationAvailable: (available: boolean) => {
      readable = available
    },
    lose: (continuity: DurableEvidence) => {
      ended = true
      lookup = { kind: 'lost', continuity }
      wake()
    },
  }
}
