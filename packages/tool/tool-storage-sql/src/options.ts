// What the Tool storage needs from the application: the SQL storage, the trusted tenant domain
// lookup and the combination the application registered for the tenant scope. The custody also
// needs the chunk size and the command bound of the `storage` row, so that every chunk fits in one
// command (sql-contract §7.2 step 7).
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'

export type SqlToolStorageOptions = Readonly<{
  storage: SqlStorage
  /**
   * The read-only lookup of the published tenant domain directory (sql-contract §2.4). A tenant
   * that it does not hold is not written; the storage never registers a tenant or a combination.
   */
  domains: TenantDomainLookup
  /** The combination version and manifest digest the application registered for the tenant scope. */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
}>

export type SqlToolOutputCustodyOptions = SqlToolStorageOptions &
  Readonly<{
    /** The `maxCommandBytes` of the `storage` row: the assembly passes the same value to both. */
    maxCommandBytes: number
    /** The most original bytes one chunk carries. Encoded with its envelope, it fits one command. */
    maxChunkBytes: number
  }>

/** The owner named in every evidence and every content reference that the Tool storage mints. */
export const TOOL_STORAGE_OWNER = '@omne-harness/tool-storage-sql'

/**
 * The bytes one chunk command may hold beside its base64 data: the participant name, the intent,
 * the tenant text, a call and an operation of at most 256 characters each, the index and the
 * custody digest, with their JSON punctuation. `tests/custody-chunks.spec.ts` builds the largest
 * such envelope and checks that it stays below this bound.
 */
export const CHUNK_ENVELOPE_BYTES = 2048

/** The base64 length of `bytes` original bytes. */
export function encodedLength(bytes: number): number {
  return 4 * Math.ceil(bytes / 3)
}

function positive(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${field}: a positive safe integer is required`)
  return value
}

/**
 * Checks the chunk bound once, at construction: the base64 form of `maxChunkBytes` plus the
 * envelope must fit `maxCommandBytes`. A chunk that cannot fit one command would make every
 * preserve of a large original fail, so the factory refuses to build.
 */
export function checkChunkBound(options: SqlToolOutputCustodyOptions): number {
  const maxCommandBytes = positive(options.maxCommandBytes, 'maxCommandBytes')
  const maxChunkBytes = positive(options.maxChunkBytes, 'maxChunkBytes')
  const needed = encodedLength(maxChunkBytes) + CHUNK_ENVELOPE_BYTES
  if (needed > maxCommandBytes)
    throw new RangeError(
      `maxChunkBytes: ${maxChunkBytes} bytes encode to ${needed} bytes with the envelope, more than maxCommandBytes ${maxCommandBytes}`,
    )
  return maxChunkBytes
}
