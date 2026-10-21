import { nonEmpty } from './parts.ts'
import { closedFields, hasDuplicates } from './values.ts'

declare const recordEntryRefBrand: unique symbol
/** Opaque reference to one record entry. The history holder mints it; consumers compare it exactly. */
export type RecordEntryRef = string & { readonly [recordEntryRefBrand]: true }

/** Durable evidence of how the summary and the retained set were derived. This package does not interpret it. */
export type CompactionDerivation = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

export type CompactedRange = Readonly<{ from: RecordEntryRef; to: RecordEntryRef }>

/** The three keys that only a `compaction` message has. */
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

// A listed key that the type lacks fails to compile. A key that the type has and the list lacks
// fails where `readCovers` and `readDerivation` build the value.
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

/** Parse an entry reference from the history holder. Any non-empty text is kept as it is. */
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
  if (!Array.isArray(raw)) return undefined
  const items: readonly unknown[] = raw
  const refs: RecordEntryRef[] = []
  for (let index = 0; index < items.length; index += 1) {
    const ref = entryRef(items[index])
    if (ref === null) return undefined
    refs.push(ref)
  }
  return hasDuplicates(refs) ? undefined : Object.freeze(refs)
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

/**
 * The three keys of a `compaction` message, in the order covers, retained, derivation. The first
 * failure is returned. Each success value is a frozen copy that shares nothing with the input.
 */
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
