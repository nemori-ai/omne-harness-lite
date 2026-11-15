import { closedFields, hasDuplicates, nonEmpty, readDataItems } from './values.ts'

declare const recordEntryRefBrand: unique symbol
export type RecordEntryRef = string & { readonly [recordEntryRefBrand]: true }

export type CompactionDerivation = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

export type CompactedRange = Readonly<{ from: RecordEntryRef; to: RecordEntryRef }>

export interface CompactionKeys {
  readonly covers: CompactedRange
  readonly retained: readonly RecordEntryRef[]
  readonly derivation: CompactionDerivation
}

export const COMPACTION_KEYS = [
  'covers',
  'retained',
  'derivation',
] as const satisfies readonly (keyof CompactionKeys)[]

export type CompactionKeyRejection = (typeof COMPACTION_KEYS)[number]

export type CompactionKeysJudgment =
  | { readonly ok: CompactionKeys }
  | { readonly rejected: CompactionKeyRejection }

const COVERS_KEYS = ['from', 'to'] as const satisfies readonly (keyof CompactedRange)[]
const DERIVATION_KEYS = [
  'owner',
  'record',
  'revision',
  'digest',
] as const satisfies readonly (keyof CompactionDerivation)[]

function isRecordEntryRef(raw: string): raw is RecordEntryRef {
  return raw.length > 0
}

export function parseRecordEntryRef(raw: string): RecordEntryRef | null {
  return isRecordEntryRef(raw) ? raw : null
}

function entryRef(value: unknown): RecordEntryRef | null {
  return typeof value === 'string' ? parseRecordEntryRef(value) : null
}

function readCovers(raw: unknown): CompactedRange | undefined {
  const fields = closedFields(raw, COVERS_KEYS)
  if (fields === undefined) return undefined
  const from = entryRef(fields.from)
  const to = entryRef(fields.to)
  if (from === null || to === null) return undefined
  return Object.freeze({ from, to })
}

function readRetained(raw: unknown): readonly RecordEntryRef[] | undefined {
  const refs = readDataItems(raw, item => entryRef(item) ?? undefined)
  return refs === undefined || hasDuplicates(refs) ? undefined : Object.freeze(refs)
}

function readDerivation(raw: unknown): CompactionDerivation | undefined {
  const fields = closedFields(raw, DERIVATION_KEYS)
  if (fields === undefined) return undefined
  const { owner, record, revision, digest } = fields
  if (!nonEmpty(owner) || !nonEmpty(record) || !nonEmpty(revision) || !nonEmpty(digest)) {
    return undefined
  }
  return Object.freeze({ owner, record, revision, digest })
}

export function judgeCompactionKeys(
  fields: Readonly<Record<string, unknown>>,
): CompactionKeysJudgment {
  const covers = readCovers(fields.covers)
  if (covers === undefined) return { rejected: 'covers' }
  const retained = readRetained(fields.retained)
  if (retained === undefined) return { rejected: 'retained' }
  const derivation = readDerivation(fields.derivation)
  if (derivation === undefined) return { rejected: 'derivation' }
  return { ok: { covers, retained, derivation } }
}
