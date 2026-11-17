import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CompactionFailure, CompactionReply } from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/sql-contract'

const FIELDS = ['state', 'request', 'execution', 'cancellation', 'acknowledgment'] as const
const CHUNK_BYTES = 32 * 1024
const READ_PARTS = 16
type ContentRef = Readonly<{ digest: string; bytes: number; parts: number }>
export type RecordManifest = readonly ContentRef[]
type ContentPorts = Readonly<{
  read(input: JsonValue): CompactionReply<JsonValue>
  write(facts: Readonly<Record<string, JsonValue>>, identity: string): CompactionReply<void>
}>
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'compaction-content', diagnostic })
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function reference(value: unknown): value is ContentRef {
  return (
    object(value) &&
    Object.keys(value).length === 3 &&
    typeof value.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.digest) &&
    typeof value.bytes === 'number' &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    typeof value.parts === 'number' &&
    Number.isSafeInteger(value.parts) &&
    value.parts === Math.ceil(value.bytes / CHUNK_BYTES)
  )
}
export function decodeRecordManifest(text: string): Outcome<RecordManifest, CompactionFailure> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return unavailable('invalid record manifest')
  }
  return Array.isArray(value) && value.length === FIELDS.length && value.every(reference)
    ? succeed(value)
    : unavailable('invalid record manifest')
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function contentOf(ports: ContentPorts, tenant: string) {
  async function put(text: string, prior: ContentRef | undefined): CompactionReply<ContentRef> {
    const bytes = Buffer.from(text, 'utf8')
    const digest = hash(bytes)
    if (prior?.digest === digest && prior.bytes === bytes.length) return succeed(prior)
    const parts = Math.ceil(bytes.length / CHUNK_BYTES)
    for (let part = 0; part < parts; part++) {
      const payload = bytes
        .subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES)
        .toString('base64')
      const saved = await ports.write(
        { kind: 'content', tenant, digest, part, payload },
        `${digest}/${part}`,
      )
      if ('failure' in saved) return saved
    }
    return succeed({ digest, bytes: bytes.length, parts })
  }
  async function get(ref: ContentRef): CompactionReply<string> {
    const chunks: Buffer[] = []
    for (let after = 0; after < ref.parts; after += READ_PARTS) {
      const count = Math.min(READ_PARTS, ref.parts - after)
      const read = await ports.read({ tenant, content: ref.digest, after, limit: count })
      if ('failure' in read) return read
      if (!Array.isArray(read.ok) || read.ok.length !== count)
        return unavailable('missing content chunks')
      for (const [index, row] of read.ok.entries()) {
        if (!object(row) || row.part !== after + index || typeof row.payload !== 'string')
          return unavailable('invalid content chunk')
        const bytes = Buffer.from(row.payload, 'base64')
        if (bytes.toString('base64') !== row.payload) return unavailable('invalid content encoding')
        chunks.push(bytes)
      }
    }
    const bytes = Buffer.concat(chunks)
    return bytes.length === ref.bytes && hash(bytes) === ref.digest
      ? succeed(bytes.toString('utf8'))
      : unavailable('content digest or length mismatch')
  }
  return {
    async save(text: string, prior: RecordManifest | null): CompactionReply<RecordManifest> {
      const fields: unknown = JSON.parse(text)
      if (!object(fields)) return unavailable('invalid encoded record')
      const refs: ContentRef[] = []
      for (const [index, key] of FIELDS.entries()) {
        const value = JSON.stringify(fields[key])
        if (value === undefined) return unavailable('missing encoded record field')
        const saved = await put(value, prior?.[index])
        if ('failure' in saved) return saved
        refs.push(saved.ok)
      }
      return succeed(refs)
    },
    async load(manifest: RecordManifest): CompactionReply<string> {
      const parts: string[] = []
      for (const [index, key] of FIELDS.entries()) {
        const ref = manifest[index]
        if (ref === undefined) return unavailable('missing record field')
        const read = await get(ref)
        if ('failure' in read) return read
        parts.push(`${JSON.stringify(key)}:${read.ok}`)
      }
      return succeed(`{${parts.join(',')}}`)
    },
  }
}
