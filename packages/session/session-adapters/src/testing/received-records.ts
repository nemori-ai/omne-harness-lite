import type {
  AgentExecutionId,
  CommandReceipt,
  ConsumptionId,
  DurableEvidence,
  Material,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  batchEvidence,
  type BlobStore,
  type Mint,
  type PublishedBatch,
  type ReceivedView,
  type ResultView,
  type Stamp,
} from '../journal/index.ts'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { canonical } from './canonical.ts'
import { needClosed, peekClosed, type ClosedTable } from './closed-items.ts'
import { journalEvidence, revisionOf } from './journal-values.ts'
import type { Stored } from './material-table.ts'

// What a core keeps of a received delivery, and how it reads that back from a closed result.

export type Kept = { entry: ReceivedEntry; receipt: CommandReceipt; saved: DurableEvidence | null }

const methodOf = (key: string): string => key.split(':')[0] ?? ''

export const savedOf = (received: ReceivedView): DurableEvidence | null =>
  methodOf(received.digest) === 'received' ? received.saved : null

export function stampReceipt(
  mint: Mint,
  execution: AgentExecutionId,
  stamp: Stamp,
): CommandReceipt {
  const method = methodOf(stamp.digest)
  return {
    operation: stamp.op,
    execution,
    revision: revisionOf(stamp.revision),
    evidence: batchEvidence(
      mint,
      { execution, pub: stamp.pub, envelope: { digest: stamp.digest } } as PublishedBatch,
      stamp.revision,
    ),
    state: method === 'submit' || method === 'control' ? 'accepted' : 'applied',
  }
}

export type RecordScope = Readonly<{
  tenantText: string
  execution: AgentExecutionId
  mint: Mint
  blobs: BlobStore
}>

export function scopeOf(
  tenant: TenantId,
  execution: AgentExecutionId,
  mint: Mint,
  blobs: BlobStore,
): RecordScope {
  const encoded = tenantCodec.encode(tenant)
  return { tenantText: encoded.ok ? encoded.value : '', execution, mint, blobs }
}

export type ReceivedRecord = Readonly<{ delivery: string; kept: Kept; material: Stored | null }>

function block<T>(blobs: BlobStore, ref: Readonly<{ digest: string }>): T {
  const value = blobs.get(ref.digest)
  if (value === undefined) throw new TypeError(`the core holds no content block ${ref.digest}`)
  return structuredClone(value) as T
}

const RECEIVED_MATERIAL = 'received-material'

// Where a received entry's material is kept: the source names the execution and the consumption.
export const receivedMaterialSource = (
  namespace: string,
  tenantText: string,
  execution: AgentExecutionId,
  entry: Omit<ReceivedEntry, 'material'>,
): DurableEvidence =>
  journalEvidence(
    canonical([
      namespace,
      RECEIVED_MATERIAL,
      canonical([tenantText, execution]),
      entry.delivery.key,
      entry.consumer,
      entry.consumption,
    ]),
    1,
  )

export function sourceNames(
  namespace: string,
  source: DurableEvidence,
): Readonly<{ tenant: string; execution: AgentExecutionId; consumption: ConsumptionId }> | null {
  try {
    const parts = JSON.parse(source.record) as unknown
    if (!Array.isArray(parts) || parts[0] !== namespace || parts[1] !== RECEIVED_MATERIAL)
      return null
    const [tenant, execution] = JSON.parse(String(parts[2])) as [string, AgentExecutionId]
    return { tenant, execution, consumption: parts[5] as ConsumptionId }
  } catch {
    return null
  }
}

export const deliveryOf = (
  tenantText: string,
  execution: AgentExecutionId,
  entry: Pick<ReceivedEntry, 'delivery'>,
): string => canonical([tenantText, execution, entry.delivery.producer, entry.delivery.key])

// The delivery, kept entry and material a received view stands for.
export function receivedRecord(scope: RecordScope, received: ReceivedView): ReceivedRecord {
  const entry = block<ReceivedEntry>(scope.blobs, received.custody)
  return {
    delivery: deliveryOf(scope.tenantText, scope.execution, entry),
    kept: {
      entry,
      receipt: stampReceipt(scope.mint, scope.execution, received),
      saved: savedOf(received),
    },
    material:
      received.material === null
        ? null
        : {
            tenant: scope.tenantText,
            execution: scope.execution,
            value: block<Material<ContentBlock>>(scope.blobs, received.material),
          },
  }
}

// A result the core no longer holds open, read back by its consumption; a read that must know asks
// with need.
export function closedReceived(
  table: ClosedTable,
  scope: RecordScope,
  consumption: ConsumptionId,
  need: boolean,
): ReceivedRecord | undefined {
  const ref = { execution: scope.execution, family: 'result', item: consumption }
  const body = (need ? needClosed(table, ref) : peekClosed(table, ref)) as ResultView | null
  if (body === null || body.received === null) return undefined
  return receivedRecord(scope, body.received)
}
