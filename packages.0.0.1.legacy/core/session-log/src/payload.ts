import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { checkKey, invalidInput, object } from './values.ts'
import type { InvalidInput } from './types.ts'

export interface MessageLogPayload {
  readonly owner: 'messages'
  readonly version: '9'
  readonly kind: 'message'
  readonly value: Message
}
export interface FactLogPayload {
  readonly owner: string
  readonly version: string
  readonly kind: 'fact'
  /** The named owner validates its own versioned fact schema. */
  readonly value: JsonValue
}
export type CheckedLogPayload =
  | { readonly kind: 'message'; readonly payload: MessageLogPayload }
  | { readonly kind: 'fact'; readonly payload: FactLogPayload }
  | { readonly kind: 'other'; readonly value: JsonValue }
  | InvalidInput

/** Unknown other JSON is preserved. Only the explicit message envelope can carry model messages. */
export function checkLogPayload(value: unknown): CheckedLogPayload {
  const copy = copyJsonValue(value)
  if ('failed' in copy) return invalidInput
  const owned = copy.ok
  if (!object(owned) || !Object.hasOwn(owned, 'owner')) return { kind: 'other', value: owned }
  return checkOwnedPayload(owned)
}
function checkOwnedPayload(
  owned: import('@omne-harness-lite/content-blocks').JsonObject,
): CheckedLogPayload {
  if (
    !Object.keys(owned).every(key => ['owner', 'version', 'kind', 'value'].includes(key)) ||
    !checkKey(owned.owner) ||
    !checkKey(owned.version) ||
    owned.value === undefined
  )
    return invalidInput
  if (owned.kind === 'fact') return checkFactPayload(owned)
  if (owned.kind !== 'message' || owned.owner !== 'messages' || owned.version !== '9')
    return invalidInput
  const checked = judgeMessage(owned.value)
  if ('rejected' in checked) return invalidInput
  return {
    kind: 'message',
    payload: Object.freeze({ owner: 'messages', version: '9', kind: 'message', value: checked.ok }),
  }
}
export function messageLogPayload(message: Message): MessageLogPayload {
  const checked = checkLogPayload({
    owner: 'messages',
    version: '9',
    kind: 'message',
    value: message,
  })
  if ('failure' in checked || checked.kind !== 'message')
    throw new TypeError('invalid message log payload')
  return checked.payload
}
function checkFactPayload(
  owned: import('@omne-harness-lite/content-blocks').JsonObject,
): CheckedLogPayload {
  if (owned.owner === 'messages') return invalidInput
  return { kind: 'fact', payload: owned as unknown as FactLogPayload }
}
export function factLogPayload(owner: string, version: string, value: unknown): FactLogPayload {
  const checked = checkLogPayload({ owner, version, kind: 'fact', value })
  if ('failure' in checked || checked.kind !== 'fact')
    throw new TypeError('invalid fact log payload')
  return checked.payload
}
