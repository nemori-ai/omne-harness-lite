// The `tool` participant module. It runs inside the provider's write transaction, so every command
// is atomic: a ledger commit checks the domain revision and applies its writes in input order; a
// chunk keeps one piece of an original unless a manifest already seals the operation; a manifest
// checks that the chunks hold exactly the declared bytes before it seals them. A stopping reply
// rolls the whole command back. It never begins, commits or rolls back, and keeps no state between
// calls.
import { createHash } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import {
  parseFacts,
  type ChunkFacts,
  type CustodyAddress,
  type LedgerFacts,
  type ManifestFacts,
  type ParticipantAnswer,
  type StopBasis,
} from './facts.ts'
import { PARTICIPANT, PROTOCOL } from './schema.ts'
import { oneRow, text } from './support.ts'

const participated = (answer: ParticipantAnswer): ParticipantReply => ({
  kind: 'participated',
  response: answer,
})
const stopped = (basis: StopBasis): ParticipantReply => ({ kind: 'conflict', basis })

/** The revision of a domain that was never committed (`INITIAL_REVISION` of the ledger). */
const INITIAL_REVISION = '0'

function commitLedger(facts: LedgerFacts, port: ParticipantPort): ParticipantReply {
  const domain = [facts.tenant, facts.kind, facts.name] as const
  const row = oneRow(
    port,
    'SELECT revision FROM tl_domain WHERE tenant = ? AND kind = ? AND name = ? LIMIT 1',
    domain,
  )
  const current = row === undefined ? INITIAL_REVISION : text(row['revision'])
  if (current !== facts.expected) return stopped({ reason: 'revision', current })
  for (const write of facts.writes)
    if (write.op === 'put')
      port.execute(
        `INSERT INTO tl_record (tenant, kind, name, key, record) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tenant, kind, name, key) DO UPDATE SET record = excluded.record`,
        [...domain, write.key, JSON.stringify(write.record)],
      )
    else
      port.execute('DELETE FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ?', [
        ...domain,
        write.key,
      ])
  port.execute(
    `INSERT INTO tl_domain (tenant, kind, name, revision) VALUES (?, ?, ?, ?)
     ON CONFLICT (tenant, kind, name) DO UPDATE SET revision = excluded.revision`,
    [...domain, facts.revision],
  )
  return participated({ kind: 'committed' })
}

const addressOf = (facts: CustodyAddress) => [facts.tenant, facts.call, facts.operation] as const

/** The digest and answer of the manifest that seals `operation`, if one does. */
function sealed(port: ParticipantPort, facts: CustodyAddress) {
  const row = oneRow(
    port,
    'SELECT digest, answer FROM tl_manifest WHERE tenant = ? AND call = ? AND operation = ? LIMIT 1',
    addressOf(facts),
  )
  return row === undefined
    ? null
    : { digest: text(row['digest']), answer: JSON.parse(text(row['answer'])) as JsonValue }
}

/** The bytes of a chunk as base64 gives them, or null when `data` is not canonical base64. */
function decode(data: string): Uint8Array | null {
  const bytes = Buffer.from(data, 'base64')
  return bytes.toString('base64') === data ? new Uint8Array(bytes) : null
}

function keepChunk(facts: ChunkFacts, port: ParticipantPort): ParticipantReply {
  const seal = sealed(port, facts)
  // A sealed operation keeps its chunks: a resend of it writes nothing, another input conflicts.
  if (seal !== null)
    return seal.digest === facts.digest
      ? participated({ kind: 'chunk' })
      : stopped({ reason: 'operation' })
  const bytes = decode(facts.data)
  if (bytes === null) return { kind: 'failed', diagnostic: 'chunk data is not canonical base64' }
  port.execute(
    `INSERT INTO tl_chunk (tenant, call, operation, idx, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (tenant, call, operation, idx) DO UPDATE SET data = excluded.data`,
    [...addressOf(facts), BigInt(facts.index), bytes],
  )
  return participated({ kind: 'chunk' })
}

/** True when the chunks 0 to `chunks - 1` exist and hold exactly `bytes` bytes of digest `sha256`. */
function chunksHold(facts: ManifestFacts, port: ParticipantPort): boolean {
  const hash = createHash('sha256')
  let total = 0
  for (let index = 0; index < facts.chunks; index += 1) {
    const row = oneRow(
      port,
      'SELECT data FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? AND idx = ? LIMIT 1',
      [...addressOf(facts), BigInt(index)],
    )
    const data = row?.['data']
    if (!(data instanceof Uint8Array)) return false
    hash.update(data)
    total += data.length
  }
  return total === facts.bytes && hash.digest('hex') === facts.sha256
}

/** True when a retained projection's raw output is sealed in the same tenant and call. */
function holderSealed(facts: ManifestFacts, port: ParticipantPort): boolean {
  if (facts.holds === null) return true
  const row = oneRow(
    port,
    `SELECT seal FROM tl_manifest
      WHERE tenant = ? AND call = ? AND operation = ? AND kind = 'raw' LIMIT 1`,
    [facts.tenant, facts.call, facts.holds.operation],
  )
  return row !== undefined && text(row['seal']) === facts.holds.seal
}

function seal(facts: ManifestFacts, port: ParticipantPort): ParticipantReply {
  const existing = sealed(port, facts)
  if (existing !== null)
    return existing.digest === facts.digest
      ? participated({ kind: 'sealed', answer: existing.answer })
      : stopped({ reason: 'operation' })
  if (!holderSealed(facts, port)) return stopped({ reason: 'holder' })
  if (!chunksHold(facts, port)) return stopped({ reason: 'chunks' })
  // A crash of a longer attempt may have left chunks past the end; they are never read, so drop them.
  port.execute(
    'DELETE FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? AND idx >= ?',
    [...addressOf(facts), BigInt(facts.chunks)],
  )
  port.execute(
    `INSERT INTO tl_manifest
      (tenant, call, operation, kind, digest, bytes, chunks, sha256, seal, answer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ...addressOf(facts),
      facts.kind,
      facts.digest,
      BigInt(facts.bytes),
      BigInt(facts.chunks),
      facts.sha256,
      facts.seal,
      JSON.stringify(facts.answer),
    ],
  )
  return participated({ kind: 'sealed', answer: facts.answer })
}

const participant: ParticipantModule = {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(input, port) {
    const facts = parseFacts(input)
    if (facts === null) return { kind: 'unsupported', basis: { reason: 'facts' } }
    switch (facts.intent) {
      case 'ledger':
        return commitLedger(facts, port)
      case 'chunk':
        return keepChunk(facts, port)
      case 'manifest':
        return seal(facts, port)
      default: {
        const exhaustive: never = facts
        return exhaustive
      }
    }
  },
}
export default participant
