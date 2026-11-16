import { randomUUID } from 'node:crypto'
import type {
  AssemblyCall,
  CompactionPlan,
  ContextReadGroup,
  ContextTarget,
  HistoryEvidence,
  PlanProgress,
  SnapshotMaterial,
  StepRequest,
} from '@omne-harness/request-context-contract'
import type { Adoption, DurableEvidence } from '@omne-harness/request-context-contract'
import type { ContextReader, Cursor, EligibilityId } from '@omne-harness/runtime-context-contract'
import { canonical, mintRecord, readRecord, type RecordKey, type RecordKind } from './records.ts'
import type { StagedGroups } from './staging.ts'

export type Place = Readonly<{
  tenant: string
  scope: string
  execution: string
  attachment: string
}>

export type ReadMaterial = Readonly<{
  place: Place
  target: ContextTarget
  history: HistoryEvidence
  group: ContextReadGroup
  transition: DurableEvidence | null
}>

export type LatestRead = Readonly<{
  eligibility: EligibilityId
  reader: ContextReader
  cursor: Cursor
  snapshot: SnapshotMaterial
  recipient: string
}>

export type PlanMaterial<P> = Readonly<{
  place: Place
  target: ContextTarget
  call: Omit<AssemblyCall<P>, 'access'>
  plan: CompactionPlan
  progress: PlanProgress
  step: StepRequest
  groups: StagedGroups<P>
}>

class Bounded<V> {
  private readonly entries = new Map<string, V>()
  private readonly capacity: number
  private readonly dropped: (value: V, successor: V | null) => void
  constructor(
    capacity: number,
    dropped: (value: V, successor: V | null) => void = () => undefined,
  ) {
    this.capacity = capacity
    this.dropped = dropped
  }
  get(key: string): V | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }
  set(key: string, value: V): void {
    const previous = this.entries.get(key)
    this.entries.delete(key)
    this.entries.set(key, value)
    if (previous !== undefined) this.dropped(previous, value)
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= this.capacity) break
      this.entries.delete(oldest)
      this.dropped(entry, null)
    }
  }
  delete(key: string): void {
    const value = this.entries.get(key)
    if (value === undefined) return
    this.entries.delete(key)
    this.dropped(value, null)
  }
  keys(): readonly string[] {
    return [...this.entries.keys()]
  }
  clear(): void {
    for (const key of this.keys()) this.delete(key)
  }
}

export type ContextMaterialsOptions = Readonly<{
  owner: Adoption
  capacity: number
}>

export interface ContextMaterials<P = unknown> {
  readonly owner: Adoption
  mint(kind: RecordKind, place: Place, content: unknown): DurableEvidence
  key(evidence: DurableEvidence): RecordKey | null
  putRead(evidence: DurableEvidence, material: ReadMaterial): void
  read(evidence: DurableEvidence): ReadMaterial | undefined
  latest(place: Place): LatestRead | undefined
  setLatest(place: Place, latest: LatestRead): void
  dropScope(tenant: string, scope: string): void
  putPlan(evidence: DurableEvidence, material: PlanMaterial<P>): void
  plan(evidence: DurableEvidence): PlanMaterial<P> | undefined
  close(): void
}

const placeKey = (place: Place) => canonical(place)
const evidenceKey = (evidence: DurableEvidence) => `${evidence.record}\u0000${evidence.digest}`

export function createContextMaterials<P>(options: ContextMaterialsOptions): ContextMaterials<P> {
  const { owner, capacity } = options
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new RangeError('The material capacity must be a positive safe integer')
  // A new instance after a restart must not take the records of an earlier one as its own.
  const instance = randomUUID()
  let sequence = 0
  const reads = new Bounded<ReadMaterial>(capacity)
  const latest = new Bounded<LatestRead & { place: Place }>(capacity, (entry, successor) => {
    if (successor?.reader !== entry.reader) void entry.reader.end().catch(() => undefined)
  })
  const plans = new Bounded<PlanMaterial<P>>(capacity)
  return {
    owner,
    mint: (kind, place, content) =>
      mintRecord(owner, { kind, ...place, instance, sequence: ++sequence }, content),
    key: evidence => readRecord(owner, evidence),
    putRead: (evidence, material) => reads.set(evidenceKey(evidence), material),
    read: evidence => reads.get(evidenceKey(evidence)),
    latest: place => latest.get(placeKey(place)),
    setLatest: (place, entry) => latest.set(placeKey(place), { ...entry, place }),
    dropScope(tenant, scope) {
      for (const key of latest.keys()) {
        const entry = latest.get(key)
        if (entry?.place.tenant === tenant && entry.place.scope === scope) latest.delete(key)
      }
    },
    putPlan: (evidence, material) => plans.set(evidenceKey(evidence), material),
    plan: evidence => plans.get(evidenceKey(evidence)),
    close() {
      latest.clear()
      reads.clear()
      plans.clear()
    },
  }
}
