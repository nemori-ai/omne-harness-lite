import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { blobDigest, canonicalText, plainOf } from '../codec.ts'
import { readEntryText, writeEntryText } from '../entry-codec.ts'
import { readSharedBlob } from './shared-blobs.ts'
import type { Executor } from './support.ts'

const LIMITS: JsonLimits = {
  maxBytes: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: Number.MAX_SAFE_INTEGER,
  maxNumberLength: Number.MAX_SAFE_INTEGER,
}

export function sharedEntryText(port: Executor, tenant: string, entry: HistoryEntry): string {
  if (entry.kind !== 'message.compaction') return writeEntryText(entry)
  if (entry.payload.kind !== 'object')
    throw new TypeError('the compaction entry has no object payload')
  const value = entry.payload.entries.find(item => item.key === 'message')
  if (value === undefined || entry.payload.entries.some(item => item.key === 'messageBody'))
    throw new TypeError('the compaction entry has no complete message')
  const payload = canonicalText(plainOf(value.value))
  const digest = blobDigest(payload)
  const body = readSharedBlob(port, tenant, digest)
  if (body === null || body.payload !== payload)
    throw new TypeError('the compaction message has no durable custody body')
  return writeEntryText({
    ...entry,
    payload: {
      kind: 'object',
      entries: entry.payload.entries.map(item =>
        item.key === 'message'
          ? { key: 'messageBody', value: { kind: 'string', value: digest } }
          : item,
      ),
    },
  })
}

export function readSharedEntry(port: Executor, tenant: string, encoded: string): HistoryEntry {
  const entry = readEntryText(encoded)
  if (entry.kind !== 'message.compaction') return entry
  if (entry.payload.kind !== 'object')
    throw new TypeError('the stored compaction payload is not an object')
  const reference = entry.payload.entries.find(item => item.key === 'messageBody')
  if (
    reference?.value.kind !== 'string' ||
    entry.payload.entries.some(item => item.key === 'message')
  )
    throw new TypeError('the compaction entry is not in the shared-body encoding')
  const body = readSharedBlob(port, tenant, reference.value.value)
  if (body === null) throw new TypeError('the compaction body is missing')
  const parsed = readJsonText(body.payload, LIMITS)
  if (parsed.kind !== 'ok') throw new TypeError('the compaction body is not strict JSON')
  return {
    ...entry,
    payload: {
      kind: 'object',
      entries: entry.payload.entries.map(item =>
        item.key === 'messageBody' ? { key: 'message', value: parsed.value } : item,
      ),
    },
  }
}

export function viewMessageText(port: Executor, tenant: string, encoded: string): string {
  if (!encoded.startsWith('sha256:')) return encoded
  const body = readSharedBlob(port, tenant, encoded)
  if (body === null) throw new TypeError('the model view message body is missing')
  return body.payload
}
