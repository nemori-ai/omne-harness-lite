// The writer over the body store (BodyLifecycle `Begin`, `Renew`, `Put`, `StoreSeal`,
// `LedgerSeal`). The ledger commits `opened` and only then signs a permit; chunks go to the store
// under the permit and never through the ledger; the store seals first, the ledger records `sealed`
// afterwards. The running digest, byte count and block state of an open body live in this process:
// the author's execution lives in the same process, and a body whose process dies stays `opened`
// until settlement orphans it.
import { createHash, type Hash } from 'node:crypto'
import { readJsonBytes, readJsonText, type JsonLimits } from '@omne-harness/json-text'
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
  type ToolBodyPutAnswer,
  type ToolBodySealAnswer,
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

type SchemaCheck<P> = Parameters<NonNullable<ToolLedgerPorts<P>['bodySchemas']>['check']>

const LEDGER_INSTANCE = ledgerInstance()

function ledgerInstance() {
  const decoded = decodeToolInstanceId('tool-ledger')
  if ('failure' in decoded) throw new Error('ledger minted an illegal instance identity')
  return decoded.ok
}

const sequence = (value: unknown, allowZero: boolean): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && (allowZero || value !== '0')

const closed = (reason: string): ToolPrimitiveFailure => ({ kind: 'closed', reason })
const invalid = (reason: string): ToolPrimitiveFailure => ({ kind: 'invalid', reason })

type Primitive<K extends ToolFailure['kind']> = (
  failure: Extract<ToolFailure, { kind: K }>,
  operation: string,
) => ToolBodyWriteFailure

/** How each ledger failure reaches the author: a call or start problem closes the writer. */
const PRIMITIVE: { [K in ToolFailure['kind']]: Primitive<K> } = {
  denied: failure => failure,
  invalid: failure =>
    failure.field === 'call' || failure.field === 'start'
      ? closed(`${failure.field}: ${failure.reason}`)
      : invalid(`${failure.field}: ${failure.reason}`),
  conflict: () => ({ kind: 'conflict', reason: 'operation conflicts with a recorded input' }),
  'commit-unknown': failure => ({
    kind: 'unknown',
    operation: failure.operation,
    reason: 'commit outcome is unknown',
  }),
  unavailable: (failure, operation) => ({
    kind: 'unavailable',
    operation,
    reason: `${failure.dependency}: ${failure.diagnostic}`,
  }),
  unsupported: failure => ({ kind: 'unsupported', reason: failure.reason }),
  'not-found': failure => invalid(`${failure.target}: ${failure.reason}`),
  'invalid-cursor': failure => invalid(failure.reason),
  'not-settled': () => ({ kind: 'busy', reason: 'operation has not settled' }),
  'stale-instance': () => closed('writer execution is stale'),
  'stale-revision': () => closed('writer execution is stale'),
}

function primitive(failure: ToolFailure, operation: string): ToolBodyWriteFailure {
  const map = PRIMITIVE[failure.kind] as Primitive<ToolFailure['kind']>
  return map(failure, operation)
}

export function instantAfter(now: ToolInstant, ms: number): ToolInstant {
  const decoded = decodeToolInstant(new Date(Date.parse(now) + ms).toISOString())
  if ('failure' in decoded) throw new Error('ledger minted an illegal instant')
  return decoded.ok
}

const storeUnavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-store', diagnostic })

/** A store answer other than success, as the ledger reports it. */
function storeRefusal(
  answer: Exclude<ToolBodyPutAnswer | ToolBodySealAnswer, { kind: 'kept' | 'sealed' }>,
  entry: BodyEntryRecord,
): Outcome<never, ToolFailure> {
  switch (answer.kind) {
    case 'conflict':
      return fail({ kind: 'conflict', operation: entry.operation })
    case 'permit-expired':
    case 'permit-invalid':
      return fail({ kind: 'invalid', field: 'start', reason: answer.kind })
    case 'not-ready':
    case 'unavailable':
      return storeUnavailable(answer.diagnostic)
  }
}

type Frame = Readonly<{ text: string; block: string | null; end: boolean }>

function frameOf(
  value: unknown,
  representation: ToolBodyRepresentation,
): Outcome<Frame, ToolPrimitiveFailure> {
  if (typeof value !== 'object' || value === null) return fail(invalid('frame must be an object'))
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind === 'text' && representation.kind === 'text') return textFrame(value)
  if (kind === 'json-fragment' && representation.kind === 'json-document')
    return fragmentFrame(value)
  if (kind === 'json-record' && representation.kind === 'json-lines')
    return succeed({ text: '', block: null, end: false })
  return fail(invalid('frame must match the fixed body representation'))
}

function textFrame(value: object): Outcome<Frame, ToolPrimitiveFailure> {
  const text: unknown = Reflect.get(value, 'text')
  const block: unknown = Reflect.get(value, 'block')
  const end: unknown = Reflect.get(value, 'end')
  const wellFormed = typeof text === 'string' && text.isWellFormed()
  const named = typeof block === 'string' && block.length > 0
  return wellFormed && named && typeof end === 'boolean'
    ? succeed({ text, block, end })
    : fail(invalid('valid text frame required'))
}

function fragmentFrame(value: object): Outcome<Frame, ToolPrimitiveFailure> {
  const text: unknown = Reflect.get(value, 'text')
  return typeof text === 'string' && text.isWellFormed()
    ? succeed({ text, block: null, end: false })
    : fail(invalid('valid JSON text fragment required'))
}

/** One JSON Lines record as the body stores it: a canonical JSON text within the record limits. */
function recordLine(value: unknown, limits: JsonLimits): Outcome<string, ToolBodyWriteFailure> {
  const fixed = fixJsonTree(value, limits.maxBytes)
  if ('failure' in fixed)
    return fail({
      kind:
        fixed.failure.reason === 'too-large' || fixed.failure.reason === 'budget'
          ? 'too-large'
          : 'invalid',
      reason: fixed.failure.detail,
    })
  const read = readJsonText(fixed.ok.text, limits)
  return read.kind === 'ok'
    ? succeed(fixed.ok.text)
    : fail({
        kind: read.kind === 'budget' ? 'too-large' : 'invalid',
        reason: `JSON record ${read.kind}`,
      })
}

/** The bytes of one frame would take the body over its hard limit or its validation budget. */
function sizeRefusal(
  body: OpenBody,
  length: number,
  policy: BodyPolicy,
): ToolBodyWriteFailure | null {
  if (body.bytes + length > policy.maxBodyBytes)
    return { kind: 'too-large', reason: 'body size exceeded' }
  if (
    policy.declaration.kind === 'json-document' &&
    policy.jsonLimits !== null &&
    body.bytes + length > policy.jsonLimits.maxBytes
  )
    return { kind: 'too-large', reason: 'JSON document validation budget exceeded' }
  return null
}

/** `append` admits exactly the next sequence. */
function sequenceRefusal(value: unknown, body: OpenBody): ToolBodyWriteFailure | null {
  if (!sequence(value, false)) return invalid('positive canonical sequence required')
  return value === String(body.chunks + 1)
    ? null
    : { kind: 'conflict', reason: 'sequence must be the next admitted sequence' }
}

/** `seal` names the last sequence admitted, and every text block has ended. */
function sealRefusal(afterSequence: unknown, body: OpenBody): ToolBodyWriteFailure | null {
  if (!sequence(afterSequence, true)) return invalid('canonical last sequence required')
  if (afterSequence !== String(body.chunks))
    return { kind: 'conflict', reason: 'seal must include all admitted sequences' }
  return [...body.blocks.values()].some(ended => !ended)
    ? invalid('text blocks must be closed before seal')
    : null
}

function sealedBody(entry: BodyEntryRecord): Outcome<SealedToolBody, ToolPrimitiveFailure> {
  if (entry.state.kind !== 'sealed' && entry.state.kind !== 'linked')
    return fail(closed(`body is ${entry.state.kind}`))
  return succeed({
    source: bodySource(entry.bodyId, entry.state.manifest),
    bodyId: entry.bodyId,
    representation: entry.representation,
    bodyBytes: String(entry.state.manifest.bytes),
    custody: entry.custody,
  })
}

/** What `inspect` answers for an entry: open with its confirmed sequences, sealed, or closed. */
function writerStatus(entry: BodyEntryRecord, open: OpenBody | undefined): ToolBodyWriterStatus {
  switch (entry.state.kind) {
    case 'opened': {
      const chunks = open?.chunks ?? 0
      return { kind: 'open', nextSequence: String(chunks + 1), confirmedThrough: String(chunks) }
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
      return { kind: 'failed', failure: closed(`body is ${entry.state.kind}`) }
  }
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
    return succeed(
      signBodyPermit(bodies.permitKey, {
        tenant: input.tenant,
        call: input.call,
        body: entry.bodyId,
        instance: execution?.instance ?? LEDGER_INSTANCE,
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

  /**
   * One store action under the body's permit: the permit is renewed first when it is within ε of
   * its deadline, and once more when the store still finds it expired.
   */
  const underPermit = async <A extends Readonly<{ kind: string }>>(
    input: CallInput<P>,
    entry: BodyEntryRecord,
    body: OpenBody,
    act: (permit: ToolBodyPermit) => Promise<A>,
  ): Promise<Outcome<A, ToolFailure>> => {
    const fresh = await freshPermit(input, entry, body)
    if ('failure' in fresh) return fresh
    const answer = await act(body.permit)
    if (answer.kind !== 'permit-expired') return succeed(answer)
    const renewed = await renew(input, entry, body)
    if ('failure' in renewed) return renewed
    return succeed(await act(body.permit))
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

  /** Model `Put`: one chunk to the store under the permit. */
  const putChunk = async (
    input: CallInput<P>,
    entry: BodyEntryRecord,
    body: OpenBody,
    bytes: Uint8Array,
  ): Promise<Outcome<void, ToolFailure>> => {
    const store = ports.bodies?.store
    if (store === undefined) return storeUnavailable('not connected')
    const answer = await underPermit(input, entry, body, permit =>
      store.put(permit, body.chunks, bytes),
    )
    if ('failure' in answer) return answer
    if (answer.ok.kind !== 'kept') return storeRefusal(answer.ok, entry)
    body.chunks += 1
    body.bytes += bytes.length
    body.hash.update(bytes)
    return succeed(undefined)
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
    const answer = await underPermit(input, entry, body, permit => store.seal(permit, manifest))
    if ('failure' in answer) return answer
    if (answer.ok.kind !== 'sealed') return storeRefusal(answer.ok, entry)
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

  type Bound<P2> = Readonly<{
    input: WriterInput<P2>
    fields: Readonly<Record<string, unknown>>
    snapshot: Snapshot
    policy: BodyPolicy
    representation: ToolBodyRepresentation
  }>

  /** The body policy and representation the call's return declaration fixes for its writer. */
  const declaredWriter = (
    request: NonNullable<Snapshot['call']>['request'],
    operation: ToolOperationId,
  ): Outcome<Pick<Bound<P>, 'policy' | 'representation'>, ToolBodyWriteFailure> => {
    const policy = resultBodyPolicy(
      request,
      ports.configuration.offloading,
      ports.configuration.readResultArguments,
    )
    if ('failure' in policy) return fail(primitive(policy.failure, operation))
    const representation = bodyRepresentation(policy.ok.declaration)
    return representation === null
      ? fail({ kind: 'unsupported', reason: 'body writer requires a body declaration' })
      : succeed({ policy: policy.ok, representation })
  }

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
      return fail(invalid('nonempty writer key required'))
    const allowed = await ports.entry(context.ok, 'write')
    if ('failure' in allowed) return fail(primitive(allowed.failure, operation))
    const loaded = await ports.load(context.ok)
    if ('failure' in loaded) return fail(primitive(loaded.failure, operation))
    const call = loaded.ok.call
    if (call === null || call.start === null || !sameFactValue(call.start, fixed.ok.start))
      return fail(invalid('original start required'))
    const declared = declaredWriter(call.request, operation)
    if ('failure' in declared) return declared
    return succeed({
      input: { ...context.ok, source: source.ok, start: call.start, key: fixed.ok.key },
      fields: fixed.ok,
      snapshot: loaded.ok,
      ...declared.ok,
    })
  }

  const openEntry = (
    bound: Bound<P>,
  ): Outcome<Readonly<{ entry: BodyEntryRecord; body: OpenBody }>, ToolBodyWriteFailure> => {
    const entry = bound.snapshot.bodies.get(bodyIdentity(bound.input.start, bound.input.key))
    if (entry === undefined) return fail(invalid('writer does not exist'))
    if (entry.state.kind !== 'opened') return fail(closed(`body is ${entry.state.kind}`))
    const body = open.get(entry.bodyId)
    return body === undefined
      ? fail(closed('body writer is not open in this process'))
      : succeed({ entry, body })
  }

  /** The schema port's verdict on a read value; `refused` says how its refusal reaches the author. */
  const checkSchema = async (
    schema: SchemaCheck<P>[0],
    read: SchemaCheck<P>[1],
    operation: ToolOperationId,
    refused: (failure: ToolFailure) => ToolBodyWriteFailure,
  ): ToolBodyWriteReply<void> => {
    if (ports.bodySchemas === undefined)
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker missing' })
    try {
      const checked = await ports.bodySchemas.check(schema, read)
      return 'failure' in checked ? fail(refused(checked.failure)) : succeed(undefined)
    } catch {
      return fail({ kind: 'unavailable', operation, reason: 'body schema checker failed' })
    }
  }

  /** One JSON Lines record: a canonical text within the record limits that satisfies the record schema. */
  const recordText = async (
    value: unknown,
    policy: BodyPolicy,
    operation: ToolOperationId,
  ): ToolBodyWriteReply<string> => {
    const fields = fixCleanupFields(value, ['kind', 'value'])
    if ('failure' in fields) return fail(primitive(fields.failure, operation))
    const limits = policy.jsonLimits
    if (limits === null || policy.declaration.kind !== 'json-lines')
      return fail(invalid('JSON record requires a JSON Lines writer'))
    const line = recordLine(fields.ok.value, limits)
    if ('failure' in line) return line
    const read = readJsonText(line.ok, limits)
    if (read.kind !== 'ok') return fail(invalid(`JSON record ${read.kind}`))
    const checked = await checkSchema(policy.declaration.record, read, operation, failure =>
      primitive(failure, operation),
    )
    return 'failure' in checked ? checked : succeed(`${line.ok}\n`)
  }

  /** Format validation of a JSON document, before any commit of `sealed`. */
  const checkDocument = async (
    text: string,
    policy: BodyPolicy,
    operation: ToolOperationId,
  ): ToolBodyWriteReply<void> => {
    if (policy.declaration.kind !== 'json-document') return succeed(undefined)
    const limits = policy.jsonLimits
    if (limits === null) return fail(invalid('JSON validation budget missing'))
    const read = readJsonBytes(Buffer.from(text, 'utf8'), limits)
    if (read.kind !== 'ok')
      return fail({
        kind: read.kind === 'budget' ? 'too-large' : 'invalid',
        reason: `JSON document ${read.kind}`,
      })
    return checkSchema(policy.declaration.document, read, operation, failure =>
      failure.kind === 'invalid'
        ? invalid('JSON document does not satisfy its fixed schema')
        : primitive(failure, operation),
    )
  }

  /** The frame of an append as bytes of the body, after the frame, block and size rules. */
  const frameBytes = async (
    bound: Bound<P>,
    body: OpenBody,
  ): ToolBodyWriteReply<Readonly<{ frame: Frame; text: string; bytes: Buffer }>> => {
    const { policy, representation, input } = bound
    const frame = frameOf(bound.fields.frame, representation)
    if ('failure' in frame) return frame
    let text = frame.ok.text
    if (representation.kind === 'json-lines') {
      const record = await recordText(bound.fields.frame, policy, input.operation)
      if ('failure' in record) return record
      text = record.ok
    }
    if (frame.ok.block !== null && body.blocks.get(frame.ok.block) === true)
      return fail(closed('text block is already closed'))
    const bytes = Buffer.from(text, 'utf8')
    const refusal = sizeRefusal(body, bytes.length, policy)
    return refusal === null ? succeed({ frame: frame.ok, text, bytes }) : fail(refusal)
  }

  const writes: ToolBodyWrites<P> = {
    begin: async supplied => {
      const bound = await bind(supplied, ['representation'])
      if ('failure' in bound) return bound
      const { input, policy, representation } = bound.ok
      if (!sameFactValue(representation, bound.ok.fields.representation))
        return fail(invalid('representation must match the fixed declaration'))
      const begun = await begin(input, input.start, input.key, representation, policy)
      if ('failure' in begun) return fail(primitive(begun.failure, input.operation))
      if (begun.ok.body === null) return fail(closed(`body is ${begun.ok.entry.state.kind}`))
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
      const { input } = bound.ok
      const opened = openEntry(bound.ok)
      if ('failure' in opened) return opened
      const { entry, body } = opened.ok
      const refused = sequenceRefusal(bound.ok.fields.sequence, body)
      if (refused !== null) return fail(refused)
      const admitted = await frameBytes(bound.ok, body)
      if ('failure' in admitted) return admitted
      const { frame, text, bytes } = admitted.ok
      const kept = await putChunk(input, entry, body, bytes)
      if ('failure' in kept) return fail(primitive(kept.failure, input.operation))
      if (frame.block !== null) body.blocks.set(frame.block, frame.end)
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
      const refused = sealRefusal(bound.ok.fields.afterSequence, body)
      if (refused !== null) return fail(refused)
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
      if (entry === undefined) return fail(invalid('writer does not exist'))
      return succeed(writerStatus(entry, open.get(entry.bodyId)))
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
