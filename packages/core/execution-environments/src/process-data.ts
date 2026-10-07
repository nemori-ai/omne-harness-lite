import type { ProcessHandle } from './facilities.ts'
import { shape, positive, object, type Check } from './facility-input.ts'
const output: Check = value =>
  value !== null &&
  typeof value === 'object' &&
  typeof Reflect.get(value, Symbol.asyncIterator) === 'function'
const policy: Check = value =>
  shape(
    value,
    {
      overflow: v => v === 'discard',
      maxBufferedBytes: positive,
      maxChunkBytes: positive,
    },
    ['overflow', 'maxBufferedBytes', 'maxChunkBytes'],
  ) &&
  object(value) &&
  Number(value.maxChunkBytes) <= Number(value.maxBufferedBytes)
const fields: Record<string, Check> = {
  outputMode: value => value === 'separate' || value === 'terminal',
  output,
  outputPolicy: policy,
  result: value => value instanceof Promise,
  stop: value => typeof value === 'function',
}
/** Validates the started process ports. It does not start or rebind the process. */
export function isCommandProcess(input: unknown): input is ProcessHandle {
  try {
    return (
      input !== null &&
      typeof input === 'object' &&
      Object.entries(fields).every(([key, check]) => check(Reflect.get(input, key)))
    )
  } catch {
    return false
  }
}
