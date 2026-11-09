// Read-back of an offloaded body (BodyLifecycle `ReadBegin`/`ReadRefuse`, `ReadFinish`): the
// ledger check of authorization, result version, body entry and `now < expiresAt`; the store read
// of a chunk range; on a miss the ledger re-check (`reclaimed`, `orphaned` or within ε of expiry
// answers `expired`, only a linked body clearly before expiry reports integrity); after the bytes
// arrive the expiry is checked again on the reader's clock, so a stalled read never breaks the
// window. Reading never extends retention and takes no lease.
import { readJsonBytes, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ContentPage,
  Reply,
  ToolBodyPage,
  ToolFailure,
  ToolOffloadedBody,
} from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  TOOL_REFERENCE_MAX_LENGTH,
  type ToolBodyManifest,
  type ToolBodyReader,
  type ToolBodyRef,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import { invalid, type CallInput } from './boundary.ts'
import type { ToolLedgerPorts, ToolOffloadingConfiguration } from './construction.ts'
import { digestOf } from './evidence.ts'
import { sealedManifest, type BodyEntryRecord } from './ledger-body-entries.ts'
import { fixResultInput } from './ledger-content.ts'
import type { Snapshot } from './ledger-decider.ts'
import { resultRecord } from './ledger-reads.ts'

export type BodyReadInput<P> = Parameters<ToolBodyReader<P>['read']>[0]
type Projection = 'text-utf8-v1' | 'body-bytes-v1'

/** Where a page starts: the chunk, the offset inside it, and the position in the whole body. */
type Position = Readonly<{ seq: number; offset: number; position: number }>

const CHUNKS_PER_READ = 16
const expired = (): Outcome<never, ToolFailure> =>
  fail({ kind: 'not-found', target: 'body', reason: 'expired' })
const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-reader', diagnostic })

export function fixBodyRead<P>(input: unknown): Outcome<BodyReadInput<P>, ToolFailure> {
  const fixed = fixResultInput<P>(input, 'read-content')
  if ('failure' in fixed) return fixed
  if (typeof input !== 'object' || input === null) return invalid('input', 'type')
  const body = decodeToolBodyId(Reflect.get(input, 'bodyId'))
  if ('failure' in body) return invalid('bodyId', body.failure.reason)
  const after: unknown = Reflect.get(input, 'after')
  const maxBytes: unknown = Reflect.get(input, 'maxBytes')
  if (
    after !== null &&
    (typeof after !== 'string' || after.length === 0 || after.length > TOOL_REFERENCE_MAX_LENGTH)
  )
    return invalid('after', 'type-or-size')
  if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    return invalid('maxBytes', 'range')
  return succeed({ ...fixed.ok, bodyId: body.ok, after, maxBytes })
}

type Located = Readonly<{ body: ToolOffloadedBody; entry: BodyEntryRecord }>

/** The ledger check: the result version holds this body and the entry is linked to it. */
function locate<P>(snapshot: Snapshot, input: BodyReadInput<P>): Outcome<Located, ToolFailure> {
  const result = resultRecord(snapshot, input.result)
  if ('failure' in result) return result
  const original = result.ok.value.original
  if (original.kind !== 'offloaded' || original.body.bodyId !== input.bodyId)
    return fail({ kind: 'not-found', target: 'body', reason: 'missing' })
  const entry = snapshot.bodies.get(input.bodyId)
  if (entry === undefined) return unavailable('body entry is missing')
  if (entry.state.kind === 'reclaimed' || entry.state.kind === 'orphaned') return expired()
  if (entry.state.kind !== 'linked' || entry.state.result !== input.result)
    return unavailable('body entry is not linked to this result')
  return succeed({ body: original.body, entry })
}

/** Every cursor is signed over its whole content, so a cursor of another tenant, result or body fails. */
function cursorScope<P>(input: BodyReadInput<P>, projection: Projection, at: Position): string {
  return digestOf({
    tenant: input.tenant,
    call: input.call,
    result: input.result,
    bodyId: input.bodyId,
    projection,
    ...at,
  })
}

function encodeCursor<P>(input: BodyReadInput<P>, projection: Projection, at: Position): string {
  return JSON.stringify({ version: 2, ...at, scope: cursorScope(input, projection, at) })
}

function decodeCursor<P>(
  input: BodyReadInput<P>,
  projection: Projection,
  total: number,
): Outcome<Position, ToolFailure> {
  if (input.after === null) return succeed({ seq: 0, offset: 0, position: 0 })
  let cursor: unknown
  try {
    cursor = JSON.parse(input.after)
  } catch {
    return fail({ kind: 'invalid-cursor', reason: 'not-a-body-cursor' })
  }
  if (typeof cursor !== 'object' || cursor === null || Object.keys(cursor).length !== 5)
    return fail({ kind: 'invalid-cursor', reason: 'not-a-body-cursor' })
  const seq: unknown = Reflect.get(cursor, 'seq')
  const offset: unknown = Reflect.get(cursor, 'offset')
  const position: unknown = Reflect.get(cursor, 'position')
  if (
    Reflect.get(cursor, 'version') !== 2 ||
    typeof seq !== 'number' ||
    typeof offset !== 'number' ||
    typeof position !== 'number' ||
    !Number.isSafeInteger(seq) ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(position) ||
    position <= 0 ||
    position >= total
  )
    return fail({ kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' })
  const at = { seq, offset, position }
  return Reflect.get(cursor, 'scope') === cursorScope(input, projection, at)
    ? succeed(at)
    : fail({ kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' })
}

/** Where a run of page bytes came from, and whether it reached the end of its chunk. */
type Segment = Readonly<{ seq: number; offset: number; length: number; chunkEnd: boolean }>
type Range =
  | Readonly<{
      kind: 'bytes'
      bytes: Buffer
      segments: readonly Segment[]
      manifest: ToolBodyManifest
    }>
  | Readonly<{ kind: 'absent' }>

/** Model `ReadStore`: up to `budget` bytes from `at`, chunk by chunk, with where each byte came from. */
async function readRange(
  store: NonNullable<ToolLedgerPorts<unknown>['bodies']>['store'],
  ref: ToolBodyRef,
  at: Position,
  budget: number,
): Promise<Outcome<Range, ToolFailure>> {
  const parts: Buffer[] = []
  const segments: Segment[] = []
  let manifest: ToolBodyManifest | null = null
  let seq = at.seq
  let offset = at.offset
  let taken = 0
  for (;;) {
    if (manifest !== null && (seq >= manifest.chunks || taken >= budget)) break
    const answer = await store.read(ref, { first: seq, count: CHUNKS_PER_READ })
    if (answer.kind === 'unavailable') return unavailable(answer.diagnostic)
    if (answer.kind === 'absent') return succeed({ kind: 'absent' })
    manifest = answer.manifest
    if (seq >= manifest.chunks) break
    if (answer.chunks.length === 0) return unavailable('sealed body is missing a chunk')
    for (const chunk of answer.chunks) {
      if (chunk.seq !== seq) return unavailable('sealed body is missing a chunk')
      const slice = Buffer.from(chunk.bytes.subarray(offset, offset + (budget - taken)))
      if (slice.length > 0) {
        parts.push(slice)
        segments.push({
          seq,
          offset,
          length: slice.length,
          chunkEnd: offset + slice.length === chunk.bytes.length,
        })
        taken += slice.length
      }
      if (offset + slice.length < chunk.bytes.length) {
        return succeed({ kind: 'bytes', bytes: Buffer.concat(parts), segments, manifest })
      }
      seq += 1
      offset = 0
      if (taken >= budget) break
    }
  }
  if (manifest === null) return unavailable('sealed body has no manifest')
  return succeed({ kind: 'bytes', bytes: Buffer.concat(parts), segments, manifest })
}

/** The position after `consumed` bytes of the range. */
function advance(at: Position, segments: readonly Segment[], consumed: number): Position {
  let remaining = consumed
  let next: Position = at
  for (const segment of segments) {
    if (remaining < segment.length)
      return {
        seq: segment.seq,
        offset: segment.offset + remaining,
        position: at.position + consumed,
      }
    remaining -= segment.length
    next = segment.chunkEnd
      ? { seq: segment.seq + 1, offset: 0, position: at.position + consumed }
      : {
          seq: segment.seq,
          offset: segment.offset + segment.length,
          position: at.position + consumed,
        }
  }
  return next
}

/** The longest prefix that ends on a UTF-8 character boundary. */
function characterPrefix(bytes: Buffer): number {
  let end = bytes.length
  for (let back = 1; back <= 3 && end - back >= 0; back += 1) {
    const byte = bytes[end - back]!
    if ((byte & 0xc0) === 0x80) continue
    const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
    return need === back ? end : end - back
  }
  return end
}

export function createLedgerBodyReads<P>(
  ports: Readonly<{
    bodies: ToolLedgerPorts<P>['bodies'] | undefined
    configuration: ToolOffloadingConfiguration
    authorize(input: CallInput<P>): Reply<void>
    load(input: CallInput<P>): Reply<Snapshot>
  }>,
): ToolBodyReader<P> & Readonly<{ bytes(input: BodyReadInput<P>): Reply<ContentPage> }> {
  const skew = ports.configuration.clockSkewMs
  const beforeExpiry = (now: ToolInstant, body: ToolOffloadedBody) =>
    Date.parse(now) < Date.parse(body.retention.expiresAt)

  type Page = Readonly<{
    located: Located
    at: Position
    bytes: Buffer
    segments: readonly Segment[]
    total: number
  }>

  /** The ledger check, the store read, the re-check on a miss and the re-check after the bytes. */
  const readPage = async (
    input: BodyReadInput<P>,
    projection: Projection,
  ): Promise<Outcome<Page, ToolFailure>> => {
    const bodies = ports.bodies
    if (bodies === undefined) return unavailable('body store is not connected')
    const allowed = await ports.authorize(input)
    if ('failure' in allowed) return allowed
    const snapshot = await ports.load(input)
    if ('failure' in snapshot) return snapshot
    const located = locate(snapshot.ok, input)
    if ('failure' in located) return located
    if (!beforeExpiry(bodies.clock.now(), located.ok.body)) return expired()
    const total = Number(located.ok.body.bodyBytes)
    const at = decodeCursor(input, projection, total)
    if ('failure' in at) return at
    const ref: ToolBodyRef = { tenant: input.tenant, call: input.call, body: input.bodyId }
    const budget = Math.min(input.maxBytes, ports.configuration.maxPageBytes)
    const range = await readRange(bodies.store, ref, at.ok, budget)
    if ('failure' in range) return range
    if (range.ok.kind === 'absent') {
      const again = await ports.load(input)
      if ('failure' in again) return again
      const entry = again.ok.bodies.get(input.bodyId)
      const now = bodies.clock.now()
      if (
        entry === undefined ||
        entry.state.kind === 'reclaimed' ||
        entry.state.kind === 'orphaned' ||
        Date.parse(located.ok.body.retention.expiresAt) <= Date.parse(now) + skew
      )
        return expired()
      return unavailable('integrity: a linked body before its expiry has no bytes in the store')
    }
    const manifest = sealedManifest(located.ok.entry)
    if (
      manifest === null ||
      manifest.digest !== range.ok.manifest.digest ||
      manifest.bytes !== range.ok.manifest.bytes ||
      manifest.bytes !== total
    )
      return unavailable('integrity: the stored manifest differs from the ledger entry')
    if (!beforeExpiry(bodies.clock.now(), located.ok.body)) return expired()
    const current = await ports.authorize(input)
    if ('failure' in current) return current
    return succeed({
      located: located.ok,
      at: at.ok,
      bytes: range.ok.bytes,
      segments: range.ok.segments,
      total,
    })
  }

  const next = (input: BodyReadInput<P>, projection: Projection, page: Page, consumed: number) => {
    const end = page.at.position + consumed
    return end >= page.total
      ? null
      : encodeCursor(input, projection, advance(page.at, page.segments, consumed))
  }

  const textPage = (input: BodyReadInput<P>, page: Page): Outcome<ToolBodyPage, ToolFailure> => {
    const { body } = page.located
    const representation = body.representation
    if (representation.kind !== 'text' && representation.kind !== 'json-document')
      return invalid('body', 'text or JSON document body required')
    const first = page.bytes[0]
    if (page.at.position > 0 && first !== undefined && (first & 0xc0) === 0x80)
      return fail({ kind: 'invalid-cursor', reason: 'not-a-character-boundary' })
    const atEnd = page.at.position + page.bytes.length >= page.total
    const consumed = atEnd ? page.bytes.length : characterPrefix(page.bytes)
    if (consumed === 0 && page.total > 0) return invalid('maxBytes', 'first-character-does-not-fit')
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        page.bytes.subarray(0, consumed),
      )
    } catch {
      return unavailable('sealed body is not valid UTF-8')
    }
    const common = {
      result: input.result,
      bodyId: input.bodyId,
      bodyBytes: body.bodyBytes,
      expiresAt: body.retention.expiresAt,
      position: String(page.at.position),
      next: next(input, 'text-utf8-v1', page, consumed),
      text,
    }
    return succeed(
      representation.kind === 'text'
        ? { ...common, kind: 'text', representation }
        : {
            ...common,
            kind: 'json-document',
            representation,
            completeness: page.at.position === 0 && common.next === null ? 'complete' : 'fragment',
          },
    )
  }

  const recordsPage = (input: BodyReadInput<P>, page: Page): Outcome<ToolBodyPage, ToolFailure> => {
    const { body } = page.located
    const representation = body.representation
    if (representation.kind !== 'json-lines') return invalid('body', 'JSON Lines required')
    const atEnd = page.at.position + page.bytes.length >= page.total
    const consumed = page.bytes.lastIndexOf(10) + 1
    if (atEnd && consumed !== page.bytes.length)
      return unavailable('sealed JSON Lines body has an incomplete final record')
    if (consumed === 0 && page.total > 0)
      return invalid('maxBytes', `first-record-does-not-fit:${page.at.position}`)
    const budget = Math.max(page.bytes.length, 1)
    const limits = {
      maxBytes: budget,
      maxDepth: budget,
      maxItems: budget,
      maxMembers: budget,
      maxStringLength: budget,
      maxNumberLength: budget,
    }
    const records: JsonValue[] = []
    for (let offset = 0; offset < consumed;) {
      const end = page.bytes.indexOf(10, offset)
      const read = readJsonBytes(page.bytes.subarray(offset, end), limits)
      if (read.kind !== 'ok') return unavailable(`sealed JSON Lines record is ${read.kind}`)
      records.push(read.value)
      offset = end + 1
    }
    return succeed({
      kind: 'json-lines',
      representation,
      records,
      result: input.result,
      bodyId: input.bodyId,
      bodyBytes: body.bodyBytes,
      expiresAt: body.retention.expiresAt,
      position: String(page.at.position),
      next: next(input, 'text-utf8-v1', page, consumed),
    })
  }

  return {
    read: async supplied => {
      const fixed = fixBodyRead<P>(supplied)
      if ('failure' in fixed) return fixed
      const page = await readPage(fixed.ok, 'text-utf8-v1')
      if ('failure' in page) return page
      return page.ok.located.body.representation.kind === 'json-lines'
        ? recordsPage(fixed.ok, page.ok)
        : textPage(fixed.ok, page.ok)
    },
    bytes: async supplied => {
      const fixed = fixBodyRead<P>(supplied)
      if ('failure' in fixed) return fixed
      const page = await readPage(fixed.ok, 'body-bytes-v1')
      if ('failure' in page) return page
      return succeed({
        result: fixed.ok.result,
        attachment: { ...page.ok.located.body.source },
        offset: String(page.ok.at.position),
        bytes: Uint8Array.from(page.ok.bytes),
        next: next(fixed.ok, 'body-bytes-v1', page.ok, page.ok.bytes.length),
      })
    },
  }
}
