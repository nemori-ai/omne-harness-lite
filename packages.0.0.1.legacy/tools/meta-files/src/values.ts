import { isJsonNumber, type JsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { posix } from 'node:path'
import type { InvocationDependencies } from '@omne-harness-lite/tool-execution-runtime'
import type { FileFacility, FileReadResult } from '@omne-harness-lite/execution-environments'
import type { FilesOptions } from './types.ts'
import { FILES_CONTEXT_KEY } from './types.ts'
import { rejected, facilityFailure } from './result.ts'

export function jsonObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export async function currentFiles(deps: InvocationDependencies, options: FilesOptions) {
  const files = deps.environment?.files
  if (!files) return { error: rejected('facility:unavailable') }
  const key = options.contextKey ?? FILES_CONTEXT_KEY
  const observed = await deps.context.read([key])
  if (observed.kind !== 'values') return { error: rejected(`context:${observed.reason}`) }
  if (observed.values.length !== 1 || observed.values[0]?.key !== key)
    return { error: rejected('context:missingValue') }
  const initial = observed.values[0].value
  if (
    !jsonObject(initial) ||
    typeof initial.cwd !== 'string' ||
    !posix.isAbsolute(initial.cwd) ||
    initial.cwd.includes('\0')
  )
    return { error: rejected('context:invalidValue') }
  const cwd = initial.cwd
  return { files, resolve: (path: string) => posix.resolve(cwd, path) }
}
export function utf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return undefined
  }
}
export function contentBytes(content: string, encoding: 'utf8' | 'base64'): Uint8Array | undefined {
  if (encoding === 'utf8') {
    const bytes = Buffer.from(content, 'utf8')
    return utf8(bytes) === content ? bytes : undefined
  }
  const bytes = Buffer.from(content, 'base64')
  return bytes.toString('base64') === content ? bytes : undefined
}
export async function readWhole(
  files: FileFacility,
  path: string,
  maxBytes: number,
): Promise<{ ok: FileReadResult } | { error: ReturnType<typeof rejected> }> {
  const value = await files.read({ path, offsetBytes: 0, limitBytes: maxBytes + 1 })
  if (value.kind !== 'read') return { error: facilityFailure(value) }
  if (!value.eof || value.data.byteLength > maxBytes)
    return { error: rejected('capacity:wholeFileBytes', 'No target changes were submitted.') }
  return { ok: value }
}
