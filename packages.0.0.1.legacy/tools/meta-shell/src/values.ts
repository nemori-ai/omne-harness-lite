import { isJsonNumber, readJsonStrict, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { TerminalReference } from '@omne-harness-lite/execution-environments'
import type { ShellInitialContext } from './types.ts'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function environmentValues(value: unknown): value is Readonly<Record<string, string>> {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        key.length > 0 &&
        !key.includes('=') &&
        !key.includes('\0') &&
        typeof item === 'string' &&
        !item.includes('\0'),
    )
  )
}
export function initialContext(value: unknown): ShellInitialContext | undefined {
  if (!object(value) || Object.keys(value).some(key => key !== 'cwd' && key !== 'envs'))
    return undefined
  if (
    typeof value.cwd !== 'string' ||
    !value.cwd ||
    value.cwd.includes('\0') ||
    !environmentValues(value.envs)
  )
    return undefined
  return { cwd: value.cwd, envs: { ...value.envs } }
}
export function terminalReference(value: unknown): TerminalReference | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = readJsonStrict(value)
  if ('failed' in parsed || !object(parsed.ok)) return undefined
  const ref = parsed.ok
  if (
    Object.keys(ref).length !== 2 ||
    typeof ref.id !== 'string' ||
    !ref.id ||
    typeof ref.generation !== 'string' ||
    !ref.generation
  )
    return undefined
  return { id: ref.id, generation: ref.generation }
}
