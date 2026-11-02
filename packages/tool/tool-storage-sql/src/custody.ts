// The durable ToolOutputCustody (P05) over the SQL storage contract (D2 decision 3). An original
// of any size is kept in chunks of at most `maxChunkBytes`, one SQL commit each, and then sealed by
// a manifest committed last; until the manifest is durable, `inspect` never answers `retained`. A
// resend of an operation rewrites the same chunks and recalls the manifest; another input under a
// sealed operation is a `conflict` that changes nothing. A retained projection is kept the same way
// under its own operation and holds the raw output it was kept over. Custody rows are not ledger
// records: they move no ledger domain revision (review N2).
import { createHash, randomUUID } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  Adoption,
  DurableEvidence,
  RawOutput,
  ToolFailure,
  ToolOperationId,
} from '@omne-harness/tool-contract'
import type { ToolOutputCustody } from '@omne-harness/tool-contract/provider'
import { NotJsonError, toJson } from './json.ts'
import { checkChunkBound, TOOL_STORAGE_OWNER, type SqlToolOutputCustodyOptions } from './options.ts'
import { requestOf, resolveTenant, type TenantDomain } from './tenant.ts'
import type { CustodyAddress, ManifestFacts, ManifestKind, ManifestRow } from './worker/facts.ts'
import { MANIFEST_READ_HANDLER, PROTOCOL } from './worker/schema.ts'
import { isObject } from './worker/support.ts'

type Reply<T> = Promise<Outcome<T, ToolFailure>>

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: TOOL_STORAGE_OWNER, diagnostic })
const conflict = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
  fail({ kind: 'conflict', operation })
const notPreserved: Outcome<never, ToolFailure> = fail({
  kind: 'invalid',
  field: 'raw',
  reason: 'no output of this call was preserved',
})

type Json = Readonly<Record<string, JsonValue>>

function textAt(value: Json, key: string): string | null {
  const member = value[key]
  return typeof member === 'string' ? member : null
}

function adoptionOf(value: JsonValue | undefined): Adoption | null {
  if (!isObject(value)) return null
  const [owner, name, revision, digest] = ['owner', 'name', 'revision', 'digest'].map(key =>
    textAt(value, key),
  )
  return owner == null || name == null || revision == null || digest == null
    ? null
    : { owner, name, revision, digest }
}

function evidenceOf(value: JsonValue | undefined): DurableEvidence | null {
  if (!isObject(value)) return null
  const [owner, record, revision, digest] = ['owner', 'record', 'revision', 'digest'].map(key =>
    textAt(value, key),
  )
  return owner == null || record == null || revision == null || digest == null
    ? null
    : { owner, record, revision, digest }
}

function attachmentOf(value: JsonValue | undefined): RawOutput['content'] | null {
  if (!isObject(value)) return null
  const [storage, key, mediaType, bytes, digest] = [
    'storage',
    'key',
    'mediaType',
    'bytes',
    'digest',
  ].map(name => textAt(value, name))
  return storage == null || key == null || mediaType == null || bytes == null || digest == null
    ? null
    : { storage, key, mediaType, bytes, digest }
}

/** The raw output a manifest answers with: the one this custody minted when it sealed it. */
function rawOf(value: JsonValue): RawOutput | null {
  if (!isObject(value)) return null
  const codec = adoptionOf(value['codec'])
  const content = attachmentOf(value['content'])
  const custody = evidenceOf(value['custody'])
  return codec === null || content === null || custody === null ? null : { codec, content, custody }
}

/** A manifest as the manifest read handler returns it, or null when the output is not one. */
function manifestRowOf(value: JsonValue | undefined): ManifestRow | null {
  if (!isObject(value)) return null
  const kind = value['kind']
  const [digest, bytes, chunks, hash, seal] = ['digest', 'bytes', 'chunks', 'sha256', 'seal'].map(
    key => textAt(value, key),
  )
  const answer = value['answer']
  if (
    (kind !== 'raw' && kind !== 'retain') ||
    digest == null ||
    bytes == null ||
    chunks == null ||
    hash == null ||
    seal == null ||
    answer === undefined
  )
    return null
  return { kind, digest, bytes, chunks, sha256: hash, seal, answer }
}

/** A caller value in strict JSON, or `invalid` naming the field that is not JSON data. */
function jsonField(value: unknown, field: string): Outcome<JsonValue, ToolFailure> {
  try {
    return succeed(toJson(value, field))
  } catch (error) {
    if (error instanceof NotJsonError)
      return fail({ kind: 'invalid', field, reason: error.message })
    throw error
  }
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** The content key of a raw output: its call and preserve operation, as JSON text. */
const contentKey = (call: string, operation: string): string => JSON.stringify([call, operation])

function preservedAt(raw: RawOutput, call: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.content.key)
  } catch {
    return null
  }
  return Array.isArray(parsed) &&
    parsed.length === 2 &&
    parsed[0] === call &&
    typeof parsed[1] === 'string'
    ? parsed[1]
    : null
}

/** What one custody operation keeps: its bytes, and the manifest that seals them. */
type Keeping = CustodyAddress &
  Readonly<{
    kind: ManifestKind
    digest: string
    bytes: Uint8Array
    seal: string
    answer: JsonValue
    holds: ManifestFacts['holds']
  }>

export function createSqlToolOutputCustody<P>(
  options: SqlToolOutputCustodyOptions,
): ToolOutputCustody<P> {
  const maxChunkBytes = checkChunkBound(options)

  const manifest = async (at: TenantDomain, address: CustodyAddress): Reply<ManifestRow | null> => {
    const answer = await options.storage.read({
      domain: at.domain,
      handler: MANIFEST_READ_HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: address,
    })
    if (answer.kind !== 'read')
      return unavailable(
        `custody read: ${answer.kind === 'cancelled' ? 'cancelled' : answer.reason}`,
      )
    const found = isObject(answer.output) ? answer.output['manifest'] : undefined
    if (found === null) return succeed(null)
    const row = manifestRowOf(found)
    return row === null ? unavailable('custody read: the row is not a manifest') : succeed(row)
  }

  /**
   * Commits the chunks and then the manifest. Each commit is one SQL operation; an answer that is
   * not certain stops the keeping as `commit-unknown`, and the caller resends the operation.
   */
  const keep = async (
    at: TenantDomain,
    operation: ToolOperationId,
    keeping: Keeping,
  ): Reply<JsonValue> => {
    const address = { tenant: keeping.tenant, call: keeping.call, operation: keeping.operation }
    const chunks = Math.ceil(keeping.bytes.length / maxChunkBytes)
    for (let index = 0; index < chunks; index += 1) {
      const data = Buffer.from(
        keeping.bytes.subarray(index * maxChunkBytes, (index + 1) * maxChunkBytes),
      ).toString('base64')
      const kept = await settle(
        operation,
        options.storage.commit(
          requestOf(options, at, {
            ...address,
            intent: 'chunk',
            digest: keeping.digest,
            index,
            data,
          }),
        ),
      )
      if ('failure' in kept) return kept
    }
    return settle(
      operation,
      options.storage.commit(
        requestOf(options, at, {
          ...address,
          intent: 'manifest',
          kind: keeping.kind,
          digest: keeping.digest,
          bytes: keeping.bytes.length,
          chunks,
          sha256: sha256(keeping.bytes),
          seal: keeping.seal,
          answer: keeping.answer,
          holds: keeping.holds,
        }),
      ),
    )
  }

  const preserve: ToolOutputCustody<P>['preserve'] = async input => {
    const resolved = await resolveTenant(options, input.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const at = resolved.at
    if (!(input.bytes instanceof Uint8Array))
      return fail({ kind: 'invalid', field: 'bytes', reason: 'type' })
    const bytes = Uint8Array.from(input.bytes)
    const codec = jsonField(input.codec, 'codec')
    if ('failure' in codec) return codec
    const source = jsonField(input.source, 'source')
    if ('failure' in source) return source
    const address = { tenant: at.tenant, call: input.call, operation: input.operation }
    const hex = sha256(bytes)
    const digest = canonicalDigest({
      kind: 'raw',
      codec: codec.ok,
      bytes: bytes.length,
      sha256: hex,
      source: source.ok,
    })
    const existing = await manifest(at, address)
    if ('failure' in existing) return existing
    if (existing.ok !== null) return recall(existing.ok, 'raw', digest, input.operation, rawOf)
    const raw = rawOf({
      codec: codec.ok,
      content: {
        storage: TOOL_STORAGE_OWNER,
        key: contentKey(input.call, input.operation),
        mediaType: 'application/octet-stream',
        bytes: String(bytes.length),
        digest: `sha256:${hex}`,
      },
      custody: {
        owner: TOOL_STORAGE_OWNER,
        record: `raw/${input.call}/${input.operation}`,
        revision: '1',
        digest: canonicalDigest({ ...address, digest }),
      },
    })
    if (raw === null) return fail({ kind: 'invalid', field: 'codec', reason: 'not an adoption' })
    const sealed = await keep(at, input.operation, {
      ...address,
      kind: 'raw',
      digest,
      bytes,
      seal: raw.custody.digest,
      answer: toJson(raw),
      holds: null,
    })
    if ('failure' in sealed) return sealed
    const answer = rawOf(sealed.ok)
    return answer === null
      ? unavailable('custody: the manifest answer is not a raw output')
      : succeed(answer)
  }

  const inspect: ToolOutputCustody<P>['inspect'] = async input => {
    const resolved = await resolveTenant(options, input.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const found = await manifest(resolved.at, {
      tenant: resolved.at.tenant,
      call: input.call,
      operation: input.operation,
    })
    if ('failure' in found) return found
    // Never preserved, or kept as a projection: nothing to recall as a raw output (decision U1).
    if (found.ok === null || found.ok.kind !== 'raw') return succeed({ kind: 'unknown' })
    const raw = rawOf(found.ok.answer)
    return raw === null
      ? unavailable('custody: the manifest answer is not a raw output')
      : succeed({ kind: 'retained', raw })
  }

  /** The operation that preserved `raw` in this call, when its manifest seals exactly `raw`. */
  const heldRawOperation = async (
    at: TenantDomain,
    call: string,
    raw: RawOutput,
  ): Reply<string> => {
    const operation = preservedAt(raw, call)
    if (operation === null) return notPreserved
    const held = await manifest(at, { tenant: at.tenant, call, operation })
    if ('failure' in held) return held
    return held.ok?.kind !== 'raw' || held.ok.seal !== raw.custody.digest
      ? notPreserved
      : succeed(operation)
  }

  const retainResult: ToolOutputCustody<P>['retainResult'] = async input => {
    const resolved = await resolveTenant(options, input.tenant)
    if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
    const at = resolved.at
    const held = await heldRawOperation(at, input.call, input.raw)
    if ('failure' in held) return held
    const rawOperation = held.ok
    const encoded = jsonField(input.value, 'value')
    if ('failure' in encoded) return encoded
    const value = encoded.ok
    const address = { tenant: at.tenant, call: input.call, operation: input.operation }
    const digest = canonicalDigest({ kind: 'retain', raw: input.raw.custody.digest, value })
    const existing = await manifest(at, address)
    if ('failure' in existing) return existing
    if (existing.ok !== null)
      return recall(existing.ok, 'retain', digest, input.operation, evidenceOf)
    const evidence: DurableEvidence = {
      owner: TOOL_STORAGE_OWNER,
      record: `retain/${input.call}/${input.operation}`,
      revision: '1',
      digest: canonicalDigest({ ...address, digest }),
    }
    const sealed = await keep(at, input.operation, {
      ...address,
      kind: 'retain',
      digest,
      bytes: new TextEncoder().encode(JSON.stringify(value)),
      seal: evidence.digest,
      answer: evidence,
      holds: { operation: rawOperation, seal: input.raw.custody.digest },
    })
    if ('failure' in sealed) return sealed
    const answer = evidenceOf(sealed.ok)
    return answer === null
      ? unavailable('custody: the manifest answer is not evidence')
      : succeed(answer)
  }

  return { preserve, inspect, retainResult }
}

/** The answer of a sealed operation: recalled for the same input, a conflict for another. */
function recall<T>(
  row: ManifestRow,
  kind: ManifestKind,
  digest: string,
  operation: ToolOperationId,
  parse: (value: JsonValue) => T | null,
): Outcome<T, ToolFailure> {
  if (row.kind !== kind || row.digest !== digest) return conflict(operation)
  const answer = parse(row.answer)
  return answer === null
    ? unavailable('custody: the sealed answer does not parse')
    : succeed(answer)
}

type CommitAnswer = Awaited<ReturnType<SqlToolOutputCustodyOptions['storage']['commit']>>

/** A rolled-back custody commit: the reason the participant stopped it names the failure. */
function stopped(
  operation: ToolOperationId,
  answer: Extract<CommitAnswer, { kind: 'rolled_back' }>,
): Outcome<never, ToolFailure> {
  const stop = answer.responses[answer.responses.length - 1]?.reply
  const reason = stop?.kind === 'conflict' && isObject(stop.basis) ? stop.basis['reason'] : null
  if (reason === 'operation' || reason === 'chunks') return conflict(operation)
  if (reason === 'holder') return notPreserved
  return unavailable(
    `custody commit rolled back: ${stop?.kind === 'failed' ? stop.category : (stop?.kind ?? 'no reply')}`,
  )
}

/** One custody commit, read as the answer of the port. */
async function settle(
  operation: ToolOperationId,
  pending: ReturnType<SqlToolOutputCustodyOptions['storage']['commit']>,
): Reply<JsonValue> {
  const answer = await pending
  switch (answer.kind) {
    case 'committed': {
      const response = answer.responses[0].reply.response
      return succeed(isObject(response) ? (response['answer'] ?? null) : null)
    }
    case 'rolled_back':
      return stopped(operation, answer)
    case 'unknown':
      return fail({ kind: 'commit-unknown', operation })
    case 'identity_conflict':
      return unavailable('custody commit: the operation key was already used')
    case 'rejected_before_accept':
      return unavailable(`custody commit rejected: ${answer.reason}`)
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}
