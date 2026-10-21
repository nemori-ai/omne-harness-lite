// Source verification happens outside the transaction. These decisions preserve the original duty.
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  FactProgress,
  FactReceipt,
  ToolFailure,
} from '@omne-harness/tool-contract'
import { invalid, type MutationInput } from './boundary.ts'
import { factTaskOperation, mintEvidence } from './evidence.ts'
import {
  operationRecord,
  put,
  recall,
  reply,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import { factProgress, sameFactValue } from './ledger-facts.ts'
import { factKey, taskKey, type FactBatchRecord } from './ledger-store.ts'

export type FactAcknowledgementCommand = MutationInput<unknown> &
  Readonly<{
    receipt: FactReceipt
    sourceReceipt: DurableEvidence
    inputDigest: string
  }>
type Acknowledgement =
  | Readonly<{ kind: 'recalled'; progress: FactProgress }>
  | Readonly<{ kind: 'batch'; batch: FactBatchRecord }>

/** No source call is allowed before this original operation and custody check succeeds. */
export function checkFactAcknowledgement<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: FactAcknowledgementCommand,
): Outcome<Acknowledgement, ToolFailure> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'fact-acknowledgement')
  if ('failure' in known) return known
  if (known.ok !== undefined) {
    const receipt = known.ok.receipt
    if (receipt.kind !== 'fact-acknowledgement') throw new Error('recall checked the receipt kind')
    return succeed({ kind: 'recalled', progress: structuredClone(receipt.progress) })
  }
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  const candidates = [...snapshot.batches.values()].filter(
    batch =>
      batch.start.operation === command.receipt.start && batch.batch === command.receipt.batch,
  )
  if (candidates.length === 0) return invalid('receipt.batch', 'unknown-batch')
  const batch = candidates.find(batch => sameFactValue(batch.receipt, command.receipt))
  if (batch === undefined) return invalid('receipt', 'not-original-receipt')
  if (!sameFactValue(call.start, batch.start)) return invalid('receipt', 'not-original-invocation')
  if (
    batch.acknowledgement.kind === 'confirmed' &&
    !sameFactValue(batch.acknowledgement.sourceReceipt, command.sourceReceipt)
  )
    return invalid('sourceReceipt', 'source-confirmation-mismatch')
  return succeed({ kind: 'batch', batch })
}

export function decideFactAcknowledgement<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: FactAcknowledgementCommand,
  mint: Mint,
): Decision<FactProgress, B> {
  const checked = checkFactAcknowledgement(snapshot, command)
  if ('failure' in checked) return reply(checked)
  if (checked.ok.kind === 'recalled') return reply(succeed(checked.ok.progress))
  const batch = checked.ok.batch
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const confirmed: FactBatchRecord = {
    ...batch,
    acknowledgement: { kind: 'confirmed', sourceReceipt: command.sourceReceipt },
  }
  const batches = new Map(snapshot.batches)
  batches.set(factKey(batch.start, batch.source.owner, batch.batch), confirmed)
  const progress = factProgress({ ...snapshot, batches }).find(
    stream =>
      factKey(stream.start, stream.source.owner) === factKey(batch.start, batch.source.owner),
  )
  if (progress === undefined) return reply(invalid('receipt', 'missing-original-stream'))
  const { source: _source, ...body } = call.state
  const state = { ...body, revision: mint.revision }
  return {
    kind: 'commit',
    value: structuredClone(progress),
    writes: [
      put({ kind: 'fact-batch', batch: confirmed }),
      put(operationRecord(command, { kind: 'fact-acknowledgement', progress }, mint)),
      {
        kind: 'delete',
        key: taskKey({
          kind: 'fact-ack',
          operation: factTaskOperation('fact-ack', {
            tenant: call.tenant,
            call: call.call,
            start: batch.start.operation,
            owner: batch.source.owner,
            batch: batch.batch,
          }),
        }),
      },
      put({
        kind: 'call',
        call: {
          ...call,
          state: {
            ...state,
            source: mintEvidence(
              'state',
              { tenant: call.tenant, call: call.call },
              mint.revision,
              state,
            ),
          },
        },
      }),
    ],
  }
}
