import type {
  OutputChunk,
  OutputPolicy,
  OutputSummary,
} from '@omne-harness/execution-environment-contract'

export type WindowsTerminalLimits = Readonly<{
  maxTerminals: number
  maxWindows: number
  maxReservedBytes: number
  maxChunks: number
}>

/** Share one capacity object between ordinary and retained factories in a provider domain. */
export function createWindowsTerminalCapacity(
  limits: WindowsTerminalLimits = {
    maxTerminals: 64,
    maxWindows: 256,
    maxReservedBytes: 64 * 1024 * 1024,
    maxChunks: 65536,
  },
) {
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(`${name} must be a positive safe integer`)
  let terminals = 0
  let windows = 0
  let reservedBytes = 0
  let chunks = 0
  return Object.freeze({
    terminal() {
      if (terminals >= limits.maxTerminals) return undefined
      terminals++
      let released = false
      return () => {
        if (!released) {
          released = true
          terminals--
        }
      }
    },
    window(bytes: number) {
      if (windows >= limits.maxWindows || bytes > limits.maxReservedBytes - reservedBytes)
        return undefined
      windows++
      reservedBytes += bytes
      let released = false
      return () => {
        if (!released) {
          released = true
          windows--
          reservedBytes -= bytes
        }
      }
    },
    chunk() {
      if (chunks >= limits.maxChunks) return false
      chunks++
      return true
    },
    releaseChunk() {
      chunks--
    },
    reading: () => ({ terminals, windows, reservedBytes, chunks }),
  })
}

export type WindowsTerminalCapacity = ReturnType<typeof createWindowsTerminalCapacity>

/**
 * The output buffer of one invocation. It reserves its maximum size when it is created; sealing it
 * releases the reservation once its reader took the queued chunks or gave up, or at once when empty.
 */
export function reserveTerminalWindow(policy: OutputPolicy, capacity: WindowsTerminalCapacity) {
  const release = capacity.window(policy.maxBufferedBytes)
  if (release === undefined) return undefined
  const queue: OutputChunk[] = []
  let buffered = 0
  let observedBytes = 0
  let discardedBytes = 0
  let sealed = false
  let reader: 'none' | 'active' | 'abandoned' = 'none'
  let wake: (() => void) | undefined
  const notify = () => {
    const ready = wake
    wake = undefined
    ready?.()
  }
  const done = (): IteratorResult<OutputChunk> => ({ done: true, value: undefined })
  const releaseIfEmpty = () => {
    if (sealed && queue.length === 0) release()
  }
  const abandon = () => {
    if (!sealed) discardedBytes += buffered
    for (const _chunk of queue) capacity.releaseChunk()
    queue.length = 0
    buffered = 0
    reader = 'abandoned'
    releaseIfEmpty()
    notify()
  }
  const read = async (): Promise<IteratorResult<OutputChunk>> => {
    for (;;) {
      const chunk = queue.shift()
      if (chunk !== undefined) {
        buffered -= chunk.data.byteLength
        capacity.releaseChunk()
        releaseIfEmpty()
        return { done: false, value: chunk }
      }
      if (sealed || reader === 'abandoned') return done()
      await new Promise<void>(resolve => {
        wake = resolve
      })
    }
  }
  let reading = Promise.resolve(done())
  const iterator: AsyncIterator<OutputChunk> = {
    next() {
      reading = reading.then(read)
      return reading
    },
    async return() {
      abandon()
      return done()
    },
  }
  return Object.freeze({
    push(bytes: Uint8Array): boolean {
      if (sealed || bytes.byteLength > Number.MAX_SAFE_INTEGER - observedBytes) return false
      for (let at = 0; at < bytes.byteLength; at += policy.maxChunkBytes) {
        const length = Math.min(policy.maxChunkBytes, bytes.byteLength - at)
        const offset = observedBytes
        observedBytes += length
        if (
          reader === 'abandoned' ||
          length > policy.maxBufferedBytes - buffered ||
          !capacity.chunk()
        ) {
          discardedBytes += length
          continue
        }
        queue.push({
          stream: 'terminal',
          observedOffset: offset,
          data: bytes.slice(at, at + length),
        })
        buffered += length
      }
      notify()
      return true
    },
    seal(): Extract<OutputSummary, { mode: 'terminal' }> {
      sealed = true
      releaseIfEmpty()
      notify()
      return Object.freeze({
        mode: 'terminal',
        terminal: Object.freeze({ observedBytes, discardedBytes }),
      })
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
  })
}

export type TerminalWindow = NonNullable<ReturnType<typeof reserveTerminalWindow>>
