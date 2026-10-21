/**
 * Where the wrapper of `closeSourceOnEarlyEnd` is. `ending` holds the close that an early
 * `return()` or `throw()` started; it settles after the generator is complete.
 */
type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'ending'; readonly ended: Promise<void> }
  | { readonly kind: 'ended' }

/**
 * An async generator that never ran does not run its `finally`, so `return()` or `throw()`
 * before the first `next()` would leave its source open. The returned generator forwards every
 * call to `generator` and, when the reader ends it before it started, closes the source first.
 * Once started, the generator's own cleanup closes the source.
 *
 * An early end starts at once: a call that arrives while the source closes waits for the close
 * and then reaches the completed generator, as with a native generator. Thus `next()` is done,
 * the generator never starts, and the source closes once.
 */
export function closeSourceOnEarlyEnd<T>(
  generator: AsyncGenerator<T, void, undefined>,
  closeSource: () => unknown,
): AsyncGenerator<T, void, undefined> {
  let phase: Phase = { kind: 'idle' }
  const wrapped: AsyncGenerator<T, void, undefined> = {
    next(...args) {
      if (phase.kind === 'idle') phase = { kind: 'running' }
      return afterEarlyEnd(() => generator.next(...args))
    },
    return(value) {
      if (phase.kind === 'idle') return endBeforeStart().then(() => generator.return(value))
      return afterEarlyEnd(() => generator.return(value))
    },
    throw(error) {
      if (phase.kind === 'idle') return endBeforeStart().then(() => generator.throw(error))
      return afterEarlyEnd(() => generator.throw(error))
    },
    [Symbol.asyncIterator]() {
      return wrapped
    },
    async [Symbol.asyncDispose]() {
      await wrapped.return()
    },
  }
  return wrapped

  /** Forwards a call now, or after the early end in progress has completed the generator. */
  function afterEarlyEnd<R>(forward: () => Promise<R>): Promise<R> {
    return phase.kind === 'ending' ? phase.ended.then(forward) : forward()
  }

  /**
   * Enters `ending` before the close starts. The generator completes even when the close fails,
   * so a later `next()` is done. The failure still reaches the reader, as a failing cleanup of a
   * started generator would.
   */
  async function endBeforeStart(): Promise<void> {
    const { promise: ended, resolve } = Promise.withResolvers<void>()
    phase = { kind: 'ending', ended }
    try {
      await closeSource()
    } finally {
      await generator.return()
      phase = { kind: 'ended' }
      resolve()
    }
  }
}

/** Ends one iterator of `source`: the way a `for await` loop closes it when the loop exits early. */
export async function closeIterable(source: AsyncIterable<unknown>): Promise<void> {
  await source[Symbol.asyncIterator]().return?.()
}
