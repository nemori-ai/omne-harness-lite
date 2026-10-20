import { isPlainRecord } from './parts.ts'

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

export type CompactionKeyRejection = 'covers' | 'retained' | 'derivation'

/** The three keys that only a `compaction` message has. */
export interface CompactionKeys {
  readonly covers: CompactedRange
  readonly retained: readonly RecordEntryRef[]
  readonly derivation: CompactionDerivation
}

export type CompactionKeysJudgment =
  | { readonly ok: CompactionKeys }
  | { readonly rejected: CompactionKeyRejection }

export const COMPACTION_KEYS = ['covers', 'retained', 'derivation'] as const

const COVERS_KEYS = ['from', 'to'] as const
const DERIVATION_KEYS = ['owner', 'record', 'revision', 'digest'] as const

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

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * The values of a plain object whose own keys are exactly `keys`, each an enumerable data
 * property. An accessor is never called: it makes the object unreadable, as does a symbol key.
 */
function closedValues(value: unknown, keys: readonly string[]): readonly unknown[] | undefined {
  if (!isPlainRecord(value)) return undefined
  const own = Reflect.ownKeys(value)
  if (own.length !== keys.length || !keys.every(key => own.includes(key))) return undefined
  const values: unknown[] = []
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)) {
      return undefined
    }
    values.push(descriptor.value)
  }
  return values
}

function judgeCovers(raw: unknown): CompactedRange | undefined {
  const values = closedValues(raw, COVERS_KEYS)
  if (values === undefined) return undefined
  const from = entryRef(values[0])
  const to = entryRef(values[1])
  return from === null || to === null ? undefined : Object.freeze({ from, to })
}

function judgeRetained(raw: unknown): readonly RecordEntryRef[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const items: readonly unknown[] = raw
  const refs: RecordEntryRef[] = []
  for (let index = 0; index < items.length; index += 1) {
    const ref = entryRef(items[index])
    if (ref === null) return undefined
    refs.push(ref)
  }
  return new Set(refs).size === refs.length ? Object.freeze(refs) : undefined
}

function judgeDerivation(raw: unknown): CompactionDerivation | undefined {
  const values = closedValues(raw, DERIVATION_KEYS)
  const [owner, record, revision, digest] = values ?? []
  if (!nonEmptyText(owner) || !nonEmptyText(record)) return undefined
  if (!nonEmptyText(revision) || !nonEmptyText(digest)) return undefined
  return Object.freeze({ owner, record, revision, digest })
}

/**
 * The three keys of a `compaction` message, in the order covers, retained, derivation. The first
 * failure is returned. Each success value is a frozen copy that shares nothing with the input.
 */
export function judgeCompactionKeys(value: Record<string, unknown>): CompactionKeysJudgment {
  const covers = judgeCovers(value.covers)
  if (covers === undefined) return { rejected: 'covers' }
  const retained = judgeRetained(value.retained)
  if (retained === undefined) return { rejected: 'retained' }
  const derivation = judgeDerivation(value.derivation)
  if (derivation === undefined) return { rejected: 'derivation' }
  return { ok: { covers, retained, derivation } }
}
