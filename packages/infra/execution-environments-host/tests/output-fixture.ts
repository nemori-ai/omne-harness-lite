import type {
  CommandOutput,
  CommandOutputSummary,
  CommandOutputPolicy,
} from '@omne-harness-lite/execution-environments'

/** A controlled protocol producer. This is not evidence of real OS pipe behavior. */
export function outputFixture(policy: CommandOutputPolicy) {
  let closed = false,
    abandoned = false,
    claimed = false,
    buffered = 0
  const queue: (CommandOutput & { stream: 'stdout' | 'stderr' })[] = []
  let waiting: ((value: IteratorResult<CommandOutput>) => void) | undefined
  const counts = {
    stdout: { observedBytes: 0, discardedBytes: 0 },
    stderr: { observedBytes: 0, discardedBytes: 0 },
  }
  function discardQueue() {
    for (const chunk of queue) counts[chunk.stream].discardedBytes += chunk.data.length
    queue.length = 0
    buffered = 0
  }
  return {
    emit(stream: 'stdout' | 'stderr', bytes: Uint8Array) {
      if (closed) throw new Error('producer already closed')
      counts[stream].observedBytes += bytes.length
      for (let at = 0; at < bytes.length; at += policy.maxChunkBytes) {
        const data = bytes.slice(at, at + policy.maxChunkBytes)
        if (abandoned) {
          counts[stream].discardedBytes += data.length
          continue
        }
        if (waiting) {
          const next = waiting
          waiting = undefined
          next({ done: false, value: { stream, data } })
          continue
        }
        if (buffered + data.length > policy.maxBufferedBytes) {
          counts[stream].discardedBytes += data.length
          continue
        }
        buffered += data.length
        queue.push({ stream, data })
      }
    },
    close() {
      closed = true
      if (waiting) {
        waiting({ done: true, value: undefined })
        waiting = undefined
      }
    },
    summary(): CommandOutputSummary {
      return { mode: 'separate', stdout: { ...counts.stdout }, stderr: { ...counts.stderr } }
    },
    output: {
      [Symbol.asyncIterator](): AsyncIterator<CommandOutput> {
        if (claimed) throw new Error('one reader only')
        claimed = true
        return {
          next() {
            const chunk = queue.shift()
            if (chunk) {
              buffered -= chunk.data.length
              return Promise.resolve({ done: false, value: chunk })
            }
            return closed || abandoned
              ? Promise.resolve({ done: true, value: undefined })
              : new Promise(resolve => {
                  waiting = resolve
                })
          },
          return() {
            abandoned = true
            discardQueue()
            if (waiting) {
              waiting({ done: true, value: undefined })
              waiting = undefined
            }
            return Promise.resolve({ done: true, value: undefined })
          },
        }
      },
    } satisfies AsyncIterable<CommandOutput>,
  }
}
