import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { checkDecision } from './decision.ts'
import type { DriveInput, RunnableDecision } from './types.ts'
/** Opaque ports and AbortSignal stay opaque. Accessors are rejected before reading their values. */
function inputValues(input: unknown): Record<string, unknown> | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return
  if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) return
  const descriptors = Object.getOwnPropertyDescriptors(input)
  const keys = Reflect.ownKeys(input)
  if (
    keys.some(
      key => typeof key !== 'string' || !['decision', 'permit', 'ports', 'signal'].includes(key),
    )
  )
    return
  if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value'))) return
  return Object.fromEntries(Object.entries(descriptors).map(([key, item]) => [key, item.value]))
}
export function captureDriveInput(input: unknown): DriveInput | undefined {
  const values = inputValues(input)
  if (values === undefined) return
  if (!checkDecision(values.decision)) return
  if (values.signal !== undefined && !(values.signal instanceof AbortSignal)) return
  const copy = copyJsonValue(values.decision)
  if ('failed' in copy) return
  return {
    decision: copy.ok as unknown as RunnableDecision,
    permit: values.permit as DriveInput['permit'],
    ports: values.ports as DriveInput['ports'],
    ...(values.signal === undefined ? {} : { signal: values.signal }),
  }
}
