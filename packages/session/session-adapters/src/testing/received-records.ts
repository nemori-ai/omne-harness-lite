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
  type MaterialView,
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

// A material source names the execution that keeps it; a received one names its consumption too.
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

const PRESERVED_MATERIAL = 'material'

export const preservedSource = (
  namespace: string,
  tenantText: string,
  execution: AgentExecutionId,
  identity: unknown,
  consumer: unknown,
): DurableEvidence =>
  journalEvidence(
    canonical([
      namespace,
      PRESERVED_MATERIAL,
      canonical([tenantText, execution]),
      identity,
      consumer,
    ]),
    1,
  )

function sourceNames(
  namespace: string,
  source: DurableEvidence,
): Readonly<{
  tenant: string
  execution: AgentExecutionId
  consumption: ConsumptionId | null
}> | null {
  try {
    const parts = JSON.parse(source.record) as unknown
    if (!Array.isArray(parts) || parts[0] !== namespace) return null
    if (parts[1] !== RECEIVED_MATERIAL && parts[1] !== PRESERVED_MATERIAL) return null
    const [tenant, execution] = JSON.parse(String(parts[2])) as [string, AgentExecutionId]
    const consumption = parts[1] === RECEIVED_MATERIAL ? (parts[5] as ConsumptionId) : null
    return { tenant, execution, consumption }
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

// A result the core no longer holds open, by its consumption; a read that must know asks with need.
export function closedReceived(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  mint: Mint,
  input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  consumption: ConsumptionId,
  need: boolean,
): ReceivedRecord | undefined {
  const scope = scopeOf(input.tenant, input.execution, mint, table.blobs)
  const ref = { execution: scope.execution, family: 'result', item: consumption }
  const body = (need ? needClosed(table, ref) : peekClosed(table, ref)) as ResultView | null
  if (body === null || body.received === null) return undefined
  return receivedRecord(scope, body.received)
}

// A material the core no longer holds open: a preserved one by its source, else with its result.
export function closedMaterial(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  mint: Mint,
  tenant: TenantId,
  source: DurableEvidence,
  need: boolean,
): Stored | undefined {
  const named = sourceNames(mint.session, source)
  const encoded = tenantCodec.encode(tenant)
  if (named === null || !encoded.ok || named.tenant !== encoded.value) return undefined
  if (named.consumption === null) {
    const ref = { execution: named.execution, family: 'material', item: canonical(source) }
    const body = (need ? needClosed(table, ref) : peekClosed(table, ref)) as MaterialView | null
    if (body === null) return undefined
    return {
      tenant: named.tenant,
      execution: body.qualifier,
      value: block(table.blobs, body.value),
    }
  }
  const input = { tenant, execution: named.execution }
  const closed = closedReceived(table, mint, input, named.consumption, need)
  return closed !== undefined && canonical(closed.kept.entry.material) === canonical(source)
    ? (closed.material ?? undefined)
    : undefined
}

// Every entry a consumption received, in order: from the record, else from the closed item.
export function receivedEntries(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  execution: Readonly<{
    id: AgentExecutionId
    deliveries: ReadonlyMap<ConsumptionId, readonly ReceivedEntry[]>
  }>,
  consumption: ConsumptionId,
  held: boolean,
): readonly ReceivedEntry[] {
  const kept = execution.deliveries.get(consumption)
  if (kept !== undefined) return kept
  if (held) return []
  const ref = { execution: execution.id, family: 'delivery', item: consumption }
  const closed = needClosed(table, ref) as ReceivedView[] | null
  return (closed ?? []).map(item => block<ReceivedEntry>(table.blobs, item.custody))
}
