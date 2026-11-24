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
  callHeld,
  refOf,
  resultKey,
  resultsUnder,
  type BlobStore,
  type ExecutionView,
  type Mint,
  type PublishedBatch,
  type ReceivedView,
  type MaterialView,
  type ResultView,
  type Stamp,
} from '../journal/index.ts'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { canonical } from './canonical.ts'
import { needClosed, needUnder, peekClosed, type ClosedTable } from './closed-items.ts'
import {
  journalEvidence,
  PRESERVED_MATERIAL,
  RECEIVED_MATERIAL,
  revisionOf,
} from './journal-values.ts'
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

export function keyVersion(key: ReceivedEntry['delivery']['key']): string {
  if (key.kind !== 'result') return refOf(key).digest
  return typeof key.result === 'string' ? key.result : key.result.version
}

function sourceNames(
  namespace: string,
  source: DurableEvidence,
): Readonly<{
  tenant: string
  execution: AgentExecutionId
  result: Readonly<{ consumption: ConsumptionId; version: string }> | null
}> | null {
  try {
    const parts = JSON.parse(source.record) as unknown
    if (!Array.isArray(parts) || parts[0] !== namespace) return null
    if (parts[1] !== RECEIVED_MATERIAL && parts[1] !== PRESERVED_MATERIAL) return null
    const [tenant, execution] = JSON.parse(String(parts[2])) as [string, AgentExecutionId]
    if (parts[1] !== RECEIVED_MATERIAL) return { tenant, execution, result: null }
    const version = keyVersion(parts[3] as ReceivedEntry['delivery']['key'])
    return { tenant, execution, result: { consumption: parts[5] as ConsumptionId, version } }
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

// A closed result by its consumption and version; a read that must know asks with need.
export function closedReceived(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  mint: Mint,
  input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  result: Readonly<{ consumption: ConsumptionId; version: string }>,
  need: boolean,
): ReceivedRecord | undefined {
  const scope = scopeOf(input.tenant, input.execution, mint, table.blobs)
  const item = resultKey(result.consumption, result.version)
  const ref = { execution: scope.execution, family: 'result', item }
  const body = (need ? needClosed(table, ref) : peekClosed(table, ref)) as ResultView | null
  if (body === null || body.received === null) return undefined
  return receivedRecord(scope, body.received)
}

export type ReleasedMaterial = Readonly<{
  tenant: string
  execution: AgentExecutionId
  released: MaterialView['value']
}>

// A material the core no longer holds open: a preserved one by its source, else with its result.
export function closedMaterial(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  mint: Mint,
  tenant: TenantId,
  source: DurableEvidence,
  need: boolean,
): Stored | ReleasedMaterial | undefined {
  const named = sourceNames(mint.session, source)
  const encoded = tenantCodec.encode(tenant)
  if (named === null || !encoded.ok || named.tenant !== encoded.value) return undefined
  if (named.result === null) {
    const ref = { execution: named.execution, family: 'material', item: canonical(source) }
    const body = (need ? needClosed(table, ref) : peekClosed(table, ref)) as MaterialView | null
    if (body === null) return undefined
    if (body.readers === 'until-release')
      return { tenant: named.tenant, execution: named.execution, released: body.value }
    return {
      tenant: named.tenant,
      execution: named.execution,
      value: block(table.blobs, body.value),
      readers: body.readers,
    }
  }
  const input = { tenant, execution: named.execution }
  const closed = closedReceived(table, mint, input, named.result, need)
  return closed !== undefined && canonical(closed.kept.entry.material) === canonical(source)
    ? (closed.material ?? undefined)
    : undefined
}

// Every entry a consumption received, in order; once no step holds the call, closed ones too.
export function receivedEntries(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  view: ExecutionView,
  consumption: ConsumptionId,
): readonly ReceivedEntry[] {
  const found = new Map<string, ReceivedView>()
  const add = (received: ReceivedView | null | undefined) => {
    if (received !== null && received !== undefined) found.set(received.delivery, received)
  }
  for (const item of view.results.values()) if (item.consumption === consumption) add(item.received)
  if (!callHeld(consumption, view)) {
    const under = { execution: view.execution, family: 'result', item: resultsUnder(consumption) }
    for (const body of needUnder(table, under).values()) add((body as ResultView).received)
  }
  return [...found.values()]
    .sort((left, right) => left.pub - right.pub)
    .map(item => block<ReceivedEntry>(table.blobs, item.custody))
}
