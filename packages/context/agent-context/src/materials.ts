import { randomUUID } from 'node:crypto'
import type { Adoption, DurableEvidence } from '@omne-harness/request-context-contract'
import { mintRecord, readRecord, type RecordKey, type RecordKind } from './records.ts'

export type Place = Readonly<{
  tenant: string
  scope: string
  execution: string
  attachment: string
}>

export type ContextMaterialsOptions = Readonly<{
  owner: Adoption
}>

export interface ContextMaterials {
  readonly owner: Adoption
  mint(kind: RecordKind, place: Place, content: unknown): DurableEvidence
  key(evidence: DurableEvidence): RecordKey | null
}

export function createContextMaterials(options: ContextMaterialsOptions): ContextMaterials {
  const { owner } = options
  // A new instance after a restart must not take the records of an earlier one as its own.
  const instance = randomUUID()
  let sequence = 0
  return {
    owner,
    mint: (kind, place, content) =>
      mintRecord(owner, { kind, ...place, instance, sequence: ++sequence }, content),
    key: evidence => readRecord(owner, evidence),
  }
}
