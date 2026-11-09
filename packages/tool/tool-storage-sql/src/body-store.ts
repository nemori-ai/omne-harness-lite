// The durable ToolBodyStore over the SQL storage contract. The permit is verified here, in the
// store's own process and with the store's own clock, before any command is sent; the participant
// then keeps the object immutable. `seal` answers `sealed` only after the provider committed the
// manifest, so a sealed body is durable. A range longer than one read returns is read in several
// reads: a sealed body never changes, and a body deleted between two reads answers `absent`.
import { randomUUID } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  ToolBodyChunk,
  ToolBodyDeleteAnswer,
  ToolBodyManifest,
  ToolBodyPermit,
  ToolBodyPermitKey,
  ToolBodyPutAnswer,
  ToolBodyRange,
  ToolBodyReadAnswer,
  ToolBodyRef,
  ToolBodySealAnswer,
  ToolBodyStore,
  ToolBodyStoreUnavailable,
  ToolInstantClock,
} from '@omne-harness/tool-contract/provider'
import { verifyBodyPermit } from '@omne-harness/tool-contract/provider'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant, type Resolution } from './tenant.ts'
import type { BodyAddress, BodyFacts, StopBasis } from './worker/facts.ts'
import { BODY_READ_CHUNKS, BODY_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

export type SqlToolBodyStoreOptions = SqlToolStorageOptions &
  Readonly<{
    /** The key the ledger signs permits with; the store verifies every permit against it. */
    permitKey: ToolBodyPermitKey
    /** The store's own clock, read for every deadline check. */
    clock: ToolInstantClock
  }>

export type SqlToolBodyStore = ToolBodyStore & Readonly<{ durability: 'durable' }>

const unavailable = (diagnostic: string): ToolBodyStoreUnavailable => ({
  kind: 'unavailable',
  diagnostic,
})

type CommitAnswer = Awaited<ReturnType<SqlToolStorageOptions['storage']['commit']>>

function stopOf(basis: JsonValue): StopBasis | null {
  if (!isObject(basis)) return null
  if (basis['reason'] === 'body-conflict') return { reason: 'body-conflict' }
  if (basis['reason'] === 'body-not-ready' && typeof basis['diagnostic'] === 'string')
    return { reason: 'body-not-ready', diagnostic: basis['diagnostic'] }
  return null
}

/** The stop the participant reported, or the diagnostic of a commit that did not land. */
function outcomeOf(
  answer: CommitAnswer,
  what: string,
):
  | Readonly<{ kind: 'landed' }>
  | Readonly<{ kind: 'stopped'; basis: StopBasis }>
  | ToolBodyStoreUnavailable {
  switch (answer.kind) {
    case 'committed':
      return { kind: 'landed' }
    case 'rolled_back': {
      const reply = answer.responses[answer.responses.length - 1]?.reply
      const basis = reply?.kind === 'conflict' ? stopOf(reply.basis) : null
      return basis === null
        ? unavailable(
            `${what} rolled back: ${reply?.kind === 'failed' ? reply.category : (reply?.kind ?? 'no reply')}`,
          )
        : { kind: 'stopped', basis }
    }
    case 'unknown':
      return unavailable(`${what}: ${answer.diagnostic ?? 'unknown'}`)
    case 'identity_conflict':
      return unavailable(`${what}: the operation key was already used`)
    case 'rejected_before_accept':
      return unavailable(`${what} rejected: ${answer.reason}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

function manifestRowOf(value: JsonValue | undefined): ToolBodyManifest | null {
  if (!isObject(value)) return null
  const { chunks, bytes, digest } = value
  return typeof chunks === 'number' && typeof bytes === 'number' && typeof digest === 'string'
    ? { chunks, bytes, digest }
    : null
}

function chunkRowsOf(value: JsonValue | undefined): ToolBodyChunk[] | null {
  if (!Array.isArray(value)) return null
  const chunks: ToolBodyChunk[] = []
  for (const row of value) {
    if (!isObject(row) || typeof row['seq'] !== 'number' || typeof row['data'] !== 'string')
      return null
    chunks.push({ seq: row['seq'], bytes: new Uint8Array(Buffer.from(row['data'], 'base64')) })
  }
  return chunks
}

export function createSqlToolBodyStore(options: SqlToolBodyStoreOptions): SqlToolBodyStore {
  const addressOf = (
    resolved: Extract<Resolution, { kind: 'ready' }>,
    body: ToolBodyRef,
  ): BodyAddress => ({
    tenant: resolved.at.tenant,
    call: body.call,
    body: body.body,
  })

  const permitFault = (permit: ToolBodyPermit) => {
    const verdict = verifyBodyPermit(options.permitKey, permit, options.clock.now())
    if (verdict === 'invalid-signature') return { kind: 'permit-invalid' } as const
    return verdict === 'expired' ? ({ kind: 'permit-expired' } as const) : null
  }

  const send = async (
    body: ToolBodyRef,
    facts: (address: BodyAddress) => BodyFacts,
    what: string,
  ) => {
    const resolved = await resolveTenant(options, body.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const answer = await options.storage.commit(
      requestOf(options, resolved.at, facts(addressOf(resolved, body))),
    )
    return outcomeOf(answer, what)
  }

  const put = async (
    permit: ToolBodyPermit,
    seq: number,
    bytes: Uint8Array,
  ): Promise<ToolBodyPutAnswer> => {
    const fault = permitFault(permit)
    if (fault !== null) return fault
    const outcome = await send(
      permit.claims,
      address => ({
        ...address,
        intent: 'body-put',
        seq,
        data: Buffer.from(bytes).toString('base64'),
      }),
      'body put',
    )
    if (outcome.kind === 'landed') return { kind: 'kept' }
    if (outcome.kind === 'unavailable') return outcome
    return outcome.basis.reason === 'body-conflict'
      ? { kind: 'conflict' }
      : unavailable(`body put stopped: ${outcome.basis.reason}`)
  }

  const seal = async (
    permit: ToolBodyPermit,
    manifest: ToolBodyManifest,
  ): Promise<ToolBodySealAnswer> => {
    const fault = permitFault(permit)
    if (fault !== null) return fault
    const outcome = await send(
      permit.claims,
      address => ({ ...address, intent: 'body-seal', ...manifest }),
      'body seal',
    )
    if (outcome.kind === 'landed') return { kind: 'sealed' }
    if (outcome.kind === 'unavailable') return outcome
    switch (outcome.basis.reason) {
      case 'body-conflict':
        return { kind: 'conflict' }
      case 'body-not-ready':
        return { kind: 'not-ready', diagnostic: outcome.basis.diagnostic }
      default:
        return unavailable(`body seal stopped: ${outcome.basis.reason}`)
    }
  }

  const readOnce = async (
    resolved: Extract<Resolution, { kind: 'ready' }>,
    body: ToolBodyRef,
    range: ToolBodyRange,
  ): Promise<ToolBodyReadAnswer> => {
    const answer = await options.storage.read({
      domain: resolved.at.domain,
      handler: BODY_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: { ...addressOf(resolved, body), ...range },
    })
    if (answer.kind !== 'read')
      return unavailable(`body read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`)
    const output = isObject(answer.output) ? answer.output : null
    if (output === null) return unavailable('body read: invalid stored body')
    if (output['manifest'] === null) return { kind: 'absent' }
    const manifest = manifestRowOf(output['manifest'])
    const chunks = chunkRowsOf(output['chunks'])
    return manifest === null || chunks === null
      ? unavailable('body read: invalid stored body')
      : { kind: 'found', manifest, chunks }
  }

  const read = async (body: ToolBodyRef, range: ToolBodyRange): Promise<ToolBodyReadAnswer> => {
    const resolved = await resolveTenant(options, body.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    let manifest: ToolBodyManifest | null = null
    const chunks: ToolBodyChunk[] = []
    for (let first = range.first; first < range.first + range.count; first += BODY_READ_CHUNKS) {
      const count = Math.min(BODY_READ_CHUNKS, range.first + range.count - first)
      const part = await readOnce(resolved, body, { first, count })
      if (part.kind !== 'found') return part
      manifest = part.manifest
      chunks.push(...part.chunks)
      if (first + count >= manifest.chunks) break
    }
    return manifest === null
      ? readOnce(resolved, body, { first: range.first, count: 0 })
      : { kind: 'found', manifest, chunks }
  }

  const remove = async (body: ToolBodyRef): Promise<ToolBodyDeleteAnswer> => {
    const outcome = await send(
      body,
      address => ({ ...address, intent: 'body-delete' }),
      'body delete',
    )
    if (outcome.kind === 'landed') return { kind: 'deleted' }
    return outcome.kind === 'unavailable'
      ? outcome
      : unavailable(`body delete stopped: ${outcome.basis.reason}`)
  }

  return { durability: 'durable', put, seal, read, delete: remove }
}
