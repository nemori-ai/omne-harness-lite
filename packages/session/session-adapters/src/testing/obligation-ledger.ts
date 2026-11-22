import type {
  AgentOperationId,
  DurableEvidence,
  FinishObligation,
  ResponsibilityCoverage,
} from '@omne-harness/agent-contract'
import { blobOf, type Blob, type FactBody, type FactOf, type Ref } from '../journal/index.ts'
import { obligationId, refOfBlob, storedObligation } from './journal-finishing.ts'

// The obligation ledger: the facts that keep the call and result obligations of an execution, and
// the issued list of a candidate, in step with its records.

export type ObligationLedger = ReadonlyMap<string, Readonly<{ category: string; item: Ref | null }>>

export const LEDGER_KINDS: ReadonlySet<string> = new Set(['call', 'result'])

const BROAD: ReadonlySet<string> = new Set([
  'control.stage',
  'control.rejected',
  'finish.candidate',
  'intent.voided',
  'settlement.recorded',
  'exec.attached',
  'op.excluded',
])

export function touchedBy(facts: readonly FactBody[]): (item: FinishObligation) => boolean {
  if (facts.some(fact => BROAD.has(fact.kind))) return () => true
  const names = new Set<string>()
  for (const fact of facts) {
    if ('action' in fact && typeof fact.action === 'string') names.add(fact.action)
    if ('consumption' in fact && typeof fact.consumption === 'string') names.add(fact.consumption)
  }
  return item =>
    item.kind === 'call'
      ? names.has(item.action) || names.has(item.pending.consumption)
      : item.kind === 'result'
        ? names.has(item.responsibility.consumption)
        : true
}

const obligationFact = (
  id: string,
  category: string,
  item: Ref | null,
  settled: boolean,
): FactOf<'finish.obligation'> => ({ kind: 'finish.obligation', id, category, item, settled })

export function acknowledgedFacts(
  ledger: ReadonlyMap<string, Readonly<{ category: string; item: Ref | null; settled: boolean }>>,
  through: number,
): (FactOf<'ack.through'> | FactOf<'finish.obligation'>)[] {
  const facts: (FactOf<'ack.through'> | FactOf<'finish.obligation'>)[] = [
    { kind: 'ack.through', sequence: through },
  ]
  for (const [id, entry] of ledger) {
    if (entry.category !== 'output' || entry.settled) continue
    const [, key] = JSON.parse(id) as [string, string]
    const emitted = Number(/^output\/1-(\d+)$/u.exec(key)?.[1] ?? Number.NaN)
    if (emitted <= through) facts.push(obligationFact(id, entry.category, entry.item, true))
  }
  return facts
}

export function obligationChanges(
  items: readonly FinishObligation[],
  ledger: ObligationLedger,
  execution: string,
  revision: number,
  complete: ReadonlySet<string> | null,
  room: number = Number.POSITIVE_INFINITY,
  consider: (item: FinishObligation) => boolean = () => true,
  // An obligation whose call or result closed is held open, or closed: absent is not gone.
  sourceOpen: (id: string) => boolean = () => true,
  // Reads such obligations back from the store; without it the upkeep leaves them as they are.
  closedOf?: (ids: readonly string[]) => ObligationLedger,
): Readonly<{
  facts: readonly FactOf<'finish.obligation'>[]
  blobs: readonly Blob[]
  listed: readonly (readonly [id: string, digest: string])[]
}> {
  const facts: FactOf<'finish.obligation'>[] = []
  const blobs: Blob[] = []
  const listed: (readonly [string, string])[] = []
  const present = new Set<string>()
  const unseen = items.map(obligationId).filter(id => !ledger.has(id) && !sourceOpen(id))
  const closed = closedOf?.(unseen)
  for (const item of items) {
    const id = obligationId(item)
    present.add(id)
    if (!consider(item) && ledger.get(id)?.item != null) continue
    const stored = blobOf(storedObligation(item, execution, revision))
    listed.push([id, stored[0]])
    const known = ledger.get(id) ?? closed?.get(id)
    if (known === undefined && closed === undefined && !sourceOpen(id)) continue
    if (known?.item?.digest === stored[0] || facts.length >= room) continue
    facts.push(
      obligationFact(id, item.kind, refOfBlob(stored), item.disposition.kind === 'settled'),
    )
    blobs.push(stored)
  }
  if (complete !== null)
    for (const [id, entry] of ledger)
      if (
        complete.has(entry.category) &&
        entry.item !== null &&
        !present.has(id) &&
        sourceOpen(id) &&
        facts.length < room
      )
        facts.push(obligationFact(id, entry.category, null, true))
  return { facts, blobs, listed }
}

export function issueFacts(
  candidate: AgentOperationId,
  list: number,
  items: readonly FinishObligation[],
  coverage: ResponsibilityCoverage,
  evidence: DurableEvidence,
  ledger: ObligationLedger,
  execution: string,
  revision: number,
  sourceOpen: (id: string) => boolean,
  closedOf: (ids: readonly string[]) => ObligationLedger,
): Readonly<{
  facts: readonly (FactOf<'finish.obligation'> | FactOf<'finish.obligations'>)[]
  blobs: readonly Blob[]
}> {
  const changes = obligationChanges(
    items,
    ledger,
    execution,
    revision,
    null,
    undefined,
    undefined,
    sourceOpen,
    closedOf,
  )
  const listed = blobOf(changes.listed)
  const covered = blobOf(coverage)
  return {
    facts: [
      ...changes.facts,
      {
        kind: 'finish.obligations',
        candidate,
        list,
        count: items.length,
        evidence,
        coverage: refOfBlob(covered),
        listed: refOfBlob(listed),
      },
    ],
    blobs: [...changes.blobs, listed, covered],
  }
}
