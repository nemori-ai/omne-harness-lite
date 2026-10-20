import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  DurableEvidence,
  PreparationRecord,
  RawOutput,
  ReleaseRecord,
  ToolOperationId,
  ToolFailure,
  ToolResult,
} from '@omne-harness/tool-contract'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { digestOf } from './evidence.ts'
import { operationRecord, put, recall, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { CallRecord, LedgerWrite } from './ledger-store.ts'

/** Domain-separated digests fit even when a provider's original operation is at its size limit. */
export function settlementOperation(
  purpose: 'retain-result' | 'release-environment',
  place: unknown,
): ToolOperationId {
  const decoded = decodeToolOperationId(`${purpose}:${digestOf(place)}`)
  if ('failure' in decoded) throw new Error('invalid internal settlement operation')
  return decoded.ok
}

/** Immutable event history includes references replaced in the current process projection. */
export function processCustodyCovered<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  raw: RawOutput,
  value: ToolResult<B>,
): boolean {
  const retained = [raw.content, ...value.attachments]
  return [...snapshot.facts.values()].every(
    saved =>
      saved.fact.kind !== 'process' ||
      saved.fact.blocks.every(({ content }) => {
        if ('ref' in content) return retained.some(ref => sameFactValue(ref, content.ref))
        return content.kind !== 'file'
      }),
  )
}

export function releaseIntent(preparation: PreparationRecord, custody: DurableEvidence) {
  return { preparation, custody }
}

/** Both automatic and public planning use this canonical record and write set. */
export function planEnvironmentRelease<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  call: CallRecord,
  final: DurableEvidence,
  custody: DurableEvidence,
  mint: Mint,
): Outcome<
  Readonly<{ release: ReleaseRecord; writes: readonly LedgerWrite<B>[] }> | null,
  ToolFailure
> {
  const environment = call.environment
  if (environment === null) return succeed(null)
  const preparation = call.preparations.find(item => item.operation === environment.preparation)
  if (preparation === undefined) return succeed(null)
  const known = snapshot.releases.get(preparation.operation)
  if (known !== undefined) return succeed({ release: known.release, writes: [] })
  const operation = settlementOperation('release-environment', {
    tenant: call.tenant,
    call: call.call,
    preparation: preparation.operation,
    final,
  })
  const inputDigest = digestOf(releaseIntent(preparation, custody))
  const operationReceipt = recall(snapshot, operation, inputDigest, 'plan-release')
  if ('failure' in operationReceipt) return operationReceipt
  const release: ReleaseRecord = {
    tenant: call.tenant,
    call: call.call,
    operation,
    adoption: preparation.adoption,
    inputDigest,
    preparation: preparation.operation,
    resource: environment.resources,
    custody,
  }
  return succeed({
    release,
    writes: [
      put({
        kind: 'environment-release',
        environmentRelease: {
          release,
          progress: { kind: 'pending', diagnostic: 'environment-release-pending' },
        },
      }),
      put({
        kind: 'task',
        task: {
          kind: 'release',
          operation,
          state: 'pending',
          diagnostic: null,
          release,
        },
      }),
      put(operationRecord({ ...release, inputDigest }, { kind: 'plan-release', release }, mint)),
    ],
  })
}
