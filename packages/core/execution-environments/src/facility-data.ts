import type { CommandRequest, CommandFacility, FileFacility, ProcessHandle } from './facilities.ts'
import type { EnvironmentFacilities } from './execution-environments.ts'
import { captureEnvironmentDescription } from './data.ts'

function object(input: unknown): Record<PropertyKey, unknown> | undefined {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<PropertyKey, unknown>)
    : undefined
}
function command(input: unknown): CommandFacility | undefined {
  const value = object(input),
    start = value?.start
  return value && typeof start === 'function'
    ? Object.freeze({ start: start.bind(value) as CommandFacility['start'] })
    : undefined
}
function files(input: unknown): FileFacility | undefined {
  const value = object(input),
    read = value?.read,
    write = value?.write
  return value && typeof read === 'function' && typeof write === 'function'
    ? Object.freeze({
        read: read.bind(value) as FileFacility['read'],
        write: write.bind(value) as FileFacility['write'],
      })
    : undefined
}
/** Captures only built-in facility ports whose declaration and runtime shape agree. */
export function captureEnvironmentFacilities(input: unknown): EnvironmentFacilities | undefined {
  try {
    const value = object(input),
      description = captureEnvironmentDescription(value?.description)
    if (!value || !description) return undefined
    const cmd = command(value.command),
      file = files(value.files)
    if (
      description.facilities.includes('command') !== Boolean(cmd) ||
      description.facilities.includes('files') !== Boolean(file)
    )
      return undefined
    return Object.freeze({
      description,
      ...(cmd ? { command: cmd } : {}),
      ...(file ? { files: file } : {}),
    })
  } catch {
    return undefined
  }
}
/** Byte ownership is copied before authorization or the first external effect. */
export function captureCommandRequest(input: unknown): CommandRequest | undefined {
  try {
    const value = object(input)
    if (
      !value ||
      Object.keys(value).some(key => !['executable', 'args', 'cwd', 'env', 'stdin'].includes(key))
    )
      return undefined
    const env = object(value.env)
    if (
      !env ||
      !Object.values(env).every(item => typeof item === 'string') ||
      typeof value.executable !== 'string' ||
      !value.executable ||
      typeof value.cwd !== 'string' ||
      !value.cwd ||
      !Array.isArray(value.args) ||
      !value.args.every(arg => typeof arg === 'string')
    )
      return undefined
    if (value.stdin !== undefined && !(value.stdin instanceof Uint8Array)) return undefined
    return Object.freeze({
      executable: value.executable,
      cwd: value.cwd,
      args: Object.freeze([...value.args]),
      env: Object.freeze({ ...env }) as Readonly<Record<string, string>>,
      ...(value.stdin instanceof Uint8Array ? { stdin: new Uint8Array(value.stdin) } : {}),
    })
  } catch {
    return undefined
  }
}
/** Checks the streaming port before exposing an already-started process. It does not start it. */
export function isCommandProcess(input: unknown): input is ProcessHandle {
  try {
    const value = object(input),
      policy = object(value?.outputPolicy),
      output = object(value?.output)
    return Boolean(
      value &&
      policy &&
      output &&
      typeof output[Symbol.asyncIterator] === 'function' &&
      value.result instanceof Promise &&
      typeof value.stop === 'function' &&
      policy.overflow === 'discard' &&
      Number.isSafeInteger(policy.maxBufferedBytes) &&
      Number.isSafeInteger(policy.maxChunkBytes) &&
      Number(policy.maxBufferedBytes) > 0 &&
      Number(policy.maxChunkBytes) > 0 &&
      Number(policy.maxChunkBytes) <= Number(policy.maxBufferedBytes),
    )
  } catch {
    return false
  }
}
