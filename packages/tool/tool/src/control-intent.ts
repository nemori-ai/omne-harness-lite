import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolControl, ToolDefiniteFailure } from '@omne-harness/tool-contract'

/** Copies the closed intent before operation allocation or any asynchronous delegation. */
export function controlIntent(input: object): Outcome<ToolControl, ToolDefiniteFailure> {
  const invalid = () => fail({ kind: 'invalid', field: 'intent', reason: 'type' } as const)
  try {
    const property = Object.getOwnPropertyDescriptor(input, 'intent')
    if (property === undefined || !('value' in property)) return invalid()
    const value: unknown = property.value
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid()
    const kind = Object.getOwnPropertyDescriptor(value, 'kind')
    if (kind === undefined || !('value' in kind)) return invalid()
    const keys = Reflect.ownKeys(value)
    if ((kind.value === 'stop' || kind.value === 'background') && keys.length === 1)
      return succeed(Object.freeze({ kind: kind.value }))
    const reach = Object.getOwnPropertyDescriptor(value, 'reach')
    if (
      kind.value === 'withdraw' &&
      keys.length === 2 &&
      reach !== undefined &&
      'value' in reach &&
      (reach.value === 'all' || reach.value === 'foreground-and-unadmitted')
    )
      return succeed(Object.freeze({ kind: 'withdraw', reach: reach.value }))
    return invalid()
  } catch {
    return invalid()
  }
}
