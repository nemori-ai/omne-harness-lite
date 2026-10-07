import type {
  CommandOutput,
  CommandOutputPolicy,
  CommandOutputSummary,
} from '@omne-harness-lite/execution-environments'

/** Drains without a reader; bounds bytes retained and reports exact discarded counts. */
export function createOutputBuffer(policy: CommandOutputPolicy) {
  const queue: CommandOutput[] = []
  const counts = {
    stdout: { observedBytes: 0, discardedBytes: 0 },
    stderr: { observedBytes: 0, discardedBytes: 0 },
  }
  let bytes = 0,
    ended = false,
    consumed = false
  let wake = Promise.withResolvers<void>()
  function notify() {
    wake.resolve()
    wake = Promise.withResolvers<void>()
  }
  function append(stream: CommandOutput['stream'], data: Uint8Array) {
    counts[stream].observedBytes += data.byteLength
    const keep = Math.min(data.byteLength, policy.maxBufferedBytes - bytes)
    counts[stream].discardedBytes += data.byteLength - keep
    for (let offset = 0; offset < keep; offset += policy.maxChunkBytes) {
      const owned = data.slice(offset, Math.min(keep, offset + policy.maxChunkBytes))
      queue.push({ stream, data: owned })
      bytes += owned.byteLength
    }
    notify()
  }
  const output: AsyncIterable<CommandOutput> = {
    async *[Symbol.asyncIterator]() {
      if (consumed) throw new Error('Command output has one reader')
      consumed = true
      try {
        while (true) {
          const item = queue.shift()
          if (item) {
            bytes -= item.data.byteLength
            yield item
            continue
          }
          if (ended) return
          await wake.promise
        }
      } finally {
        // Abandoning the reader does not stop the command; discard all subsequent bytes.
        for (const item of queue) counts[item.stream].discardedBytes += item.data.length
        queue.length = 0
        bytes = policy.maxBufferedBytes
      }
    },
  }
  return {
    append,
    output,
    end() {
      ended = true
      notify()
    },
    summary(): CommandOutputSummary {
      return structuredClone(counts)
    },
  }
}
