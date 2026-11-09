// The body store commands of the `tool` participant (model `Put`, `StoreSeal`, `DeleteBytes`).
// The permit was verified by the adapter, in the store's process, before the command was sent; the
// participant keeps the object immutable: a chunk is written once, a manifest seals exactly the
// chunks it declares, and a delete leaves no row behind.
import { createHash } from 'node:crypto'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import type {
  BodyAddress,
  BodyDeleteFacts,
  BodyFacts,
  BodyPutFacts,
  BodySealFacts,
  ParticipantAnswer,
  StopBasis,
} from './facts.ts'
import { integer, oneRow, text } from './support.ts'

const participated = (answer: ParticipantAnswer): ParticipantReply => ({
  kind: 'participated',
  response: answer,
})
const stopped = (basis: StopBasis): ParticipantReply => ({ kind: 'conflict', basis })

const addressOf = (facts: BodyAddress) => [facts.tenant, facts.call, facts.body] as const

type Manifest = Readonly<{ chunks: number; bytes: number; digest: string }>

function manifestOf(port: ParticipantPort, facts: BodyAddress): Manifest | null {
  const row = oneRow(
    port,
    'SELECT chunks, bytes, digest FROM tl_body_manifest WHERE tenant = ? AND call = ? AND body = ? LIMIT 1',
    addressOf(facts),
  )
  return row === undefined
    ? null
    : {
        chunks: Number(integer(row['chunks'])),
        bytes: Number(integer(row['bytes'])),
        digest: text(row['digest']),
      }
}

function chunkOf(port: ParticipantPort, facts: BodyAddress, seq: number): Uint8Array | null {
  const row = oneRow(
    port,
    'SELECT data FROM tl_body_chunk WHERE tenant = ? AND call = ? AND body = ? AND seq = ? LIMIT 1',
    [...addressOf(facts), BigInt(seq)],
  )
  const data = row?.['data']
  return data instanceof Uint8Array ? data : null
}

/** The bytes of a chunk as base64 gives them, or null when `data` is not canonical base64. */
function decode(data: string): Uint8Array | null {
  const bytes = Buffer.from(data, 'base64')
  return bytes.toString('base64') === data ? new Uint8Array(bytes) : null
}

function put(facts: BodyPutFacts, port: ParticipantPort): ParticipantReply {
  const bytes = decode(facts.data)
  if (bytes === null) return { kind: 'failed', diagnostic: 'chunk data is not canonical base64' }
  const existing = chunkOf(port, facts, facts.seq)
  if (existing !== null)
    return Buffer.from(existing).equals(bytes)
      ? participated({ kind: 'body-kept' })
      : stopped({ reason: 'body-conflict' })
  // A sealed body holds every chunk its manifest names; a new sequence number would change it.
  if (manifestOf(port, facts) !== null) return stopped({ reason: 'body-conflict' })
  port.execute('INSERT INTO tl_body_chunk (tenant, call, body, seq, data) VALUES (?, ?, ?, ?, ?)', [
    ...addressOf(facts),
    BigInt(facts.seq),
    bytes,
  ])
  return participated({ kind: 'body-kept' })
}

/** Why the chunks do not hold what `facts` declares, or null when they do. */
function notReady(facts: BodySealFacts, port: ParticipantPort): string | null {
  const counted = oneRow(
    port,
    'SELECT COUNT(*) AS n FROM tl_body_chunk WHERE tenant = ? AND call = ? AND body = ?',
    addressOf(facts),
  )
  const held = Number(integer(counted?.['n']))
  if (held !== facts.chunks)
    return `the store holds ${held} chunks, the manifest declares ${facts.chunks}`
  const hash = createHash('sha256')
  let total = 0
  for (let seq = 0; seq < facts.chunks; seq += 1) {
    const chunk = chunkOf(port, facts, seq)
    if (chunk === null) return `chunk ${seq} is missing`
    hash.update(chunk)
    total += chunk.length
  }
  if (total !== facts.bytes)
    return `the chunks hold ${total} bytes, the manifest declares ${facts.bytes}`
  return hash.digest('hex') === facts.digest
    ? null
    : 'the digest of the chunks differs from the manifest'
}

function seal(facts: BodySealFacts, port: ParticipantPort): ParticipantReply {
  const existing = manifestOf(port, facts)
  if (existing !== null)
    return existing.chunks === facts.chunks &&
      existing.bytes === facts.bytes &&
      existing.digest === facts.digest
      ? participated({ kind: 'body-sealed' })
      : stopped({ reason: 'body-conflict' })
  const diagnostic = notReady(facts, port)
  if (diagnostic !== null) return stopped({ reason: 'body-not-ready', diagnostic })
  port.execute(
    'INSERT INTO tl_body_manifest (tenant, call, body, chunks, bytes, digest) VALUES (?, ?, ?, ?, ?, ?)',
    [...addressOf(facts), BigInt(facts.chunks), BigInt(facts.bytes), facts.digest],
  )
  return participated({ kind: 'body-sealed' })
}

function remove(facts: BodyDeleteFacts, port: ParticipantPort): ParticipantReply {
  port.execute(
    'DELETE FROM tl_body_chunk WHERE tenant = ? AND call = ? AND body = ?',
    addressOf(facts),
  )
  port.execute(
    'DELETE FROM tl_body_manifest WHERE tenant = ? AND call = ? AND body = ?',
    addressOf(facts),
  )
  return participated({ kind: 'body-deleted' })
}

export function commitBody(facts: BodyFacts, port: ParticipantPort): ParticipantReply {
  switch (facts.intent) {
    case 'body-put':
      return put(facts, port)
    case 'body-seal':
      return seal(facts, port)
    case 'body-delete':
      return remove(facts, port)
    default: {
      const exhaustive: never = facts
      return exhaustive
    }
  }
}
