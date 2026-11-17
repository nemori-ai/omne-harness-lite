import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolControl, ToolDefiniteFailure } from '@omne-harness/tool-contract'

function own(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

const PARSERS: Readonly<Record<string, (value: object, size: number) => ToolControl | null>> = {
  stop: (_value, size) => (size === 1 ? { kind: 'stop' } : null),
  withdraw: (value, size) => {
    const reach = own(value, 'reach')
    return size === 2 && (reach === 'all' || reach === 'foreground-and-unadmitted')
      ? { kind: 'withdraw', reach }
      : null
  },
  background: (value, size) => {
    const otherwise = own(value, 'otherwise')
    return size === 2 && (otherwise === 'reject' || otherwise === 'withdraw')
      ? { kind: 'background', otherwise }
      : null
  },
}

export function controlIntent(input: object): Outcome<ToolControl, ToolDefiniteFailure> {
  const invalid = () => fail({ kind: 'invalid', field: 'intent', reason: 'type' } as const)
  try {
    const value = own(input, 'intent')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid()
    const kind = own(value, 'kind')
    const parse =
      typeof kind === 'string' && Object.hasOwn(PARSERS, kind) ? PARSERS[kind] : undefined
    const parsed = parse?.(value, Reflect.ownKeys(value).length) ?? null
    return parsed === null ? invalid() : succeed(Object.freeze(parsed))
  } catch {
    return invalid()
  }
}
