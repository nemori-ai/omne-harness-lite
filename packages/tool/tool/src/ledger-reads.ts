// The read projections of one domain snapshot: lookup, operation resolution, result pages and the
// call account (P01, P08, P09). They project `not-accepted` or `not-committed` only from a
// complete snapshot; the ledger answers such a negative only after its exclusion fence commits,
// and answers `unavailable` when the read itself failed.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  OperationResolution,
  ResultPage,
  ToolFailure,
  ToolLookup,
  ToolOperationId,
  ToolRecovery,
  ToolResultVersion,
} from '@omne-harness/tool-contract'
import { invalid, tenantKey } from './boundary.ts'
import { mintEvidence } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { CallAccount, ResultRecord } from './ledger-store.ts'

/**
 * The current call state located by `admission`.
 * An absent admission in a complete snapshot is not accepted.
 */
export function lookupCall<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  admission: ToolOperationId,
): ToolLookup {
  const call = snapshot.call
  if (call !== null && call.admission === admission) return { kind: 'found', state: call.state }
  return { kind: 'not-accepted', operation: admission }
}

/** The resolution of one operation. The receipt evidence points at the operation record. */
export function resolveOperation<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  operation: ToolOperationId,
): OperationResolution {
  const record = snapshot.operations.get(operation)
  if (record === undefined) return { kind: 'not-committed' }
  const place = { tenant: record.tenant, call: record.call, operation: record.operation }
  return {
    kind: 'committed',
    revision: record.revision,
    receipt: mintEvidence('operation', place, record.revision, record.receipt),
  }
}

/** The projection a cursor binds. Only the complete result projection exists today. */
const PROJECTION = 'full'

type Cursor = Readonly<{
  tenant: string
  call: string
  result: string
  projection: string
  block: number
}>

function cursorText(cursor: Cursor): string {
  return JSON.stringify(cursor)
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) return false
  const block: unknown = Reflect.get(value, 'block')
  return (
    ['tenant', 'call', 'result', 'projection'].every(
      key => typeof Reflect.get(value, key) === 'string',
    ) &&
    typeof block === 'number' &&
    Number.isSafeInteger(block) &&
    block >= 0
  )
}

/** Reads a cursor and checks that it was issued for this result (P08: no silent version change). */
function readCursor(after: string, expected: Cursor): Outcome<number, ToolFailure> {
  let parsed: unknown
  try {
    parsed = JSON.parse(after)
  } catch {
    return fail({ kind: 'invalid-cursor', reason: 'not-a-cursor' })
  }
  if (!isCursor(parsed)) return fail({ kind: 'invalid-cursor', reason: 'not-a-cursor' })
  const bound =
    parsed.tenant === expected.tenant &&
    parsed.call === expected.call &&
    parsed.result === expected.result &&
    parsed.projection === expected.projection
  if (!bound) return fail({ kind: 'invalid-cursor', reason: 'another-result' })
  return succeed(parsed.block)
}

function blockBytes(block: ContentBlock): number {
  return Buffer.byteLength(JSON.stringify(block))
}

/**
 * The blocks from `start` that fit in `pageBytes`, at least one. A first block larger than the
 * page cannot be split (P08) and needs an offloader, which this increment does not have.
 */
function pageBlocks<B extends ContentBlock>(
  content: readonly B[],
  start: number,
  pageBytes: number,
  adoption: Adoption,
): Outcome<Readonly<{ blocks: readonly B[]; end: number }>, ToolFailure> {
  let end = start
  let used = 0
  while (end < content.length) {
    const block = content[end]
    if (block === undefined) break
    const bytes = blockBytes(block)
    if (used + bytes > pageBytes) {
      if (end === start) return unsupportedPage(adoption, end, bytes, pageBytes)
      break
    }
    used += bytes
    end += 1
  }
  return succeed({ blocks: content.slice(start, end), end })
}

function unsupportedPage(
  adoption: Adoption,
  index: number,
  bytes: number,
  pageBytes: number,
): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unsupported',
    adoption,
    reason: `content block ${index} is ${bytes} bytes, over the ${pageBytes}-byte page, and offloading is not implemented`,
  })
}

export type PageInput = Readonly<{
  result: ToolResultVersion
  after: string | null
  pageBytes: number
  adoption: Adoption
}>

/** The result record a read names, or why it cannot be read: not settled, or unknown version. */
function resultRecord<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  version: ToolResultVersion,
): Outcome<ResultRecord<B>, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const record = snapshot.results.get(version)
  if (record !== undefined) return succeed(record)
  if (snapshot.call.state.phase !== 'settled') return fail({ kind: 'not-settled' })
  return invalid('result', 'unknown-version')
}

/**
 * One page of a result version (P08). Pages cut between whole content blocks; every page carries
 * the same data, original and attachments of the version; `next` binds tenant, call, version,
 * projection and the next block position.
 */
export function readResultPage<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  input: PageInput,
): Outcome<ResultPage<B>, ToolFailure> {
  const found = resultRecord(snapshot, input.result)
  if ('failure' in found) return found
  const record = found.ok
  const bound: Cursor = {
    tenant: tenantKey(record.tenant),
    call: record.call,
    result: record.result,
    projection: PROJECTION,
    block: 0,
  }
  const start = input.after === null ? succeed(0) : readCursor(input.after, bound)
  if ('failure' in start) return start
  // A cursor is issued only for a block that exists, so a cursor at or after the end is not one
  // of ours; a page is never empty (at least one block).
  if (input.after !== null && start.ok >= record.value.content.length)
    return fail({ kind: 'invalid-cursor', reason: 'past-the-end' })
  const page = pageBlocks(record.value.content, start.ok, input.pageBytes, input.adoption)
  if ('failure' in page) return page
  const next = page.ok.end < record.value.content.length ? { ...bound, block: page.ok.end } : null
  return succeed({
    result: record.result,
    terminal: record.terminal,
    effect: record.effect,
    actualTerminal: record.actual,
    relation: record.relation,
    delivery: record.delivery.delivery,
    source: record.source,
    value: { ...record.value, content: page.ok.blocks },
    next: next === null ? null : cursorText(next),
  })
}

/**
 * The complete recovery read of a call (P01 loadRecovery): what the call domain holds of its
 * way to a start, its tasks and its first result. Waits, controls, suspensions, raw outputs,
 * fact streams, program closure and scheduling are empty until their increments record them.
 */
export function readRecovery<B extends ContentBlock>(
  snapshot: Snapshot<B>,
): Outcome<ToolRecovery<B>, ToolFailure> {
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  const original = call.state.phase === 'settled' ? snapshot.results.get(call.state.result) : null
  return succeed({
    state: call.state,
    request: call.request,
    admission: call.admission,
    initiator: call.initiator,
    execution: call.execution,
    checkpoint: null,
    start: call.start,
    startRejection: call.startRejection,
    invocations: call.start === null ? [] : [call.start],
    controls: [],
    result: original === undefined || original === null ? null : original.value,
    unresolved: [],
    preparations: call.preparations,
    waits: [],
    suspensions: [],
    rawOutputs: [],
    tasks: snapshot.tasks,
    program: null,
    scheduling: null,
    streams: [],
  })
}

/** The current account of the call: the latest revision of the one recorded source. */
export function readAccount<B extends ContentBlock>(
  snapshot: Snapshot<B>,
): Outcome<CallAccount, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const latest = snapshot.accounts.at(-1)
  if (latest === undefined) return invalid('call', 'no-account')
  return succeed(latest.value)
}
