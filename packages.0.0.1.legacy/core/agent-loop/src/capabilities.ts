import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { AttemptCapabilities } from './types.ts'
const names = [
  'authorize',
  'handBack',
  'adoptInputs',
  'invokeModel',
  'executeActions',
  'compact',
  'runExtensions',
  'finish',
]
/** Capture operation closures before asynchronous work. Their real owners keep their state. */
export function captureCapabilities(input: AttemptCapabilities): AttemptCapabilities {
  if (input === null || typeof input !== 'object')
    throw new TypeError('invalid attempt capabilities')
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !names.includes(key)))
    throw new TypeError('unknown attempt capability')
  const captured: Record<string, unknown> = {}
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function')
      throw new TypeError('invalid attempt capability')
    captured[name] = descriptor.value.bind(input)
  }
  if (typeof captured.authorize !== 'function' || typeof captured.handBack !== 'function')
    throw new TypeError('required attempt capabilities missing')
  return Object.freeze(captured) as unknown as AttemptCapabilities
}
export function handBackResult(input: unknown): 'handedBack' | 'pending' {
  const copy = copyJsonValue(input)
  if ('failed' in copy || copy.ok === null || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    throw new TypeError('invalid hand-back result')
  const kind = 'kind' in copy.ok ? copy.ok.kind : undefined
  if (Object.keys(copy.ok).length !== 1 || (kind !== 'handedBack' && kind !== 'pending'))
    throw new TypeError('invalid hand-back result')
  return kind
}
