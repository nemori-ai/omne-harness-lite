import type {
  OutputChunk,
  OutputPolicy,
  OutputSummary,
} from '@omne-harness/execution-environment-contract'

export function createTerminalOutput(
  policy: Pick<OutputPolicy, 'maxBufferedBytes' | 'maxChunkBytes'>,
) {
  const queue: OutputChunk[] = []
  let buffered = 0
  let observedBytes = 0
  let discardedBytes = 0
  let reader: 'none' | 'active' | 'abandoned' = 'none'
  let closed = false
  let wake: (() => void) | undefined
  const notify = () => {
    const resolve = wake
    wake = undefined
    resolve?.()
  }
  const done = (): IteratorResult<OutputChunk> => ({ done: true, value: undefined })
  const iterator: AsyncIterator<OutputChunk> = {
    async next() {
      for (;;) {
        const chunk = queue.shift()
        if (chunk !== undefined) {
          buffered -= chunk.data.length
          return { done: false, value: chunk }
        }
        if (closed || reader === 'abandoned') return done()
        await new Promise<void>(resolve => {
          wake = resolve
        })
      }
    },
    async return() {
      reader = 'abandoned'
      discardedBytes += buffered
      buffered = 0
      queue.length = 0
      notify()
      return done()
    },
  }
  return Object.freeze({
    push(bytes: Uint8Array) {
      for (let at = 0; at < bytes.length; at += policy.maxChunkBytes) {
        const data = bytes.slice(at, at + policy.maxChunkBytes)
        const observedOffset = observedBytes
        observedBytes += data.length
        if (reader === 'abandoned' || closed || buffered + data.length > policy.maxBufferedBytes) {
          discardedBytes += data.length
          continue
        }
        queue.push({ stream: 'terminal', data, observedOffset })
        buffered += data.length
      }
      notify()
    },
    close() {
      closed = true
      notify()
    },
    output: {
      [Symbol.asyncIterator](): AsyncIterator<OutputChunk> {
        if (reader !== 'none')
          return {
            next: () => Promise.reject(new TypeError('terminal output has one reader only')),
          }
        reader = 'active'
        return iterator
      },
    },
    summary(): Extract<OutputSummary, { mode: 'terminal' }> {
      return { mode: 'terminal', terminal: { observedBytes, discardedBytes } }
    },
  })
}

export type TerminalOutput = ReturnType<typeof createTerminalOutput>
