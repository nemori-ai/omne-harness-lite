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

function unknownOperation(operation: string, reason: string): Failure {
  return Object.freeze({ kind: 'unknown', operation, reason })
}

/** Reads an outcome that a provider returned. A value of another shape is a provider defect. */
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

// ---------------------------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------------------------

type JudgedUpdate = Readonly<{
  update: ToolProcessUpdate
  /** Bytes the update adds to the accumulated state of its block while the block is open. */
  accumulates: number
}>

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const present = Reflect.ownKeys(value)
  return (
    present.length === keys.length &&
    present.every(key => typeof key === 'string' && keys.includes(key))
  )
}

function judgeUpdate(input: unknown): Outcome<JudgedUpdate, Failure> {
  const invalid = (reason: string) => fail(named('invalid', reason))
  if (typeof input !== 'object' || input === null) return invalid('an update must be an object')
  const kind = slot(input, 'kind')
  const index = slot(input, 'index')
  const close = slot(input, 'close')
  if (index.kind !== 'value' || typeof index.value !== 'string' || index.value.length === 0)
    return invalid('index must be a non-empty string')
  if (close.kind !== 'value' || typeof close.value !== 'boolean')
    return invalid('close must be a boolean')
  if (kind.kind !== 'value') return invalid('kind is missing')
  if (kind.value === 'append-text') {
    if (!hasExactKeys(input, ['kind', 'index', 'text', 'close']))
      return invalid('append-text has other fields')
    const text = slot(input, 'text')
    if (text.kind !== 'value' || typeof text.value !== 'string')
      return invalid('text must be a string')
    return succeed({
      update: Object.freeze({
        kind: 'append-text',
        index: index.value,
        text: text.value,
        close: close.value,
      }),
      accumulates: Buffer.byteLength(text.value),
    })
  }
  if (kind.value === 'replace') {
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
      update: Object.freeze({
        kind: 'replace',
        index: index.value,
        content: block,
        close: close.value,
      }),
      accumulates: Buffer.byteLength(JSON.stringify(block)),
    })
  }
  return invalid('kind must be append-text or replace')
}

type JudgedWait = Readonly<{
  request: AnyWaitRequest
  /** The key, the contract identity, the deadline and the canonical request text. */
  digest: string
  /** The record capacity reserved in the wait history (P11): declared request and response limits. */
  reserve: number
}>

function readAdoption(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const parts: string[] = []
  for (const key of ['owner', 'name', 'revision', 'digest']) {
    const read = slot(value, key)
    if (read.kind !== 'value' || typeof read.value !== 'string') return null
    parts.push(read.value)
  }
  return JSON.stringify(parts)
}

function readDeclaredMaxBytes(contract: object, key: 'request' | 'response'): number | null {
  const schema = slot(contract, key)
  if (schema.kind !== 'value' || typeof schema.value !== 'object' || schema.value === null)
    return null
  const maxBytes = slot(schema.value, 'maxBytes')
  return maxBytes.kind === 'value' && isPositiveSafeInteger(maxBytes.value) ? maxBytes.value : null
}

function judgeWait(input: unknown): Outcome<JudgedWait, Failure> {
  const invalid = (reason: string) => fail(named('invalid', reason))
  if (typeof input !== 'object' || input === null)
    return invalid('a wait request must be an object')
  const kind = slot(input, 'kind')
  if (kind.kind !== 'value' || (kind.value !== 'ask' && kind.value !== 'resource'))
    return invalid('kind must be ask or resource')
  const keys =
    kind.value === 'ask'
      ? ['kind', 'key', 'contract', 'request']
      : ['kind', 'key', 'contract', 'request', 'deadline']
  // An Ask has no deadline; an unknown field is rejected at the boundary (P11).
  if (!hasExactKeys(input, keys)) return invalid(`${kind.value} has other fields`)
  const key = slot(input, 'key')
  if (key.kind !== 'value' || typeof key.value !== 'string' || key.value.length === 0)
    return invalid('key must be a non-empty string')
  const contract = slot(input, 'contract')
  if (contract.kind !== 'value' || typeof contract.value !== 'object' || contract.value === null)
    return invalid('contract must be a wait contract')
  const contractKind = slot(contract.value, 'kind')
  if (contractKind.kind !== 'value' || contractKind.value !== kind.value)
    return invalid('contract kind must match the request kind')
  const expiry = slot(contract.value, 'expiry')
  if (expiry.kind !== 'value' || (expiry.value !== 'forbidden' && expiry.value !== 'supported'))
    return invalid('contract expiry must be forbidden or supported')
  const adoptionSlot = slot(contract.value, 'adoption')
  const adoption = readAdoption(adoptionSlot.kind === 'value' ? adoptionSlot.value : undefined)
  if (adoption === null)
    return invalid('contract adoption must name owner, name, revision and digest')
  const requestMax = readDeclaredMaxBytes(contract.value, 'request')
  const responseMax = readDeclaredMaxBytes(contract.value, 'response')
  if (requestMax === null || responseMax === null)
    return fail(named('unsupported', 'the contract declares no finite request and response limits'))
  const request = slot(input, 'request')
  if (request.kind !== 'value') return invalid('request is missing')
  const tree = fixJsonTree(request.value, requestMax)
  if ('failure' in tree) return invalid(`request: ${tree.failure.detail}`)
  let deadline: string | null = null
  if (kind.value === 'resource') {
    const read = slot(input, 'deadline')
    if (read.kind !== 'value' || (read.value !== null && typeof read.value !== 'string'))
      return invalid('deadline must be a string or null')
    if (read.value !== null) {
      if (expiry.value !== 'supported') return invalid('the contract does not support a deadline')
      if (!ISO_INSTANT.test(read.value) || Number.isNaN(Date.parse(read.value)))
        return invalid('deadline must be an ISO 8601 instant')
    }
    deadline = read.value
  }
  const base = { key: key.value, request: tree.ok.value }
  const copied: AnyWaitRequest =
    kind.value === 'ask'
      ? Object.freeze({
          kind: 'ask',
          ...base,
          contract: contract.value as ToolAskRequest['contract'],
        })
      : Object.freeze({
          kind: 'resource',
          ...base,
          contract: contract.value as ToolResourceWaitRequest['contract'],
          deadline,
        })
  return succeed({
    request: copied,
    digest: JSON.stringify([kind.value, adoption, deadline, tree.ok.text]),
    reserve: requestMax + responseMax + Buffer.byteLength(key.value),
  })
}

// ---------------------------------------------------------------------------------------------
// The execution ledger
// ---------------------------------------------------------------------------------------------

type Block = { mode: ToolProcessUpdate['kind']; closed: boolean; bytes: number }

type WaitEntry = {
  readonly key: string
  readonly digest: string
  readonly request: AnyWaitRequest
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
    if (signal.aborted) this.cancel()
    else signal.addEventListener('abort', () => this.cancel(), { once: true })
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.closure ??= 'cancelled'
    this.aborted.resolve()
    this.active?.interrupt.resolve(fail(cancellation()))
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
    const { update, accumulates } = judged.ok
    const block = this.blocks.get(update.index)
    if (block?.closed) return fail(named('invalid', `block ${update.index} is closed`))
    if (block !== undefined && block.mode !== update.kind)
      return fail(named('invalid', `block ${update.index} is in ${block.mode} mode`))
    const sequence = this.sequence + 1
    const bytes = Buffer.byteLength(JSON.stringify({ sequence: String(sequence), update }))
    const previous = block?.bytes ?? 0
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
    const openAfter = this.openBytes - previous + (update.close ? 0 : accumulated)
    if (this.pendingBytes + bytes > authorBufferBytes || openAfter > authorBufferBytes)
      return fail(named('capacity', `${this.pendingBytes} output bytes await confirmation`))
    // Accepted: the slot, the sequence and the block state are fixed before anything is awaited.
    this.sequence = sequence
    this.pendingBytes += bytes
    this.pendingItems += 1
    this.openBytes = openAfter
    this.blocks.set(update.index, {
      mode: update.kind,
      closed: update.close,
      bytes: update.close ? 0 : accumulated,
    })
    const receiver = this.receiver
    const operation = `emit:${sequence}`
    const delivery = this.tail
      .then(() => receiver.receive({ sequence: String(sequence), update }))
      .then(
        value => readOutcome(value, operation),
        (error: unknown) => fail(unknownOperation(operation, describeThrown(error))),
      )
    this.tail = delivery.then(() => undefined)
    const outcome = await delivery
    this.pendingBytes -= bytes
    this.pendingItems -= 1
    if ('failure' in outcome) {
      this.fault ??= { sequence, failure: barrierFault(outcome.failure, operation) }
      return outcome
    }
    return succeed(Object.freeze({ kind: 'local', sequence: String(sequence) }))
  }

  wait<A>(input: WaitRequest<A>): Promise<Result<ToolDecision<A> | ToolResourceReply<A>>> {
    const refusal = this.refusal()
    if (refusal !== null) return Promise.resolve(fail(refusal))
    if (this.waits === null)
      return Promise.resolve(fail(named('unsupported', 'the scope has no wait provider')))
    const judged = judgeWait(input)
    if ('failure' in judged) return Promise.resolve(judged)
    const { request, digest, reserve } = judged.ok
    let entry = this.history.get(request.key)
    if (entry !== undefined) {
      if (entry.digest !== digest)
        return Promise.resolve(
          fail(named('conflict', `key ${request.key} was opened with another input`)),
        )
    } else {
      if (this.active !== null)
        return Promise.resolve(fail(named('busy', `wait ${this.active.key} is still open`)))
      const { authorWaitHistoryBytes, authorWaitHistoryItems } = this.limits
      if (reserve > authorWaitHistoryBytes)
        return Promise.resolve(
          fail(
            named('too-large', `the record needs ${reserve} of ${authorWaitHistoryBytes} bytes`),
          ),
        )
      if (
        this.history.size + 1 > authorWaitHistoryItems ||
        this.historyBytes + reserve > authorWaitHistoryBytes
      )
        return Promise.resolve(fail(named('capacity', 'the wait history is full')))
      entry = {
        key: request.key,
        digest,
        request,
        outcome: null,
        pending: null,
        interrupt: deferred(),
      }
      this.history.set(request.key, entry)
      this.historyBytes += reserve
    }
    // The answer came from the provider for this same request, so it has the type the author asked for.
    return this.open(entry, this.waits) as Promise<Result<ToolDecision<A> | ToolResourceReply<A>>>
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
      // The position stays reserved; a retry with the same key and input opens it again (P11).
      this.active = null
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
      .then(
        value => readOutcome(value, operation),
        (error: unknown) => fail(unknownOperation(operation, describeThrown(error))),
      )
    return this.settle(entry, await Promise.race([external, entry.interrupt.promise]))
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
      return fail(named('invalid', `the author returned with wait ${active.key} open`))
    }
    // The barrier answers cancelled when the signal aborted before or while it held (P11).
    return this.barrier(this.aborted.promise.then(() => fail(cancellation())))
  }
}

function barrierFault(failure: Failure, operation: string): Failure {
  if (failure.kind === 'unavailable' || failure.kind === 'unknown') return failure
  return Object.freeze({
    kind: 'unavailable',
    operation,
    reason: `${failure.kind}: ${failure.reason}`,
  })
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
