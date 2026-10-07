import type { CommandOutputPolicy } from '@omne-harness-lite/execution-environments'

export interface HostNativePolicy {
  readonly output: CommandOutputPolicy
  readonly commandDeadlineMs: number
  readonly preparationDeadlineMs: number
  readonly stopDeadlineMs: number
  readonly maxInputBytes: number
  readonly maxTerminalsPerScope: number
  readonly fileReadBytes: number
  readonly fileWriteBytes: number
  readonly maxBatchEntries: number
  readonly maxBatchBytes: number
  readonly pageEntries: number
  readonly maxPageEntries: number
  readonly searchNodes: number
  readonly searchBytes: number
}

export const defaultHostNativePolicy: HostNativePolicy = Object.freeze({
  output: Object.freeze({ maxBufferedBytes: 262144, maxChunkBytes: 16384, overflow: 'discard' }),
  commandDeadlineMs: 300000,
  preparationDeadlineMs: 10000,
  stopDeadlineMs: 5000,
  maxInputBytes: 1048576,
  maxTerminalsPerScope: 16,
  fileReadBytes: 8388608,
  fileWriteBytes: 8388608,
  maxBatchEntries: 64,
  maxBatchBytes: 33554432,
  pageEntries: 100,
  maxPageEntries: 1000,
  searchNodes: 10000,
  searchBytes: 67108864,
})

const limits = {
  commandDeadlineMs: 3600000,
  preparationDeadlineMs: 3600000,
  stopDeadlineMs: 3600000,
  maxInputBytes: 16777216,
  maxTerminalsPerScope: 1024,
  fileReadBytes: 67108864,
  fileWriteBytes: 67108864,
  maxBatchEntries: 1024,
  maxBatchBytes: 268435456,
  pageEntries: 1000,
  maxPageEntries: 1000,
  searchNodes: 1000000,
  searchBytes: 1073741824,
} as const

function captureOutput(output: CommandOutputPolicy): CommandOutputPolicy {
  const sizes = [output.maxBufferedBytes, output.maxChunkBytes]
  if (
    output.overflow !== 'discard' ||
    sizes.some(size => !Number.isSafeInteger(size) || size < 1 || size > 16777216) ||
    output.maxChunkBytes > output.maxBufferedBytes
  )
    throw new TypeError('Invalid host output policy')
  return Object.freeze(output)
}
/** Copies configuration before any native launch. Invalid limits fail before effects. */
export function captureHostNativePolicy(input: HostNativePolicy): HostNativePolicy {
  const value = structuredClone(input)
  for (const [key, maximum] of Object.entries(limits)) {
    const number = value[key as keyof typeof limits]
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
      throw new TypeError(`Invalid host policy: ${key}`)
  }
  if (value.pageEntries > value.maxPageEntries) throw new TypeError('Invalid host page policy')
  return Object.freeze({ ...value, output: captureOutput(value.output) })
}
