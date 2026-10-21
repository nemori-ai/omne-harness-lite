/**
 * An async generator that never ran does not run its `finally`, so `return()` or `throw()`
 * before the first `next()` would leave its source open. The returned generator forwards every
 * call to `generator` and, when the reader ends it before it started, closes the source first.
 * Once started, the generator's own cleanup closes the source.
 */
export function closeSourceOnEarlyEnd<T>(
  generator: AsyncGenerator<T, void, undefined>,
  closeSource: () => unknown,
): AsyncGenerator<T, void, undefined> {
  let started = false
  const wrapped: AsyncGenerator<T, void, undefined> = {
    next(...args) {
      started = true
      return generator.next(...args)
    },
    async return(value) {
      if (!started) await closeSourceFirst()
      return generator.return(value)
    },
    async throw(error) {
      if (!started) await closeSourceFirst()
      return generator.throw(error)
    },
    [Symbol.asyncIterator]() {
      return wrapped
    },
    async [Symbol.asyncDispose]() {
      await wrapped.return()
    },
  }
  return wrapped

  /**
   * The generator completes even when the close fails, so a later `next()` is done. The failure
   * still reaches the reader, as a failing cleanup of a started generator would.
   */
  async function closeSourceFirst(): Promise<void> {
    try {
      await closeSource()
    } finally {
      await generator.return()
    }
  }
}

/** Ends one iterator of `source`: the way a `for await` loop closes it when the loop exits early. */
export async function closeIterable(source: AsyncIterable<unknown>): Promise<void> {
  await source[Symbol.asyncIterator]().return?.()
}
