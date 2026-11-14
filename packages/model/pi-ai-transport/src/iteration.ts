type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'ending'; readonly ended: Promise<void> }
  | { readonly kind: 'ended' }

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

  function afterEarlyEnd<R>(forward: () => Promise<R>): Promise<R> {
    return phase.kind === 'ending' ? phase.ended.then(forward) : forward()
  }

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

export async function closeIterable(source: AsyncIterable<unknown>): Promise<void> {
  await source[Symbol.asyncIterator]().return?.()
}
