// The writer over the body store (BodyLifecycle `Begin`, `Renew`, `Put`, `StoreSeal`,
// `LedgerSeal`). The ledger commits `opened` and only then signs a permit; chunks go to the store
// under the permit and never through the ledger; the store seals first, the ledger records `sealed`
// afterwards. The running digest, byte count and block state of an open body live in this process:
// the author's execution lives in the same process, and a body whose process dies stays `opened`
// until settlement orphans it.
import { createHash, type Hash } from 'node:crypto'
import { readJsonBytes, readJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  Reply,
  ToolBodyRepresentation,
  ToolBodyWriterStatus,
  ToolFailure,
  ToolOperationId,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolInstant,
  signBodyPermit,
  type SealedToolBody,
  type ToolBodyManifest,
  type ToolBodyPermit,
  type ToolBodyWriteFailure,
  type ToolBodyWriteReply,
  type ToolBodyWrites,
  type ToolInstant,
  type ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import { bodyRepresentation } from './body-representation.ts'
import {
  judgeEvidenceField,
  judgeMutationInput,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerConfiguration, ToolLedgerPorts } from './construction.ts'
import { sameFactValue } from './evidence.ts'
import { fixJsonTree } from './json-tree.ts'
import {
  beginBodyEntry,
  bodyIdentity,
  bodySource,
  bodyWritable,
  sealBodyEntry,
  type BodyEntryRecord,
} from './ledger-body-entries.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import type { LedgerDomain } from './ledger-store.ts'
import { resultBodyPolicy, type BodyPolicy } from './result-offloading.ts'

export type BodyWritingPorts<P> = Readonly<{
  bodies: ToolLedgerPorts<P>['bodies'] | undefined
  bodySchemas?: ToolLedgerPorts<P>['bodySchemas']
  configuration: ToolLedgerConfiguration
  entry(input: unknown, action: 'write'): Reply<CallInput<P>>
  load(input: CallInput<P>): Reply<Snapshot>
  transact<T>(
    domain: LedgerDomain,
    operation: ToolOperationId,
    decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>> | Decision<T>,
    unknown: Outcome<T, ToolFailure>,
  ): Reply<T>
}>

/** What this process knows about an open body: the permit and the running manifest. */
type OpenBody = {
  permit: ToolBodyPermit
  chunks: number
  bytes: number
  hash: Hash
  blocks: Map<string, boolean>
  /** The whole text, kept only for a JSON document, which is validated as a whole at seal. */
  text: string | null
}

type WriterInput<P> = MutationInput<P> &
  Readonly<{ start: ToolStartRecord; source: DurableEvidence; key: string }>

export type SystemBodyInput<P> = CallInput<P> &
  Readonly<{ operation: ToolOperationId; source: DurableEvidence }>

export type BodyWriting<P> = Readonly<{
  writes: ToolBodyWrites<P>
  /**
   * The ledger as writer: the mechanical body of a settlement, written whole as begin, put, store
   * seal and ledger seal. `key` distinguishes the bodies one settlement may write.
   */
  writeBody(
    input: SystemBodyInput<P>,
    key: string,
    text: string,
    policy: BodyPolicy,
    representation: ToolBodyRepresentation,
  ): Reply<BodyEntryRecord>
}>

const LEDGER_INSTANCE = decodeToolInstanceId('tool-ledger')
const sequence = (value: unknown, allowZero: boolean): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && (allowZero || value !== '0')

function primitive(failure: ToolFailure, operation: string): ToolBodyWriteFailure {
  switch (failure.kind) {
    case 'denied':
      return failure
    case 'invalid':
      return failure.field === 'call' || failure.field === 'start'
        ? { kind: 'closed', reason: `${failure.field}: ${failure.reason}` }
        : { kind: 'invalid', reason: `${failure.field}: ${failure.reason}` }
    case 'conflict':
      return { kind: 'conflict', reason: 'operation conflicts with a recorded input' }
    case 'commit-unknown':
      return { kind: 'unknown', operation: failure.operation, reason: 'commit outcome is unknown' }
    case 'unavailable':
      return {
        kind: 'unavailable',
        operation,
        reason: `${failure.dependency}: ${failure.diagnostic}`,
      }
    case 'unsupported':
      return { kind: 'unsupported', reason: failure.reason }
    case 'not-found':
      return { kind: 'invalid', reason: `${failure.target}: ${failure.reason}` }
    case 'invalid-cursor':
      return { kind: 'invalid', reason: failure.reason }
    case 'not-settled':
      return { kind: 'busy', reason: 'operation has not settled' }
    case 'stale-instance':
    case 'stale-revision':
      return { kind: 'closed', reason: 'writer execution is stale' }
  }
}

export function instantAfter(now: ToolInstant, ms: number): ToolInstant {
  const decoded = decodeToolInstant(new Date(Date.parse(now) + ms).toISOString())
  if ('failure' in decoded) throw new Error('ledger minted an illegal instant')
  return decoded.ok
}

const storeUnavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-store', diagnostic })

type Frame = Readonly<{ text: string; block: string | null; end: boolean }>

function frameOf(
  value: unknown,
  representation: ToolBodyRepresentation,
): Outcome<Frame, ToolPrimitiveFailure> {
  if (typeof value !== 'object' || value === null)
    return fail({ kind: 'invalid', reason: 'frame must be an object' })
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind === 'text' && representation.kind === 'text') {
    const text: unknown = Reflect.get(value, 'text')
    const block: unknown = Reflect.get(value, 'block')
    const end: unknown = Reflect.get(value, 'end')
    if (
      typeof text !== 'string' ||
      !text.isWellFormed() ||
      typeof block !== 'string' ||
      block.length === 0 ||
      typeof end !== 'boolean'
    )
      return fail({ kind: 'invalid', reason: 'valid text frame required' })
    return succeed({ text, block, end })
  }
  if (kind === 'json-fragment' && representation.kind === 'json-document') {
    const text: unknown = Reflect.get(value, 'text')
    return typeof text === 'string' && text.isWellFormed()
      ? succeed({ text, block: null, end: false })
      : fail({ kind: 'invalid', reason: 'valid JSON text fragment required' })
  }
  if (kind === 'json-record' && representation.kind === 'json-lines')
    return succeed({ text: '', block: null, end: false })
  return fail({ kind: 'invalid', reason: 'frame must match the fixed body representation' })
}

export function createBodyWriting<P>(ports: BodyWritingPorts<P>): BodyWriting<P> {
  const open = new Map<string, OpenBody>()
  const domainOf = (input: CallInput<P>): LedgerDomain => ({
    kind: 'call',
    tenant: input.tenant,
    call: input.call,
  })

  /** Model `Begin`/`Renew`: a permit is signed only from a snapshot in which the body is writable. */
  const permitFor = (
    input: CallInput<P>,
    entry: BodyEntryRecord,
    snapshot: Snapshot,
  ): Outcome<ToolBodyPermit, ToolFailure> => {
    const bodies = ports.bodies
    if (bodies === undefined) return storeUnavailable('not connected')
    const refusal = bodyWritable(snapshot, entry.start)
    if (refusal !== null) return fail(refusal)
    const execution = entry.start?.execution ?? snapshot.call?.execution ?? null
    if ('failure' in LEDGER_INSTANCE) throw new Error('ledger minted an illegal instance identity')
    return succeed(
      signBodyPermit(bodies.permitKey, {
        tenant: input.tenant,
        call: input.call,
        body: entry.bodyId,
        instance: execution?.instance ?? LEDGER_INSTANCE.ok,
        generation: execution?.generation ?? '0',
        deadline: instantAfter(bodies.clock.now(), ports.configuration.offloading.permitMs),
      }),
    )
  }

  const renew = async (
    input: CallInput<P>,
    entry: BodyEntryRecord,
    body: OpenBody,
  ): Promise<Outcome<void, ToolFailure>> => {
    const snapshot = await ports.load(input)
    if ('failure' in snapshot) return snapshot
    const permit = permitFor(input, entry, snapshot.ok)
    if ('failure' in permit) return permit
    body.permit = permit.ok
    return succeed(undefined)
  }

  /** A permit within ε of its deadline is renewed before the store sees it. */
  const freshPermit = async (
    input: CallInput<P>,
    entry: BodyEntryRecord,
    body: OpenBody,
  ): Promise<Outcome<void, ToolFailure>> => {
    const bodies = ports.bodies
    if (bodies === undefined) return storeUnavailable('not connected')
    const remaining = Date.parse(body.permit.claims.deadline) - Date.parse(bodies.clock.now())
    return remaining <= ports.configuration.offloading.clockSkewMs
      ? renew(input, entry, body)
      : succeed(undefined)
  }

  type Begun = Readonly<{ entry: BodyEntryRecord; body: OpenBody | null }>

  const begin = async (
    input: CallInput<P> & Readonly<{ operation: ToolOperationId; source: DurableEvidence }>,
    start: ToolStartRecord | null,
    key: string,
    representation: ToolBodyRepresentation,
    policy: BodyPolicy,
  ): Promise<Outcome<Begun, ToolFailure>> => {
    if (ports.bodies === undefined) return storeUnavailable('not connected')
    const committed = await ports.transact<Outcome<BodyEntryRecord, ToolFailure>>(
      domainOf(input),
      input.operation,
      async (snapshot, mint) => {
        const allowed = await ports.entry(input, 'write')
        if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
        return beginBodyEntry(snapshot, mint, {
          tenant: input.tenant,
          call: input.call,
          operation: input.operation,
          source: input.source,
          start,
          key,
          representation,
          policy,
        })
      },
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    if ('failure' in committed) return committed
    if ('failure' in committed.ok) return committed.ok
    const entry = committed.ok.ok
    const known = open.get(entry.bodyId)
    if (known !== undefined) return succeed({ entry, body: known })
    if (entry.state.kind !== 'opened') return succeed({ entry, body: null })
    const snapshot = await ports.load(input)
    if ('failure' in snapshot) return snapshot
    const permit = permitFor(input, entry, snapshot.ok)
    if ('failure' in permit) return permit
    const body: OpenBody = {
      permit: permit.ok,
      chunks: 0,
      bytes: 0,
      hash: createHash('sha256'),
      blocks: new Map(),
      text: representation.kind === 'json-document' ? '' : null,
    }
    open.set(entry.bodyId, body)
    return succeed({ entry, body })
  }

  /** Model `Put`: one chunk to the store under the permit; a late permit is renewed once. */
  const putChunk = async (
    input: CallInput<P>,
    entry: BodyEntryRecord,
    body: OpenBody,
    bytes: Uint8Array,
  ): Promise<Outcome<void, ToolFailure>> => {
    const store = ports.bodies?.store
    if (store === undefined) return storeUnavailable('not connected')
    const fresh = await freshPermit(input, entry, body)
    if ('failure' in fresh) return fresh
    let answer = await store.put(body.permit, body.chunks, bytes)
    if (answer.kind === 'permit-expired') {
      const renewed = await renew(input, entry, body)
      if ('failure' in renewed) return renewed
      answer = await store.put(body.permit, body.chunks, bytes)
    }
    switch (answer.kind) {
      case 'kept':
        body.chunks += 1
        body.bytes += bytes.length
        body.hash.update(bytes)
        return succeed(undefined)
      case 'conflict':
        return fail({ kind: 'conflict', operation: entry.operation })
      case 'permit-expired':
      case 'permit-invalid':
        return fail({ kind: 'invalid', field: 'start', reason: answer.kind })
      case 'unavailable':
        return storeUnavailable(answer.diagnostic)
    }
  }

  /** Model `StoreSeal` then `LedgerSeal`. */
  const sealBody = async (
    input: CallInput<P> & Readonly<{ operation: ToolOperationId }>,
    entry: BodyEntryRecord,
    body: OpenBody,
  ): Promise<Outcome<BodyEntryRecord, ToolFailure>> => {
    const store = ports.bodies?.store
    if (store === undefined) return storeUnavailable('not connected')
    const manifest: ToolBodyManifest = {
      chunks: body.chunks,
      bytes: body.bytes,
      digest: body.hash.copy().digest('hex'),
    }
    const fresh = await freshPermit(input, entry, body)
    if ('failure' in fresh) return fresh
    let answer = await store.seal(body.permit, manifest)
    if (answer.kind === 'permit-expired') {
      const renewed = await renew(input, entry, body)
      if ('failure' in renewed) return renewed
      answer = await store.seal(body.permit, manifest)
    }
    switch (answer.kind) {
      case 'sealed':
        break
      case 'not-ready':
        return storeUnavailable(answer.diagnostic)
      case 'conflict':
        return fail({ kind: 'conflict', operation: entry.operation })
      case 'permit-expired':
      case 'permit-invalid':
        return fail({ kind: 'invalid', field: 'start', reason: answer.kind })
      case 'unavailable':
        return storeUnavailable(answer.diagnostic)
    }
    const sealed = await ports.transact<Outcome<BodyEntryRecord, ToolFailure>>(
      domainOf(input),
      input.operation,
      async snapshot => {
        const allowed = await ports.entry(input, 'write')
        if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
        return sealBodyEntry(snapshot, entry.bodyId, manifest)
      },
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    if ('failure' in sealed) return sealed
    if ('ok' in sealed.ok) open.delete(entry.bodyId)
    return sealed.ok
  }

  const sealedBody = (entry: BodyEntryRecord): Outcome<SealedToolBody, ToolPrimitiveFailure> => {
    if (entry.state.kind !== 'sealed' && entry.state.kind !== 'linked')
      return fail({ kind: 'closed', reason: `body is ${entry.state.kind}` })
    return succeed({
      source: bodySource(entry.bodyId, entry.state.manifest),
      bodyId: entry.bodyId,
      representation: entry.representation,
      bodyBytes: String(entry.state.manifest.bytes),
      custody: entry.custody,
    })
  }

  type Bound<P2> = Readonly<{
    input: WriterInput<P2>
    fields: Readonly<Record<string, unknown>>
    snapshot: Snapshot
    policy: BodyPolicy
    representation: ToolBodyRepresentation
  }>

  /** The author's input: the mutation context, the original start, the source and the key. */
  const bind = async (
    supplied: unknown,
    fields: readonly string[],
  ): ToolBodyWriteReply<Bound<P>> => {
    const context = judgeMutationInput<P>(supplied, 'write')
    if ('failure' in context) return fail(primitive(context.failure, 'unadmitted'))
    const operation = context.ok.operation
    const fixed = fixCleanupFields(supplied, ['start', 'source', 'key', ...fields])
    if ('failure' in fixed) return fail(primitive(fixed.failure, operation))
    const source = judgeEvidenceField(fixed.ok.source, 'source')
    if ('failure' in source) return fail(primitive(source.failure, operation))
    if (typeof fixed.ok.key !== 'string' || fixed.ok.key.length === 0)
      return fail({ kind: 'invalid', reason: 'nonempty writer key required' })
    const allowed = await ports.entry(context.ok, 'write')
    if ('failure' in allowed) return fail(primitive(allowed.failure, operation))
    const loaded = await ports.load(context.ok)
    if ('failure' in loaded) return fail(primitive(loaded.failure, operation))
    const call = loaded.ok.call
    if (call === null || call.start === null || !sameFactValue(call.start, fixed.ok.start))
      return fail({ kind: 'invalid', reason: 'original start required' })
    const policy = resultBodyPolicy(
      call.request,
      ports.configuration.offloading,
      ports.configuration.readResultArguments,
    )
    if ('failure' in policy) return fail(primitive(policy.failure, operation))
    const representation = bodyRepresentation(policy.ok.declaration)
    if (representation === null)
      return fail({ kind: 'unsupported', reason: 'body writer requires a body declaration' })
    return succeed({
      input: { ...context.ok, source: source.ok, start: call.start, key: fixed.ok.key },
      fields: fixed.ok,
      snapshot: loaded.ok,
      policy: policy.ok,
      representation,
    })
  }

  const openEntry = (
    bound: Bound<P>,
  ): Outcome<Readonly<{ entry: BodyEntryRecord; body: OpenBody }>, ToolBodyWriteFailure> => {
    const entry = bound.snapshot.bodies.get(bodyIdentity(bound.input.start, bound.input.key))
    if (entry === undefined) return fail({ kind: 'invalid', reason: 'writer does not exist' })
    if (entry.state.kind !== 'opened')
      return fail({ kind: 'closed', reason: `body is ${entry.state.kind}` })
    const body = open.get(entry.bodyId)
    return body === undefined
      ? fail({ kind: 'closed', reason: 'body writer is not open in this process' })
      : succeed({ entry, body })
  }

  const recordText = async (
    value: unknown,
    policy: BodyPolicy,
    operation: ToolOperationId,
  ): ToolBodyWriteReply<string> => {
    const fields = fixCleanupFields(value, ['kind', 'value'])
    if ('failure' in fields) return fail(primitive(fields.failure, operation))
    const limits = policy.jsonLimits
    if (limits === null || policy.declaration.kind !== 'json-lines')
      return fail({ kind: 'invalid', reason: 'JSON record requires a JSON Lines writer' })
    const fixed = fixJsonTree(fields.ok.value, limits.maxBytes)
    if ('failure' in fixed)
      return fail({
        kind:
          fixed.failure.reason === 'too-large' || fixed.failure.reason === 'budget'
            ? 'too-large'
            : 'invalid',
        reason: fixed.failure.detail,
      })
    const read = readJsonText(fixed.ok.text, limits)
    if (read.kind !== 'ok')
      return fail({
        kind: read.kind === 'budget' ? 'too-large' : 'invalid',
        reason: `JSON record ${read.kind}`,
      })
    if (ports.bodySchemas === undefined)
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker missing' })
    try {
      const checked = await ports.bodySchemas.check(policy.declaration.record, read)
      if ('failure' in checked) return fail(primitive(checked.failure, operation))
    } catch {
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker failed' })
    }
    return succeed(`${fixed.ok.text}\n`)
  }

  /** Format validation of a JSON document, before any commit of `sealed`. */
  const checkDocument = async (
    text: string,
    policy: BodyPolicy,
    operation: ToolOperationId,
  ): ToolBodyWriteReply<void> => {
    if (policy.declaration.kind !== 'json-document') return succeed(undefined)
    const limits = policy.jsonLimits
    if (limits === null) return fail({ kind: 'invalid', reason: 'JSON validation budget missing' })
    const read = readJsonBytes(Buffer.from(text, 'utf8'), limits)
    if (read.kind !== 'ok')
      return fail({
        kind: read.kind === 'budget' ? 'too-large' : 'invalid',
        reason: `JSON document ${read.kind}`,
      })
    if (ports.bodySchemas === undefined)
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker missing' })
    try {
      const checked = await ports.bodySchemas.check(policy.declaration.document, read)
      if ('failure' in checked)
        return checked.failure.kind === 'invalid'
          ? fail({ kind: 'invalid', reason: 'JSON document does not satisfy its fixed schema' })
          : fail(primitive(checked.failure, operation))
    } catch {
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker failed' })
    }
    return succeed(undefined)
  }

  const writes: ToolBodyWrites<P> = {
    begin: async supplied => {
      const bound = await bind(supplied, ['representation'])
      if ('failure' in bound) return bound
      const { input, policy, representation } = bound.ok
      if (!sameFactValue(representation, bound.ok.fields.representation))
        return fail({ kind: 'invalid', reason: 'representation must match the fixed declaration' })
      const begun = await begin(input, input.start, input.key, representation, policy)
      if ('failure' in begun) return fail(primitive(begun.failure, input.operation))
      if (begun.ok.body === null)
        return fail({ kind: 'closed', reason: `body is ${begun.ok.entry.state.kind}` })
      const current = await ports.entry(input, 'write')
      if ('failure' in current) return fail(primitive(current.failure, input.operation))
      return succeed({
        key: input.key,
        nextSequence: String(begun.ok.body.chunks + 1),
        custody: begun.ok.entry.custody,
      })
    },
    append: async supplied => {
      const bound = await bind(supplied, ['sequence', 'frame'])
      if ('failure' in bound) return bound
      const { input, policy, representation } = bound.ok
      const opened = openEntry(bound.ok)
      if ('failure' in opened) return opened
      const { entry, body } = opened.ok
      const number = bound.ok.fields.sequence
      if (!sequence(number, false))
        return fail({ kind: 'invalid', reason: 'positive canonical sequence required' })
      if (number !== String(body.chunks + 1))
        return fail({ kind: 'conflict', reason: 'sequence must be the next admitted sequence' })
      const frame = frameOf(bound.ok.fields.frame, representation)
      if ('failure' in frame) return frame
      let text = frame.ok.text
      if (representation.kind === 'json-lines') {
        const record = await recordText(bound.ok.fields.frame, policy, input.operation)
        if ('failure' in record) return record
        text = record.ok
      }
      if (frame.ok.block !== null && body.blocks.get(frame.ok.block) === true)
        return fail({ kind: 'closed', reason: 'text block is already closed' })
      const bytes = Buffer.from(text, 'utf8')
      if (body.bytes + bytes.length > policy.maxBodyBytes)
        return fail({ kind: 'too-large', reason: 'body size exceeded' })
      if (
        policy.declaration.kind === 'json-document' &&
        policy.jsonLimits !== null &&
        body.bytes + bytes.length > policy.jsonLimits.maxBytes
      )
        return fail({ kind: 'too-large', reason: 'JSON document validation budget exceeded' })
      const kept = await putChunk(input, entry, body, bytes)
      if ('failure' in kept) return fail(primitive(kept.failure, input.operation))
      if (frame.ok.block !== null) body.blocks.set(frame.ok.block, frame.ok.end)
      if (body.text !== null) body.text += text
      const current = await ports.entry(input, 'write')
      if ('failure' in current) return fail(primitive(current.failure, input.operation))
      return succeed({ nextSequence: String(body.chunks + 1), custody: entry.custody })
    },
    seal: async supplied => {
      const bound = await bind(supplied, ['afterSequence'])
      if ('failure' in bound) return bound
      const { input, policy, snapshot } = bound.ok
      const known = snapshot.bodies.get(bodyIdentity(input.start, input.key))
      if (known !== undefined && known.state.kind !== 'opened') return sealedBody(known)
      const opened = openEntry(bound.ok)
      if ('failure' in opened) return opened
      const { entry, body } = opened.ok
      const last = bound.ok.fields.afterSequence
      if (!sequence(last, true))
        return fail({ kind: 'invalid', reason: 'canonical last sequence required' })
      if (last !== String(body.chunks))
        return fail({ kind: 'conflict', reason: 'seal must include all admitted sequences' })
      if ([...body.blocks.values()].some(closed => !closed))
        return fail({ kind: 'invalid', reason: 'text blocks must be closed before seal' })
      const checked = await checkDocument(body.text ?? '', policy, input.operation)
      if ('failure' in checked) return checked
      const sealed = await sealBody(input, entry, body)
      if ('failure' in sealed) return fail(primitive(sealed.failure, input.operation))
      const current = await ports.entry(input, 'write')
      if ('failure' in current) return fail(primitive(current.failure, input.operation))
      return sealedBody(sealed.ok)
    },
    inspect: async supplied => {
      const bound = await bind(supplied, [])
      if ('failure' in bound) return bound
      const { input, snapshot } = bound.ok
      const entry = snapshot.bodies.get(bodyIdentity(input.start, input.key))
      if (entry === undefined) return fail({ kind: 'invalid', reason: 'writer does not exist' })
      const status = ((): ToolBodyWriterStatus => {
        switch (entry.state.kind) {
          case 'opened': {
            const chunks = open.get(entry.bodyId)?.chunks ?? 0
            return {
              kind: 'open',
              nextSequence: String(chunks + 1),
              confirmedThrough: String(chunks),
            }
          }
          case 'sealed':
          case 'linked': {
            const body = sealedBody(entry)
            return 'ok' in body
              ? { kind: 'sealed', body: body.ok }
              : { kind: 'failed', failure: body.failure }
          }
          case 'orphaned':
          case 'reclaimed':
            return {
              kind: 'failed',
              failure: { kind: 'closed', reason: `body is ${entry.state.kind}` },
            }
        }
      })()
      return succeed(status)
    },
  }

  const writeBody: BodyWriting<P>['writeBody'] = async (
    input,
    key,
    text,
    policy,
    representation,
  ) => {
    const begun = await begin(input, null, key, representation, policy)
    if ('failure' in begun) return begun
    const { entry, body } = begun.ok
    if (body === null) return succeed(entry)
    const bytes = Buffer.from(text, 'utf8')
    const chunk = ports.configuration.offloading.maxPageBytes
    for (let offset = body.chunks * chunk; offset < bytes.length; offset += chunk) {
      const kept = await putChunk(input, entry, body, bytes.subarray(offset, offset + chunk))
      if ('failure' in kept) return kept
    }
    return sealBody(input, entry, body)
  }

  return { writes, writeBody }
}
