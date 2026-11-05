// An async queue: what a line pushes its events into, and what the session reads them from.
// `push` hands an item to the waiting reader or keeps it; `end` finishes the iteration after the
// kept items; `fail` finishes it with a rejection.

export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = []
  private waiting:
    | Readonly<{ resolve(result: IteratorResult<T>): void; reject(reason: unknown): void }>
    | undefined
  private ended = false
  private failure: Readonly<{ reason: unknown }> | undefined

  push(item: T): void {
    if (this.ended) return
    const waiting = this.waiting
    if (waiting === undefined) {
      this.items.push(item)
      return
    }
    this.waiting = undefined
    waiting.resolve({ value: item, done: false })
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    const waiting = this.waiting
    this.waiting = undefined
    waiting?.resolve({ value: undefined, done: true })
  }

  fail(reason: unknown): void {
    if (this.ended) return
    this.ended = true
    this.failure = { reason }
    const waiting = this.waiting
    this.waiting = undefined
    waiting?.reject(reason)
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.failure !== undefined) return Promise.reject(this.failure.reason)
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve, reject) => {
          this.waiting = { resolve, reject }
        })
      },
      return: () => {
        this.end()
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }
}
