import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { createRequire } from 'node:module'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { ContextRegistration, ContextValue } from '@omne-harness-lite/runtime-context'
import type { ContextEvent, ContextSessionSeed } from './journal-types.ts'
import { own } from './values.ts'
const require = createRequire(new URL('../package.json', import.meta.url))
type Shapes = {
  Registration: ContextRegistration
  Value: ContextValue
  Seed: ContextSessionSeed
  Event: ContextEvent
}
/** Fixed graph is built ahead of time; native require supplies the lazy per-module cache. */
export function decode<N extends keyof Shapes>(name: N, input: unknown): Shapes[N] | undefined {
  let value: unknown
  try {
    value = own(input)
  } catch {
    return undefined
  }
  const validators = require('./generated/ordinary.cjs') as Record<
    keyof Shapes,
    (input: unknown) => boolean
  >
  if (!validators[name](value)) return undefined
  // Only the checked shape crosses this local narrowing boundary.
  const checked = value as Shapes[N]
  if (name === 'Event') {
    const event = checked as ContextEvent
    if (
      !('ok' in parseTenantId(event.scope.tenant)) ||
      !('ok' in parseOpaqueIdentifier(event.scope.session, 'SessionRef'))
    )
      return undefined
  }
  if (
    name === 'Value' &&
    !(
      'ok' in
      instantFromRfc3339((checked as ContextValue).observedAt.replace(/\.[0-9]+(?=Z|[+-])/u, ''))
    )
  )
    return undefined
  return checked
}
