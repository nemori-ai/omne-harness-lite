import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CallOutput, Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import {
  OUTPUT_BODY_KEY,
  type ToolBodyChunk,
  type ToolBodyRef,
} from '@omne-harness/tool-contract/provider'
import { invalid, type CallInput } from './boundary.ts'
import type { BodyEntryRecord } from './ledger-body-records.ts'
import type { Snapshot } from './ledger-decider.ts'
import { lookupCall } from './ledger-reads.ts'
import type { ToolLedgerPorts } from './construction.ts'

type OutputInput<P> = CallInput<P> &
  Readonly<{ admission: ToolOperationId; after: string | null; maxBytes: number }>

const CHUNKS_PER_READ = 16
const DECIMAL = /^(0|[1-9][0-9]*)$/u
const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-reader', diagnostic })

/** The last output body the call began; a call that never wrote one has none. */
function outputEntry(snapshot: Snapshot): BodyEntryRecord | undefined {
  return [...snapshot.bodies.values()].filter(entry => entry.key === OUTPUT_BODY_KEY).at(-1)
}

async function keptChunks(
  store: NonNullable<ToolLedgerPorts<unknown>['bodies']>['store'],
  ref: ToolBodyRef,
): Promise<Outcome<readonly ToolBodyChunk[], ToolFailure>> {
  const chunks: ToolBodyChunk[] = []
  for (;;) {
    const answer = await store.readOpen(ref, { first: chunks.length, count: CHUNKS_PER_READ })
    if (answer.kind === 'unavailable') return unavailable(answer.diagnostic)
    if (answer.kind === 'absent') return succeed(chunks)
    chunks.push(...answer.chunks)
    if (answer.chunks.length < CHUNKS_PER_READ) return succeed(chunks)
  }
}

/** Moves a byte position back to the start of the UTF-8 character it falls in. */
function characterStart(bytes: Buffer, position: number): number {
  let at = Math.min(position, bytes.length)
  while (at > 0 && at < bytes.length && ((bytes[at] ?? 0) & 0xc0) === 0x80) at -= 1
  return at
}

/** Moves a byte position forward to the start of the next UTF-8 character. */
function characterNext(bytes: Buffer, position: number): number {
  let at = position
  while (at < bytes.length && ((bytes[at] ?? 0) & 0xc0) === 0x80) at += 1
  return at
}

function part(bytes: Buffer, after: string | null, maxBytes: number) {
  const total = bytes.length
  if (after === null) {
    const from = characterNext(bytes, Math.max(0, total - maxBytes))
    return { from, through: total, text: bytes.subarray(from, total).toString('utf8') }
  }
  const asked = Number(after)
  if (asked >= total) return { from: asked, through: asked, text: '' }
  const from = characterStart(bytes, asked)
  const through = characterStart(bytes, Math.min(total, from + maxBytes))
  return { from, through, text: bytes.subarray(from, through).toString('utf8') }
}

// Reads the output body up to the chunks the store keeps. A read writes nothing: the same position
// reads the same bytes, and the call's result, effect and account stay as they are.
export function createLedgerOutputReads<P>(
  ports: Readonly<{
    bodies: ToolLedgerPorts<P>['bodies'] | undefined
    authorize(input: CallInput<P>): Reply<void>
    load(input: CallInput<P>): Reply<Snapshot>
  }>,
): (input: OutputInput<P>) => Reply<CallOutput> {
  return async input => {
    const { after, maxBytes } = input
    if (after !== null && (typeof after !== 'string' || !DECIMAL.test(after)))
      return invalid('after', 'position')
    if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0)
      return invalid('maxBytes', 'range')
    const bodies = ports.bodies
    if (bodies === undefined) return unavailable('body store is not connected')
    const allowed = await ports.authorize(input)
    if ('failure' in allowed) return allowed
    const snapshot = await ports.load(input)
    if ('failure' in snapshot) return snapshot
    if (lookupCall(snapshot.ok, input.admission).kind !== 'found')
      return invalid('reference', 'the admission of the reference was not accepted')
    const entry = outputEntry(snapshot.ok)
    if (entry === undefined) return succeed({ kind: 'none' })
    if (entry.state.kind === 'orphaned' || entry.state.kind === 'reclaimed')
      return fail({ kind: 'not-found', target: 'body', reason: 'expired' })
    const ref: ToolBodyRef = { tenant: input.tenant, call: input.call, body: entry.bodyId }
    const chunks = await keptChunks(bodies.store, ref)
    if ('failure' in chunks) return chunks
    const read = part(Buffer.concat(chunks.ok.map(chunk => chunk.bytes)), after, maxBytes)
    const current = await ports.authorize(input)
    if ('failure' in current) return current
    const total = chunks.ok.reduce((sum, chunk) => sum + chunk.bytes.length, 0)
    return succeed({
      kind: entry.state.kind === 'opened' ? 'open' : 'sealed',
      from: String(read.from),
      through: String(read.through),
      total: String(total),
      text: read.text,
    })
  }
}
