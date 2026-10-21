import { describe, expect, it } from 'vitest'
import { closeSourceOnEarlyEnd } from '../src/iteration.ts'

/** A two-item generator over a source, wrapped; `log` records every close in order. */
function wrapped(closeSource: () => unknown = () => undefined) {
  const log: string[] = []
  async function* items(): AsyncGenerator<number, void, undefined> {
    try {
      yield 1
      yield 2
    } finally {
      log.push('generator')
    }
  }
  const generator = closeSourceOnEarlyEnd(items(), () => {
    log.push('source')
    return closeSource()
  })
  return { generator, log }
}

describe('closeSourceOnEarlyEnd', () => {
  it('return() before the first next() closes the source; afterwards next() is done', async () => {
    const { generator, log } = wrapped()
    expect(await generator.return()).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['source'])
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })

  it('throw() before the first next() closes the source and rejects with that error, like a native generator', async () => {
    const { generator, log } = wrapped()
    const failure = new Error('reader gave up')
    await expect(generator.throw(failure)).rejects.toBe(failure)
    expect(log).toEqual(['source'])
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })

  it('asyncDispose before the first next() closes the source; afterwards next() is done', async () => {
    const { generator, log } = wrapped()
    await generator[Symbol.asyncDispose]()
    expect(log).toEqual(['source'])
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })

  it('after the first next(), return() leaves the close to the generator: the source is closed once', async () => {
    const { generator, log } = wrapped()
    expect(await generator.next()).toEqual({ done: false, value: 1 })
    expect(await generator.return()).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['generator'])
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })

  it('return() waits for an asynchronous close of the source before it completes', async () => {
    let closed = false
    const { generator } = wrapped(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 20))
      closed = true
    })
    await generator.return()
    expect(closed).toBe(true)
  })

  it('a close that fails still completes the generator: return() rejects, then next() is done', async () => {
    const failure = new Error('close failed')
    const { generator, log } = wrapped(() => {
      throw failure
    })
    await expect(generator.return()).rejects.toBe(failure)
    expect(await generator.next()).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['source'])
  })

  it.each([
    ['return()', (generator: AsyncGenerator<number, void, undefined>) => generator.return()],
    [
      'throw()',
      (generator: AsyncGenerator<number, void, undefined>) =>
        generator.throw(new Error('reader gave up')).catch(() => undefined),
    ],
  ])(
    'next() while an early %s closes the source does not start the generator: it is done, and the source closes once',
    async (_name, end) => {
      const close = Promise.withResolvers<void>()
      const { generator, log } = wrapped(() => close.promise)
      const ending = end(generator)
      const next = generator.next()
      close.resolve()
      expect(await next).toEqual({ done: true, value: undefined })
      await ending
      expect(log).toEqual(['source'])
    },
  )

  it('next() from inside the close of an early return() does not start the generator', async () => {
    let inner: Promise<IteratorResult<number, void>> | undefined
    const { generator, log } = wrapped(() => {
      inner = generator.next()
    })
    await generator.return()
    expect(await inner).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['source'])
  })

  it('a second return() while an early return() closes the source waits for that close and does not close again', async () => {
    const close = Promise.withResolvers<void>()
    const { generator, log } = wrapped(() => close.promise)
    const first = generator.return()
    const second = generator.return()
    close.resolve()
    expect(await first).toEqual({ done: true, value: undefined })
    expect(await second).toEqual({ done: true, value: undefined })
    expect(log).toEqual(['source'])
  })

  it('a close that fails under throw() wins over the thrown error, like a failing cleanup of a native generator', async () => {
    const closeFailure = new Error('close failed')
    const { generator } = wrapped(() => Promise.reject(closeFailure))
    await expect(generator.throw(new Error('reader gave up'))).rejects.toBe(closeFailure)
    expect(await generator.next()).toEqual({ done: true, value: undefined })
  })
})
