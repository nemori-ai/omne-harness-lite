// The independent execution scope (G2, P11): a local output ledger, one logical wait at a time,
// cancellation through the given signal and the return barrier. It creates no ToolCall and
// promises no durability; a success receipt is `local`.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import type {
  IndependentToolScopeInput,
  ToolAskRequest,
  ToolAuthorLimits,
  ToolDecision,
  ToolEmitReceipt,
  ToolExecutionContext,
  ToolExecutionScope,
  ToolPrimitiveFailure,
  ToolProcessReceiver,
  ToolProcessUpdate,
  ToolResourceReply,
  ToolResourceWaitRequest,
  ToolWaiter,
} from '@omne-harness/tool-contract'
import { fixJsonTree } from './json-tree.ts'
import { isPositiveSafeInteger, judgeAuthorLimits, slot, type Rejection } from './limits.ts'

type Failure = ToolPrimitiveFailure
type Result<T> = Outcome<T, Failure>
type WaitRequest<A> = ToolAskRequest<A> | ToolResourceWaitRequest<A>
type AnyWaitRequest = WaitRequest<unknown>
type WaitKind = AnyWaitRequest['kind']
type Expiry = 'forbidden' | 'supported'

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u

export function describeThrown(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return String(error)
  } catch {
    return 'a thrown value that cannot be printed'
  }
}

function cancellation(): Failure {
  return named('cancelled', 'the execution was cancelled')
}

function named(kind: Exclude<Failure, { operation: string }>['kind'], reason: string): Failure {
  return Object.freeze({ kind, reason })
}

function invalid(reason: string): Outcome<never, Failure> {
  return fail(named('invalid', reason))
}

function unknownOperation(operation: string, reason: string): Failure {
  return Object.freeze({ kind: 'unknown', operation, reason })
}

function unavailableOperation(operation: string, reason: string): Failure {
  return Object.freeze({ kind: 'unavailable', operation, reason })
}

/** Reads an outcome that a provider returned. A value of another shape is a provider defect. */
/** Reads what a receiver or provider settled with: an Outcome, or a throw that becomes unknown. */
function readExternal(
  operation: string,
): [(value: unknown) => Result<unknown>, (error: unknown) => Result<unknown>] {
  return [
    value => readOutcome(value, operation),
    error => fail(unknownOperation(operation, describeThrown(error))),
  ]
}

function readOutcome(value: unknown, operation: string): Result<unknown> {
  if (typeof value === 'object' && value !== null) {
    if ('ok' in value) return succeed(value.ok)
    if ('failure' in value) {
      const failure = value.failure
      if (
        typeof failure === 'object' &&
        failure !== null &&
        'kind' in failure &&
        'reason' in failure
      )
        return fail(failure as Failure)
    }
  }
  return fail(unknownOperation(operation, 'the provider returned a value that is not an Outcome'))
}

type Deferred<T> = Readonly<{ promise: Promise<T>; resolve: (value: T) => void }>

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const present = Reflect.ownKeys(value)
  return (
    present.length === keys.length &&
    present.every(key => typeof key === 'string' && keys.includes(key))
  )
}

// ---------------------------------------------------------------------------------------------
// Process updates
// ---------------------------------------------------------------------------------------------

type JudgedUpdate = Readonly<{
  update: ToolProcessUpdate
  /** Bytes the update adds to the accumulated state of its block while the block is open. */
  accumulates: number
}>

type UpdateHeader = Readonly<{ index: string; close: boolean }>

function readUpdateHeader(input: object): Outcome<UpdateHeader, Failure> {
  const index = slot(input, 'index')
  if (index.kind !== 'value' || typeof index.value !== 'string' || index.value.length === 0)
    return invalid('index must be a non-empty string')
  const close = slot(input, 'close')
  if (close.kind !== 'value' || typeof close.value !== 'boolean')
    return invalid('close must be a boolean')
  return succeed({ index: index.value, close: close.value })
}

function judgeAppendText(input: object, header: UpdateHeader): Outcome<JudgedUpdate, Failure> {
  if (!hasExactKeys(input, ['kind', 'index', 'text', 'close']))
    return invalid('append-text has other fields')
  const text = slot(input, 'text')
  if (text.kind !== 'value' || typeof text.value !== 'string')
    return invalid('text must be a string')
  return succeed({
    update: Object.freeze({ kind: 'append-text', ...header, text: text.value }),
    accumulates: Buffer.byteLength(text.value),
  })
}

function judgeReplace(input: object, header: UpdateHeader): Outcome<JudgedUpdate, Failure> {
  if (!hasExactKeys(input, ['kind', 'index', 'content', 'close']))
    return invalid('replace has other fields')
  const content = slot(input, 'content')
  if (content.kind !== 'value') return invalid('content is missing')
  const judged = judgeContentBlock(content.value)
  if ('rejected' in judged) return invalid(`content is not a content block: ${judged.rejected}`)
  // Process output is for people (P11). A block hidden from people has no reader here.
  if (!judged.ok.visibility.toHuman) return invalid('content must be visible to humans')
  const block: ContentBlock = Object.freeze({
    ...judged.ok,
    visibility: Object.freeze(judged.ok.visibility),
  })
  return succeed({
    update: Object.freeze({ kind: 'replace', ...header, content: block }),
    accumulates: Buffer.byteLength(JSON.stringify(block)),
  })
}

function judgeUpdate(input: unknown): Outcome<JudgedUpdate, Failure> {
  if (typeof input !== 'object' || input === null) return invalid('an update must be an object')
  const header = readUpdateHeader(input)
  if ('failure' in header) return header
  const kind = slot(input, 'kind')
  if (kind.kind !== 'value') return invalid('kind is missing')
  if (kind.value === 'append-text') return judgeAppendText(input, header.ok)
  if (kind.value === 'replace') return judgeReplace(input, header.ok)
  return invalid('kind must be append-text or replace')
}

// ---------------------------------------------------------------------------------------------
// Wait requests
// ---------------------------------------------------------------------------------------------

type JudgedWait = Readonly<{
  request: AnyWaitRequest
  /** The key, the contract identity, the deadline and the canonical request text. */
  digest: string
  /** The record capacity reserved in the wait history (P11): declared request and response limits. */
  reserve: number
  /** The declared response limit; a larger reply is not a valid reply (P11). */
  responseMax: number
}>

type WaitHeader = Readonly<{ kind: WaitKind; key: string; fields: object }>

type JudgedContract = Readonly<{
  /** The contract object as given; it is kept, not copied, because its handle is opaque here. */
  value: object
  adoption: string
  expiry: Expiry
  requestMax: number
  responseMax: number
}>

/** The closed field set of each wait kind. An Ask has no deadline (P11). */
const WAIT_KEYS: Readonly<Record<WaitKind, readonly string[]>> = {
  ask: ['kind', 'key', 'contract', 'request'],
  resource: ['kind', 'key', 'contract', 'request', 'deadline'],
}

function isWaitKind(value: unknown): value is WaitKind {
  return value === 'ask' || value === 'resource'
}

function readWaitHeader(input: unknown): Outcome<WaitHeader, Failure> {
  if (typeof input !== 'object' || input === null)
    return invalid('a wait request must be an object')
  const kind = slot(input, 'kind')
  if (kind.kind !== 'value' || !isWaitKind(kind.value))
    return invalid('kind must be ask or resource')
  if (!hasExactKeys(input, WAIT_KEYS[kind.value])) return invalid(`${kind.value} has other fields`)
  const key = slot(input, 'key')
  if (key.kind !== 'value' || typeof key.value !== 'string' || key.value.length === 0)
    return invalid('key must be a non-empty string')
  return succeed({ kind: kind.value, key: key.value, fields: input })
}

function readAdoption(contract: object): string | null {
  const adoption = slot(contract, 'adoption')
  if (adoption.kind !== 'value' || typeof adoption.value !== 'object' || adoption.value === null)
    return null
  const parts: string[] = []
  for (const key of ['owner', 'name', 'revision', 'digest']) {
    const read = slot(adoption.value, key)
    if (read.kind !== 'value' || typeof read.value !== 'string') return null
    parts.push(read.value)
  }
  return JSON.stringify(parts)
}

function readExpiry(contract: object): Expiry | null {
  const expiry = slot(contract, 'expiry')
  if (expiry.kind !== 'value') return null
  return expiry.value === 'forbidden' || expiry.value === 'supported' ? expiry.value : null
}

function readDeclaredMaxBytes(contract: object, key: 'request' | 'response'): number | null {
  const schema = slot(contract, key)
  if (schema.kind !== 'value' || typeof schema.value !== 'object' || schema.value === null)
    return null
  const maxBytes = slot(schema.value, 'maxBytes')
  return maxBytes.kind === 'value' && isPositiveSafeInteger(maxBytes.value) ? maxBytes.value : null
}

/**
 * The shape of a wait contract. The contract package keeps its handle brand private, so only the
 * fields the scope consumes are checked: kind, expiry, adoption and the two declared limits.
 */
function judgeWaitContract(value: unknown, kind: WaitKind): Outcome<JudgedContract, Failure> {
  if (typeof value !== 'object' || value === null)
    return invalid('contract must be a wait contract')
  const contractKind = slot(value, 'kind')
  if (contractKind.kind !== 'value' || contractKind.value !== kind)
    return invalid('contract kind must match the request kind')
  const expiry = readExpiry(value)
  if (expiry === null) return invalid('contract expiry must be forbidden or supported')
  const adoption = readAdoption(value)
  if (adoption === null)
    return invalid('contract adoption must name owner, name, revision and digest')
  const requestMax = readDeclaredMaxBytes(value, 'request')
  const responseMax = readDeclaredMaxBytes(value, 'response')
  if (requestMax === null || responseMax === null)
    return fail(named('unsupported', 'the contract declares no finite request and response limits'))
  return succeed({ value, adoption, expiry, requestMax, responseMax })
}

/** The deadline of a resource wait: null, or an ISO 8601 instant when the contract supports expiry. */
function judgeDeadline(input: object, expiry: Expiry): Outcome<string | null, Failure> {
  const read = slot(input, 'deadline')
  if (read.kind !== 'value' || (read.value !== null && typeof read.value !== 'string'))
    return invalid('deadline must be a string or null')
  if (read.value === null) return succeed(null)
  if (expiry !== 'supported') return invalid('the contract does not support a deadline')
  if (!ISO_INSTANT.test(read.value) || Number.isNaN(Date.parse(read.value)))
    return invalid('deadline must be an ISO 8601 instant')
  return succeed(read.value)
}

type RequestParts = Readonly<{
  header: WaitHeader
  contract: object
  request: ToolAskRequest['request']
  deadline: string | null
}>

/** A frozen copy of the request. The contract object was judged by shape and is kept as given. */
function copyWaitRequest({ header, contract, request, deadline }: RequestParts): AnyWaitRequest {
  const base = { key: header.key, request }
  return header.kind === 'ask'
    ? Object.freeze({ kind: 'ask', ...base, contract: contract as ToolAskRequest['contract'] })
    : Object.freeze({
        kind: 'resource',
        ...base,
        contract: contract as ToolResourceWaitRequest['contract'],
        deadline,
      })
}

function judgeWait(input: unknown): Outcome<JudgedWait, Failure> {
  const header = readWaitHeader(input)
  if ('failure' in header) return header
  const { fields, kind } = header.ok
  const contractSlot = slot(fields, 'contract')
  const contract = judgeWaitContract(
    contractSlot.kind === 'value' ? contractSlot.value : undefined,
    kind,
  )
  if ('failure' in contract) return contract
  const request = slot(fields, 'request')
  if (request.kind !== 'value') return invalid('request is missing')
  const tree = fixJsonTree(request.value, contract.ok.requestMax)
  if ('failure' in tree) return invalid(`request: ${tree.failure.reason}: ${tree.failure.detail}`)
  const deadline = kind === 'resource' ? judgeDeadline(fields, contract.ok.expiry) : succeed(null)
  if ('failure' in deadline) return deadline
  const { adoption, requestMax, responseMax } = contract.ok
  return succeed({
    request: copyWaitRequest({
      header: header.ok,
      contract: contract.ok.value,
      request: tree.ok.value,
      deadline: deadline.ok,
    }),
    digest: JSON.stringify([kind, adoption, deadline.ok, tree.ok.text]),
    reserve: requestMax + responseMax + Buffer.byteLength(header.ok.key),
    responseMax,
  })
}

// ---------------------------------------------------------------------------------------------
// Provider replies
// ---------------------------------------------------------------------------------------------

/**
 * The UTF-8 size of the JSON text of a reply's `value`: the response schema governs that value
 * (P12), and `no-answer`, `declined` and `expired` carry none. `null` when the value has no JSON
 * text.
 */
function replyValueBytes(reply: unknown): number | null {
  if (typeof reply !== 'object' || reply === null) return 0
  const value = slot(reply, 'value')
  if (value.kind !== 'value') return 0
  try {
    const text = JSON.stringify(value.value)
    return text === undefined ? null : Buffer.byteLength(text)
  } catch {
    return null
  }
}

/** A reply whose value exceeds the declared response limit is not a valid reply (P11). */
function judgeReply(reply: unknown, responseMax: number, operation: string): Result<unknown> {
  const bytes = replyValueBytes(reply)
  if (bytes === null)
    return fail(unavailableOperation(operation, 'the response value has no JSON text'))
  if (bytes > responseMax)
    return fail(
      unavailableOperation(operation, `the response needs ${bytes} of ${responseMax} bytes`),
    )
  return succeed(reply)
}

// ---------------------------------------------------------------------------------------------
// The execution ledger
// ---------------------------------------------------------------------------------------------

type Block = { mode: ToolProcessUpdate['kind']; closed: boolean; bytes: number }

type Admitted = Readonly<{ update: ToolProcessUpdate; sequence: number; bytes: number }>

type WaitEntry = {
  readonly key: string
  readonly digest: string
  readonly request: AnyWaitRequest
  readonly responseMax: number
  /** The outcome once the wait settled, shared by every re-entry with the same key and input. */
  outcome: Result<unknown> | null
  /** The in-flight open, when the wait is reserved or forwarded and not yet settled. */
  pending: Promise<Result<unknown>> | null
  /** Settles the wait from outside: cancellation or a finish while it is open. */
  readonly interrupt: Deferred<Outcome<never, Failure>>
}

type Exit = 'returned' | 'failed'

/** One execution: its state, output ledger, wait history and settlement. */
class Execution {
  readonly limits: ToolAuthorLimits
  readonly signal: AbortSignal
  readonly receiver: ToolProcessReceiver | null
  readonly waits: ToolWaiter | null
  /** The first closure. A later closure of another kind never replaces it. */
  closure: Exit | 'cancelled' | null = null
  cancelled = false
  readonly aborted: Deferred<void> = deferred()
  readonly onAbort: () => void
  sequence = 0
  pendingBytes = 0
  pendingItems = 0
  readonly blocks = new Map<string, Block>()
  openBytes = 0
  /** The delivery chain. Every accepted emit reaches the receiver after the one before it. */
  tail: Promise<void> = Promise.resolve()
  /** The first accepted output that the receiver did not take. The barrier never holds past it. */
  fault: Readonly<{ sequence: number; failure: Failure }> | null = null
  readonly history = new Map<string, WaitEntry>()
  historyBytes = 0
  /** The one unfinished logical wait, kept across a failed open until it settles (P11). */
  active: WaitEntry | null = null
  settlement: Readonly<{ exit: Exit; promise: Promise<Result<void>> }> | null = null

  constructor(
    limits: ToolAuthorLimits,
    signal: AbortSignal,
    receiver: ToolProcessReceiver | null,
    waits: ToolWaiter | null,
  ) {
    this.limits = limits
    this.signal = signal
    this.receiver = receiver
    this.waits = waits
    this.onAbort = () => this.cancel()
    if (signal.aborted) this.cancel()
    else signal.addEventListener('abort', this.onAbort, { once: true })
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.closure ??= 'cancelled'
    this.release()
    this.aborted.resolve()
    this.active?.interrupt.resolve(fail(cancellation()))
  }

  /** Drops the abort listener once the execution can no longer change: cancelled or finished. */
  release(): void {
    this.signal.removeEventListener('abort', this.onAbort)
  }

  /** Why a new primitive is refused now, or null while the execution accepts. */
  refusal(): Failure | null {
    if (this.cancelled) return cancellation()
    if (this.closure !== null) return named('closed', `the execution ${this.closure}`)
    return null
  }

  async emit(input: unknown): Promise<Result<ToolEmitReceipt>> {
    const refusal = this.refusal()
    if (refusal !== null) return fail(refusal)
    if (this.receiver === null)
      return fail(named('unsupported', 'the scope has no process receiver'))
    const judged = judgeUpdate(input)
    if ('failure' in judged) return judged
    const admitted = this.admit(judged.ok)
    if ('failure' in admitted) return admitted
    const { update, sequence, bytes } = admitted.ok
    const outcome = await this.deliver(this.receiver, sequence, update)
    this.pendingBytes -= bytes
    this.pendingItems -= 1
    if ('failure' in outcome) {
      this.fault ??= { sequence, failure: barrierFault(outcome.failure, `emit:${sequence}`) }
      return outcome
    }
    return succeed(Object.freeze({ kind: 'local', sequence: String(sequence) }))
  }

  /** The accumulated bytes of the update's block, or why the update cannot enter the block. */
  enterBlock(update: ToolProcessUpdate): Outcome<number, Failure> {
    const block = this.blocks.get(update.index)
    if (block === undefined) return succeed(0)
    if (block.closed) return invalid(`block ${update.index} is closed`)
    if (block.mode !== update.kind) return invalid(`block ${update.index} is in ${block.mode} mode`)
    return succeed(block.bytes)
  }

  /** Takes the slot: the sequence, the pending budget and the block state are fixed before any await. */
  admit({ update, accumulates }: JudgedUpdate): Outcome<Admitted, Failure> {
    const entered = this.enterBlock(update)
    if ('failure' in entered) return entered
    const previous = entered.ok
    const sequence = this.sequence + 1
    const bytes = Buffer.byteLength(JSON.stringify({ sequence: String(sequence), update }))
    const accumulated = update.kind === 'append-text' ? previous + accumulates : accumulates
    const { authorBufferBytes, authorBufferItems } = this.limits
    if (bytes > authorBufferBytes || accumulated > authorBufferBytes)
      return fail(
        named(
          'too-large',
          `the update needs ${Math.max(bytes, accumulated)} of ${authorBufferBytes} bytes`,
        ),
      )
    if (this.pendingItems + 1 > authorBufferItems)
      return fail(named('capacity', `${this.pendingItems} outputs await confirmation`))
    const kept = update.close ? 0 : accumulated
    const openAfter = this.openBytes - previous + kept
    if (this.pendingBytes + bytes > authorBufferBytes || openAfter > authorBufferBytes)
      return fail(named('capacity', `${this.pendingBytes} output bytes await confirmation`))
    this.sequence = sequence
    this.pendingBytes += bytes
    this.pendingItems += 1
    this.openBytes = openAfter
    this.blocks.set(update.index, { mode: update.kind, closed: update.close, bytes: kept })
    return succeed({ update, sequence, bytes })
  }

  /** Appends the update to the delivery chain and gives the receiver's outcome for it. */
  deliver(
    receiver: ToolProcessReceiver,
    sequence: number,
    update: ToolProcessUpdate,
  ): Promise<Result<unknown>> {
    const operation = `emit:${sequence}`
    const delivery = this.tail
      .then(() => receiver.receive({ sequence: String(sequence), update }))
      .then(...readExternal(operation))
    this.tail = delivery.then(() => undefined)
    return delivery
  }

  wait<A>(input: WaitRequest<A>): Promise<Result<ToolDecision<A> | ToolResourceReply<A>>> {
    const refusal = this.refusal()
    if (refusal !== null) return Promise.resolve(fail(refusal))
    if (this.waits === null)
      return Promise.resolve(fail(named('unsupported', 'the scope has no wait provider')))
    const judged = judgeWait(input)
    if ('failure' in judged) return Promise.resolve(judged)
    const known = this.history.get(judged.ok.request.key)
    const entry = known === undefined ? this.reserve(judged.ok) : this.recall(known, judged.ok)
    if ('failure' in entry) return Promise.resolve(entry)
    // The answer came from the provider for this same request, so it has the type the author asked for.
    return this.open(entry.ok, this.waits) as Promise<
      Result<ToolDecision<A> | ToolResourceReply<A>>
    >
  }

  /** The same key recalls its record only with the same input (P11). */
  recall(entry: WaitEntry, judged: JudgedWait): Outcome<WaitEntry, Failure> {
    if (entry.digest !== judged.digest)
      return fail(named('conflict', `key ${entry.key} was opened with another input`))
    return succeed(entry)
  }

  /** Reserves the history record of a new key, or says why no new key can open now. */
  reserve(judged: JudgedWait): Outcome<WaitEntry, Failure> {
    const { request, digest, reserve, responseMax } = judged
    if (this.active !== null) return fail(named('busy', `wait ${this.active.key} is still open`))
    const { authorWaitHistoryBytes, authorWaitHistoryItems } = this.limits
    if (reserve > authorWaitHistoryBytes)
      return fail(
        named('too-large', `the record needs ${reserve} of ${authorWaitHistoryBytes} bytes`),
      )
    if (
      this.history.size + 1 > authorWaitHistoryItems ||
      this.historyBytes + reserve > authorWaitHistoryBytes
    )
      return fail(named('capacity', 'the wait history is full'))
    const entry: WaitEntry = {
      key: request.key,
      digest,
      request,
      responseMax,
      outcome: null,
      pending: null,
      interrupt: deferred(),
    }
    this.history.set(request.key, entry)
    this.historyBytes += reserve
    return succeed(entry)
  }

  /** Shares a settled or in-flight wait, or opens a reserved one. */
  open(entry: WaitEntry, waits: ToolWaiter): Promise<Result<unknown>> {
    if (entry.outcome !== null) return Promise.resolve(entry.outcome)
    if (entry.pending !== null) return entry.pending
    this.active = entry
    entry.pending = this.forward(entry, waits)
    return entry.pending
  }

  async forward(entry: WaitEntry, waits: ToolWaiter): Promise<Result<unknown>> {
    const barrier = await this.barrier(entry.interrupt.promise)
    if ('failure' in barrier) {
      if (barrier.failure.kind === 'cancelled' || barrier.failure.kind === 'closed')
        return this.settle(entry, barrier)
      // The position stays reserved and active: the same key and input retries it, another key
      // is busy until it settles (P11).
      entry.pending = null
      return barrier
    }
    const refusal = this.refusal()
    if (refusal !== null) return this.settle(entry, fail(refusal))
    const operation = `wait:${entry.key}`
    const external = Promise.resolve()
      .then((): Promise<unknown> =>
        entry.request.kind === 'ask' ? waits.wait(entry.request) : waits.wait(entry.request),
      )
      .then(...readExternal(operation))
    const raced = await Promise.race([external, entry.interrupt.promise])
    // An abort that lands between the answer and this continuation still wins: the executor
    // confirmed the cancellation before the hand-over (P11).
    if (this.cancelled) return this.settle(entry, fail(cancellation()))
    // A finish that lands in the same window found this wait active, so the wait ends closed.
    if (this.closure !== null)
      return this.settle(
        entry,
        fail(named('closed', `the execution ${this.closure} with this wait open`)),
      )
    if ('failure' in raced) return this.settle(entry, raced)
    return this.settle(entry, judgeReply(raced.ok, entry.responseMax, operation))
  }

  settle(entry: WaitEntry, outcome: Result<unknown>): Result<unknown> {
    entry.outcome = outcome
    entry.pending = null
    if (this.active === entry) this.active = null
    return outcome
  }

  /** Holds until every output accepted before now reached the receiver, or an interrupt arrives. */
  async barrier(interrupt: Promise<Outcome<never, Failure>>): Promise<Result<void>> {
    const tail = this.tail
    const sequence = this.sequence
    const outcome = await Promise.race([tail.then(() => null), interrupt])
    if (outcome !== null) return outcome
    // An abort that lands between the tail settling and this continuation still wins.
    if (this.cancelled) return fail(cancellation())
    if (this.fault !== null && this.fault.sequence <= sequence) return fail(this.fault.failure)
    return succeed(undefined)
  }

  finish(exit: Exit): Promise<Result<void>> {
    if (this.settlement !== null) {
      if (this.settlement.exit === exit) return this.settlement.promise
      return Promise.resolve(
        fail(named('conflict', `finish was already called with ${this.settlement.exit}`)),
      )
    }
    this.closure ??= exit
    const promise = exit === 'failed' ? Promise.resolve(this.closeFailed()) : this.closeReturned()
    this.settlement = { exit, promise }
    // The signal can still cancel a returned finish while output is stuck; after that, nothing.
    const release = () => this.release()
    void promise.then(release, release)
    return promise
  }

  closeFailed(): Result<void> {
    // A failed exit does not wait on stuck output; the receiver keeps what it accepted.
    this.active?.interrupt.resolve(
      fail(named('closed', 'the execution failed with this wait open')),
    )
    return succeed(undefined)
  }

  async closeReturned(): Promise<Result<void>> {
    const active = this.active
    if (active !== null) {
      const pending = active.pending
      active.interrupt.resolve(fail(named('closed', 'the author returned with this wait open')))
      await pending
      if (this.cancelled) return fail(cancellation())
      return invalid(`the author returned with wait ${active.key} open`)
    }
    // The barrier answers cancelled when the signal aborted before or while it held (P11).
    return this.barrier(this.aborted.promise.then(() => fail(cancellation())))
  }
}

function barrierFault(failure: Failure, operation: string): Failure {
  if (failure.kind === 'unavailable' || failure.kind === 'unknown') return failure
  return unavailableOperation(operation, `${failure.kind}: ${failure.reason}`)
}

// ---------------------------------------------------------------------------------------------
// The author-facing context and the scope
// ---------------------------------------------------------------------------------------------

class IndependentContext implements ToolExecutionContext {
  readonly mode = 'independent' as const
  readonly signal: AbortSignal
  readonly #execution: Execution

  constructor(execution: Execution) {
    this.signal = execution.signal
    this.#execution = execution
  }

  emit(update: ToolProcessUpdate): Promise<Result<ToolEmitReceipt>> {
    return this.#execution.emit(update)
  }

  wait<A>(request: ToolAskRequest<A>): Promise<Result<ToolDecision<A>>>
  wait<A>(request: ToolResourceWaitRequest<A>): Promise<Result<ToolResourceReply<A>>>
  wait<A>(request: WaitRequest<A>): Promise<Result<ToolDecision<A> | ToolResourceReply<A>>> {
    return this.#execution.wait(request)
  }
}

class IndependentScope implements ToolExecutionScope {
  readonly context: ToolExecutionContext
  readonly limits: ToolAuthorLimits
  readonly #execution: Execution

  constructor(execution: Execution) {
    this.context = new IndependentContext(execution)
    this.limits = execution.limits
    this.#execution = execution
  }

  finish(exit: Exit): Promise<Result<void>> {
    return this.#execution.finish(exit)
  }
}

function isCapability(value: unknown, method: string): boolean {
  if (value === null) return true
  if (typeof value !== 'object' && typeof value !== 'function') return false
  return typeof Reflect.get(value, method) === 'function'
}

/**
 * Builds an independent execution scope (G2). Every limit must be a positive safe integer, the
 * signal must be an AbortSignal, and each capability is null or an object with the port method.
 */
export function createIndependentToolScope(
  input: IndependentToolScopeInput,
): Outcome<ToolExecutionScope, Rejection> {
  if (typeof input !== 'object' || input === null) return fail({ field: 'input', reason: 'type' })
  const read = slot(input, 'limits')
  const limits = judgeAuthorLimits(read.kind === 'value' ? read.value : undefined, 'limits')
  if ('failure' in limits) return limits
  const { signal, process, waits } = input
  if (!(signal instanceof AbortSignal)) return fail({ field: 'signal', reason: 'type' })
  if (!isCapability(process, 'receive')) return fail({ field: 'process', reason: 'type' })
  if (!isCapability(waits, 'wait')) return fail({ field: 'waits', reason: 'type' })
  return succeed(new IndependentScope(new Execution(limits.ok, signal, process, waits)))
}
