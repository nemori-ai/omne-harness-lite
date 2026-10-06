import { createRequire } from 'node:module'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type { ContextEvent } from './journal-types.ts'
import { own } from './values.ts'
const require = createRequire(new URL('../package.json', import.meta.url))
/** Only local journal events use this graph. Shared data is checked by its core owner. */
export function decodeEvent(input: unknown): ContextEvent | undefined {
  let value: unknown
  try {
    value = own(input)
  } catch {
    return undefined
  }
  const validators = require('./generated/ordinary.cjs') as {
    readonly Event: (value: unknown) => boolean
  }
  if (!validators.Event(value)) return undefined
  // The local fixed schema establishes the durable event shape.
  const event = value as ContextEvent
  if (
    !('ok' in parseTenantId(event.scope.tenant)) ||
    !('ok' in parseOpaqueIdentifier(event.scope.session, 'SessionRef'))
  )
    return undefined
  if (event.kind === 'updated' && !decodeContextData('Value', event.content)) return undefined
  if (
    event.kind === 'session_initialized' &&
    event.seed.initial.some(value => !decodeContextData('Value', value))
  )
    return undefined
  return event
}
