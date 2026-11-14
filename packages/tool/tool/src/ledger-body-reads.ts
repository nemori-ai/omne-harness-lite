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
type BodyStore = NonNullable<ToolLedgerPorts<unknown>['bodies']>['store']

type Position = Readonly<{ seq: number; offset: number; position: number }>

const CHUNKS_PER_READ = 16
const START: Position = { seq: 0, offset: 0, position: 0 }
const expired = (): Outcome<never, ToolFailure> =>
  fail({ kind: 'not-found', target: 'body', reason: 'expired' })
const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-reader', diagnostic })
const notCursor = (reason: 'not-a-body-cursor' | 'another-body-or-invalid-position') =>
  fail({ kind: 'invalid-cursor' as const, reason })

const isCursorText = (after: unknown): after is string | null =>
  after === null ||
  (typeof after === 'string' && after.length > 0 && after.length <= TOOL_REFERENCE_MAX_LENGTH)
const isByteBudget = (maxBytes: unknown): maxBytes is number =>
  typeof maxBytes === 'number' && Number.isSafeInteger(maxBytes) && maxBytes > 0

export function fixBodyRead<P>(input: unknown): Outcome<BodyReadInput<P>, ToolFailure> {
  const fixed = fixResultInput<P>(input, 'read-content')
  if ('failure' in fixed) return fixed
  if (typeof input !== 'object' || input === null) return invalid('input', 'type')
  const body = decodeToolBodyId(Reflect.get(input, 'bodyId'))
  if ('failure' in body) return invalid('bodyId', body.failure.reason)
  const after: unknown = Reflect.get(input, 'after')
  const maxBytes: unknown = Reflect.get(input, 'maxBytes')
  if (!isCursorText(after)) return invalid('after', 'type-or-size')
  if (!isByteBudget(maxBytes)) return invalid('maxBytes', 'range')
  return succeed({ ...fixed.ok, bodyId: body.ok, after, maxBytes })
}

type Located = Readonly<{ body: ToolOffloadedBody; entry: BodyEntryRecord }>

function locate<P>(snapshot: Snapshot, input: BodyReadInput<P>): Outcome<Located, ToolFailure> {
  const result = resultRecord(snapshot, input.result)
  if ('failure' in result) return result
  const original = result.ok.value.original
  if (original.kind !== 'offloaded' || original.bodyId !== input.bodyId)
    return fail({ kind: 'not-found', target: 'body', reason: 'missing' })
  const entry = snapshot.bodies.get(input.bodyId)
  if (entry === undefined) return unavailable('body entry is missing')
  if (entry.state.kind === 'reclaimed' || entry.state.kind === 'orphaned') return expired()
  if (entry.state.kind !== 'linked' || entry.state.result !== input.result)
    return unavailable('body entry is not linked to this result')
  return succeed({ body: original, entry })
}

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

function cursorPosition(cursor: object, total: number): Position | null {
  const seq: unknown = Reflect.get(cursor, 'seq')
  const offset: unknown = Reflect.get(cursor, 'offset')
  const position: unknown = Reflect.get(cursor, 'position')
  const integers = [seq, offset, position].every(
    field => typeof field === 'number' && Number.isSafeInteger(field),
  )
  if (Reflect.get(cursor, 'version') !== 2 || !integers) return null
  const at = { seq, offset, position } as Position
  return at.position > 0 && at.position < total ? at : null
}

function decodeCursor<P>(
  input: BodyReadInput<P>,
  projection: Projection,
  total: number,
): Outcome<Position, ToolFailure> {
  if (input.after === null) return succeed(START)
  let cursor: unknown
  try {
    cursor = JSON.parse(input.after)
  } catch {
    return notCursor('not-a-body-cursor')
  }
  if (typeof cursor !== 'object' || cursor === null || Object.keys(cursor).length !== 5)
    return notCursor('not-a-body-cursor')
  const at = cursorPosition(cursor, total)
  return at !== null && Reflect.get(cursor, 'scope') === cursorScope(input, projection, at)
    ? succeed(at)
    : notCursor('another-body-or-invalid-position')
}

type Segment = Readonly<{ seq: number; offset: number; length: number; chunkEnd: boolean }>
type Range =
  | Readonly<{
      kind: 'bytes'
      bytes: Buffer
      segments: readonly Segment[]
      manifest: ToolBodyManifest
    }>
  | Readonly<{ kind: 'absent' }>

class Taken {
  readonly parts: Buffer[] = []
  readonly segments: Segment[] = []
  readonly budget: number
  seq: number
  offset: number
  length = 0
  constructor(at: Position, budget: number) {
    this.budget = budget
    this.seq = at.seq
    this.offset = at.offset
  }
  get full(): boolean {
    return this.length >= this.budget
  }
  take(chunk: Uint8Array): boolean {
    const slice = Buffer.from(
      chunk.subarray(this.offset, this.offset + (this.budget - this.length)),
    )
    if (slice.length > 0) {
      this.parts.push(slice)
      this.segments.push({
        seq: this.seq,
        offset: this.offset,
        length: slice.length,
        chunkEnd: this.offset + slice.length === chunk.length,
      })
      this.length += slice.length
    }
    if (this.offset + slice.length < chunk.length) return false
    this.seq += 1
    this.offset = 0
    return true
  }
  takeAll(
    chunks: readonly Readonly<{ seq: number; bytes: Uint8Array }>[],
  ): 'missing' | 'partial' | 'done' {
    if (chunks.length === 0) return 'missing'
    for (const chunk of chunks) {
      if (chunk.seq !== this.seq) return 'missing'
      if (!this.take(chunk.bytes)) return 'partial'
      if (this.full) break
    }
    return 'done'
  }
  range(manifest: ToolBodyManifest): Range {
    return { kind: 'bytes', bytes: Buffer.concat(this.parts), segments: this.segments, manifest }
  }
}

async function readRange(
  store: BodyStore,
  ref: ToolBodyRef,
  at: Position,
  budget: number,
): Promise<Outcome<Range, ToolFailure>> {
  const taken = new Taken(at, budget)
  let manifest: ToolBodyManifest | null = null
  while (manifest === null || (taken.seq < manifest.chunks && !taken.full)) {
    const answer = await store.read(ref, { first: taken.seq, count: CHUNKS_PER_READ })
    if (answer.kind === 'unavailable') return unavailable(answer.diagnostic)
    if (answer.kind === 'absent') return succeed({ kind: 'absent' })
    manifest = answer.manifest
    if (taken.seq >= manifest.chunks) break
    const took = taken.takeAll(answer.chunks)
    if (took === 'missing') return unavailable('sealed body is missing a chunk')
    if (took === 'partial') break
  }
  return succeed(taken.range(manifest))
}

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

function manifestMatches(entry: BodyEntryRecord, stored: ToolBodyManifest, total: number): boolean {
  const manifest = sealedManifest(entry)
  return (
    manifest !== null &&
    manifest.digest === stored.digest &&
    manifest.bytes === stored.bytes &&
    manifest.bytes === total
  )
}

function decodeUtf8(bytes: Uint8Array): Outcome<string, ToolFailure> {
  try {
    return succeed(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes))
  } catch {
    return unavailable('sealed body is not valid UTF-8')
  }
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

  const missed = async (
    input: BodyReadInput<P>,
    body: ToolOffloadedBody,
    now: ToolInstant,
  ): Promise<Outcome<never, ToolFailure>> => {
    const again = await ports.load(input)
    if ('failure' in again) return again
    const entry = again.ok.bodies.get(input.bodyId)
    const gone =
      entry === undefined || entry.state.kind === 'reclaimed' || entry.state.kind === 'orphaned'
    return gone || Date.parse(body.retention.expiresAt) <= Date.parse(now) + skew
      ? expired()
      : unavailable('integrity: a linked body before its expiry has no bytes in the store')
  }

  const storedRange = async (
    bodies: NonNullable<ToolLedgerPorts<P>['bodies']>,
    input: BodyReadInput<P>,
    located: Located,
    at: Position,
  ): Promise<Outcome<Extract<Range, { kind: 'bytes' }>, ToolFailure>> => {
    const ref: ToolBodyRef = { tenant: input.tenant, call: input.call, body: input.bodyId }
    const budget = Math.min(input.maxBytes, ports.configuration.maxPageBytes)
    const range = await readRange(bodies.store, ref, at, budget)
    if ('failure' in range) return range
    if (range.ok.kind === 'absent') return missed(input, located.body, bodies.clock.now())
    if (!manifestMatches(located.entry, range.ok.manifest, Number(located.body.bodyBytes)))
      return unavailable('integrity: the stored manifest differs from the ledger entry')
    if (!beforeExpiry(bodies.clock.now(), located.body)) return expired()
    const current = await ports.authorize(input)
    return 'failure' in current ? current : succeed(range.ok)
  }

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
    const range = await storedRange(bodies, input, located.ok, at.ok)
    if ('failure' in range) return range
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

  const pageFields = (input: BodyReadInput<P>, page: Page, consumed: number) => ({
    result: input.result,
    bodyId: input.bodyId,
    bodyBytes: page.located.body.bodyBytes,
    expiresAt: page.located.body.retention.expiresAt,
    position: String(page.at.position),
    next: next(input, 'text-utf8-v1', page, consumed),
  })

  const textConsumed = (page: Page): Outcome<number, ToolFailure> => {
    const first = page.bytes[0]
    if (page.at.position > 0 && first !== undefined && (first & 0xc0) === 0x80)
      return fail({ kind: 'invalid-cursor', reason: 'not-a-character-boundary' })
    const atEnd = page.at.position + page.bytes.length >= page.total
    const consumed = atEnd ? page.bytes.length : characterPrefix(page.bytes)
    return consumed === 0 && page.total > 0
      ? invalid('maxBytes', 'first-character-does-not-fit')
      : succeed(consumed)
  }

  const textPage = (input: BodyReadInput<P>, page: Page): Outcome<ToolBodyPage, ToolFailure> => {
    const representation = page.located.body.representation
    if (representation.kind !== 'text' && representation.kind !== 'json-document')
      return invalid('body', 'text or JSON document body required')
    const taken = textConsumed(page)
    if ('failure' in taken) return taken
    const consumed = taken.ok
    const text = decodeUtf8(page.bytes.subarray(0, consumed))
    if ('failure' in text) return text
    const common = { ...pageFields(input, page, consumed), text: text.ok }
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
    const representation = page.located.body.representation
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
      ...pageFields(input, page, consumed),
      kind: 'json-lines',
      representation,
      records,
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
