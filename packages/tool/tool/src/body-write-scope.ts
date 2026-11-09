import type { ToolBodyWriter } from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeToolOperationId, type ToolOperationId } from '@omne-harness/tool-contract'
import type {
  ToolAuthorLimits,
  ToolBodyWrites,
  ToolBodyWriteInput,
  ToolBodyWriteReply,
  ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import { digestOf } from './evidence.ts'
import { copyData } from './facts-boundary.ts'
import { isPositiveSafeInteger } from './limits.ts'
import { encodeToolMaterial } from './material-codec.ts'

type Result<T> = Outcome<T, ToolPrimitiveFailure>
type Exit = 'returned' | 'failed'
export type ToolBodyScopeInput<P> = Readonly<{
  binding: Omit<ToolBodyWriteInput<P>, 'operation'>
  writes: ToolBodyWrites<P>
  signal: AbortSignal
  limits: Pick<ToolAuthorLimits, 'authorBufferBytes' | 'authorBufferItems'>
}>
export interface ToolBodyScope {
  readonly writer: ToolBodyWriter
  readonly handoffConfirmed: boolean
  finish(exit: Exit): Promise<Result<void>>
}

async function authorReply<T>(
  operation: string,
  invoke: () => ToolBodyWriteReply<T>,
): Promise<Result<T>> {
  try {
    const answer = await invoke()
    if ('ok' in answer) return answer
    return answer.failure.kind === 'denied'
      ? fail({ kind: 'unavailable', operation, reason: 'body writer access is unavailable' })
      : fail(answer.failure)
  } catch {
    return fail({
      kind: 'unknown',
      operation,
      reason: 'body writer provider did not confirm the operation',
    })
  }
}

class BodyScope<P> implements ToolBodyScope {
  readonly writer: ToolBodyWriter
  readonly #input: ToolBodyScopeInput<P>
  #tail: Promise<void> = Promise.resolve()
  #bytes = 0
  #items = 0
  #hasWrites = false
  #interruptActive: (() => void) | null = null
  readonly #aborted = Promise.withResolvers<void>()
  readonly #onAbort = () => this.#aborted.resolve()
  #handedOff = false
  #handoffConfirmed = false
  #closing: Readonly<{ exit: Exit; promise: Promise<Result<void>> }> | null = null

  constructor(input: ToolBodyScopeInput<P>) {
    this.#input = input
    input.signal.addEventListener('abort', this.#onAbort, { once: true })
    if (input.signal.aborted) this.#onAbort()
    this.writer = Object.freeze({
      begin: (key, representation) =>
        this.enqueue('begin', key, '', { key, representation }, (operation, value) =>
          input.writes.begin({ ...input.binding, operation, ...value }),
        ),
      append: (key, sequence, frame) =>
        this.enqueue('append', key, sequence, { key, sequence, frame }, (operation, value) =>
          input.writes.append({ ...input.binding, operation, ...value }),
        ),
      seal: (key, afterSequence) =>
        this.enqueue('seal', key, '', { key, afterSequence }, (operation, value) =>
          input.writes.seal({ ...input.binding, operation, ...value }),
        ),
      inspect: key => authorReply('inspect', () => input.writes.inspect({ ...input.binding, key })),
    } satisfies ToolBodyWriter)
  }

  get handoffConfirmed(): boolean {
    return this.#handoffConfirmed
  }

  private enqueue<V, T>(
    kind: 'begin' | 'append' | 'seal',
    key: string,
    sequence: string,
    value: V,
    invoke: (operation: ToolOperationId, value: V) => ToolBodyWriteReply<T>,
  ): Promise<Result<T>> {
    if (this.#input.signal.aborted)
      return Promise.resolve(fail({ kind: 'cancelled', reason: 'body writer was cancelled' }))
    if (this.#closing !== null)
      return Promise.resolve(fail({ kind: 'closed', reason: 'body writer is closing' }))
    let fixed: V
    try {
      // copyData preserves the typed data shape and rejects accessors or non-data values.
      fixed = copyData(value) as V
    } catch {
      return Promise.resolve(
        fail({ kind: 'invalid', reason: 'body writer input must be plain data' }),
      )
    }
    const encoded = encodeToolMaterial(fixed)
    if ('failure' in encoded)
      return Promise.resolve(
        fail({ kind: 'invalid', reason: 'body writer input cannot be encoded' }),
      )
    const bytes = encoded.ok.bytes.byteLength
    const limits = this.#input.limits
    if (bytes > limits.authorBufferBytes)
      return Promise.resolve(
        fail({ kind: 'too-large', reason: 'body writer input exceeds the local buffer' }),
      )
    if (this.#bytes + bytes > limits.authorBufferBytes || this.#items >= limits.authorBufferItems)
      return Promise.resolve(
        fail({ kind: 'capacity', reason: 'body writer local buffer is occupied' }),
      )
    const operation = this.operation(kind, key, sequence)
    this.#hasWrites = true
    this.#bytes += bytes
    this.#items++
    const result = this.#tail.then((): Promise<Result<T>> => {
      if (this.#handedOff)
        return Promise.resolve(
          fail({ kind: 'closed', reason: 'body writer admission was durably closed' }),
        )
      return this.run(operation, () => invoke(operation, fixed))
    })
    this.#tail = result.then(() => {
      this.#bytes -= bytes
      this.#items--
    })
    return result
  }

  private run<T>(
    operation: ToolOperationId,
    invoke: () => ToolBodyWriteReply<T>,
  ): Promise<Result<T>> {
    const pending = Promise.withResolvers<Result<T>>()
    const interrupt = () =>
      pending.resolve(
        fail({
          kind: 'unknown',
          operation,
          reason: 'body write responsibility was handed to durable recovery',
        }),
      )
    this.#interruptActive = interrupt
    void authorReply(operation, invoke).then(answer => {
      if (this.#interruptActive === interrupt) this.#interruptActive = null
      pending.resolve(answer)
    })
    return pending.promise
  }

  private operation(kind: string, key = '', sequence = ''): ToolOperationId {
    const decoded = decodeToolOperationId(
      `writer:${digestOf({ start: this.#input.binding.start, kind, key, sequence })}`,
    )
    if ('failure' in decoded) throw new Error('Invalid generated writer operation')
    return decoded.ok
  }

  finish(exit: Exit): Promise<Result<void>> {
    if (this.#closing !== null)
      return this.#closing.exit === exit
        ? this.#closing.promise
        : Promise.resolve(
            fail({ kind: 'conflict', reason: 'body writer was closed with another exit' }),
          )
    const closing = Promise.withResolvers<Result<void>>()
    this.#closing = { exit, promise: closing.promise }
    void this.close(exit)
      .then(closing.resolve, () =>
        closing.resolve(
          fail({
            kind: 'unknown',
            operation: this.operation('close'),
            reason: 'body writer close was not confirmed',
          }),
        ),
      )
      .finally(() => {
        this.#input.signal.removeEventListener('abort', this.#onAbort)
      })
    return closing.promise
  }

  private async close(exit: Exit): Promise<Result<void>> {
    if (!this.#hasWrites) {
      this.#handoffConfirmed = true
      return exit === 'returned' && this.#input.signal.aborted
        ? fail({ kind: 'cancelled', reason: 'body writer was cancelled' })
        : succeed(undefined)
    }
    if (exit === 'returned') await Promise.race([this.#tail, this.#aborted.promise])
    const interrupted = exit === 'failed' || this.#input.signal.aborted
    this.#handoffConfirmed = true
    if (interrupted) {
      this.#handedOff = true
      this.#interruptActive?.()
      this.#interruptActive = null
      await this.#tail
      return exit === 'failed'
        ? succeed(undefined)
        : fail({ kind: 'cancelled', reason: 'body writer was cancelled' })
    }
    return this.#input.signal.aborted
      ? fail({ kind: 'cancelled', reason: 'body writer was cancelled' })
      : succeed(undefined)
  }
}

export function createToolBodyScope<P>(input: ToolBodyScopeInput<P>): ToolBodyScope {
  if (
    !isPositiveSafeInteger(input.limits.authorBufferBytes) ||
    !isPositiveSafeInteger(input.limits.authorBufferItems)
  )
    throw new TypeError('body writer buffers must have positive safe integer limits')
  if (!(input.signal instanceof AbortSignal))
    throw new TypeError('body writer signal must be an AbortSignal')
  return new BodyScope(input)
}
