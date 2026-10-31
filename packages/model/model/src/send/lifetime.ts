import type {
  MaterializedTransport,
  PreparedTransport,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { SendResource } from './types.ts'

export class SendLifetime {
  resource: SendResource | undefined
  prepared: PreparedTransport | undefined
  materialized: MaterializedTransport | undefined
  private closing: Promise<void> | undefined

  close(): Promise<void> {
    this.closing ??= this.releaseAll()
    return this.closing
  }
  private async releaseAll(): Promise<void> {
    let failed = false
    for (const release of [
      () => this.materialized?.close(),
      () => this.prepared?.close(),
      () => this.resource?.release(),
    ]) {
      try {
        await release()
      } catch {
        failed = true
      }
    }
    if (failed) throw new Error('model-send resource-release-failed')
  }
}

/** Does not acquire an iterator or prefetch until the sole consumer asks for it. */
export function ownedFacts(
  source: AsyncIterable<TransportFact>,
  lifetime: SendLifetime,
  finished: () => void,
): AsyncIterable<TransportFact> {
  let handed = false
  return {
    [Symbol.asyncIterator]() {
      if (handed) throw new Error('model-send facts-already-consumed')
      handed = true
      let iterator: AsyncIterator<TransportFact> | undefined
      let ended = false
      let queue = Promise.resolve()
      const get = () => (iterator ??= source[Symbol.asyncIterator]())
      const finish = async () => {
        ended = true
        await lifetime.close()
        finished()
      }
      function serial<T>(action: () => Promise<T>): Promise<T> {
        const result = queue.then(action)
        queue = result.then(
          () => undefined,
          () => undefined,
        )
        return result
      }
      return {
        next: () =>
          serial(async () => {
            if (ended) return { done: true, value: undefined }
            try {
              const result = await get().next()
              if (result.done) await finish()
              return result
            } catch {
              await finish()
              throw new Error('model-send fact-stream-failed')
            }
          }),
        return: () =>
          serial(async () => {
            if (!ended) {
              try {
                await get().return?.()
              } catch {
                await finish()
                throw new Error('model-send fact-return-failed')
              }
              await finish()
            } else await lifetime.close()
            return { done: true, value: undefined }
          }),
        throw: () =>
          serial(async () => {
            if (!ended) {
              try {
                if (get().throw) await get().throw?.(new Error('model-send consumer-closed'))
                else await get().return?.()
              } catch {
                // The consumer's exception and transport exception are not diagnostic data.
              } finally {
                await finish()
              }
            } else await lifetime.close()
            throw new Error('model-send consumer-closed')
          }),
      }
    },
  }
}
