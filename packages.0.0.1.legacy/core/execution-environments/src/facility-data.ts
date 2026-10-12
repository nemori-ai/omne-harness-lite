import type { CommandFacility, FileFacility } from './facilities.ts'
import type { EnvironmentFacilities } from './execution-environments.ts'
import { captureEnvironmentDescription } from './data.ts'
import { commandFacilityMethods, fileFacilityMethods } from './facility-arguments.ts'

function object(input: unknown): Record<PropertyKey, unknown> | undefined {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<PropertyKey, unknown>)
    : undefined
}
function capturePorts<T>(input: unknown, names: readonly string[]): T | undefined {
  const value = object(input)
  if (!value) return undefined
  const ports: Record<string, unknown> = {}
  for (const name of names) {
    const method = value[name]
    if (typeof method !== 'function') return undefined
    ports[name] = method.bind(value)
  }
  return Object.freeze(ports) as T
}
/** Captures only built-in facility ports whose declaration and runtime shape agree. */
export function captureEnvironmentFacilities(input: unknown): EnvironmentFacilities | undefined {
  try {
    const value = object(input),
      description = captureEnvironmentDescription(value?.description)
    if (!value || !description) return undefined
    const cmd = capturePorts<CommandFacility>(value.command, commandFacilityMethods),
      file = capturePorts<FileFacility>(value.files, fileFacilityMethods)
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
export { captureCommandRequest } from './command-request.ts'
export { isCommandProcess } from './process-data.ts'
