import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { createRequire } from 'node:module'
import type { ContextRegistration, ContextValue } from './runtime-context.ts'
import type { ContextSessionSeed } from './observation.ts'
const require = createRequire(new URL('../package.json', import.meta.url))
interface Shapes {
  Registration: ContextRegistration
  Value: ContextValue
  Seed: ContextSessionSeed
}
/** Captures JSON data and checks a fixed, lazily loaded schema. It grants no authority. */
export function decodeContextData<N extends keyof Shapes>(
  name: N,
  input: unknown,
): Shapes[N] | undefined {
  if (!['Registration', 'Value', 'Seed'].includes(name)) return undefined
  const copied = copyJsonValue(input)
  if ('failed' in copied) return undefined
  const validators = require('./generated/ordinary.cjs') as Record<
    keyof Shapes,
    (value: unknown) => boolean
  >
  if (!validators[name](copied.ok)) return undefined
  // The fixed schema establishes the public data shape at this boundary.
  const value = copied.ok as unknown as Shapes[N]
  if (
    name === 'Value' &&
    !(
      'ok' in
      instantFromRfc3339((value as ContextValue).observedAt.replace(/\.[0-9]+(?=Z|[+-])/u, ''))
    )
  )
    return undefined
  if (
    name === 'Seed' &&
    (value as ContextSessionSeed).initial.some(item => !decodeContextData('Value', item))
  )
    return undefined
  return value
}
