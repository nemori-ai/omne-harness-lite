import canonicalize from 'canonicalize'
import { defineSettings, type SettingsInputFailure } from './definition.ts'
import type { SettingDefinitions } from './schema.ts'

export type SettingsRegistration = Readonly<{
  kind: 'registered'
  registrationId: number
  definition: SettingDefinitions
}>
export type SettingsRegistrationResult =
  | SettingsRegistration
  | SettingsInputFailure
  | Readonly<{ kind: 'conflict' | 'closing' }>
export type SettingsRegistrySnapshot = Readonly<{
  revision: number
  definitions: readonly SettingDefinitions[]
}>

/** Assembly-only registration. Availability does not establish a target or grant access. */
export function createSettingsRegistry(options: Readonly<{ capacity: number }>) {
  if (!Number.isInteger(options.capacity) || options.capacity < 1 || options.capacity > 1024)
    throw new RangeError('Settings registry capacity must be between 1 and 1024')
  const definitions = new Map<
    string,
    { definition: SettingDefinitions; content: string; leases: Set<number> }
  >()
  const registrations = new Map<number, string>()
  let nextId = 0
  let revision = 0
  let closed = false
  return Object.freeze({
    registerContribution(input: unknown): SettingsRegistrationResult {
      if (closed) return { kind: 'closing' }
      if (registrations.size >= options.capacity) return { kind: 'limit_exceeded' }
      const result = defineSettings(input)
      if (result.kind !== 'defined') return result
      const definition = result.definition
      const key = JSON.stringify([
        definition.providerId,
        definition.definitionId,
        definition.version,
      ])
      const content = canonicalize(definition)!
      let existing = definitions.get(key)
      if (existing && existing.content !== content) return { kind: 'conflict' }
      if (!existing && definitions.size >= options.capacity) return { kind: 'limit_exceeded' }
      const registrationId = ++nextId
      if (!existing) {
        existing = { definition, content, leases: new Set() }
        definitions.set(key, existing)
      }
      if (existing.leases.size === 0) revision++
      existing.leases.add(registrationId)
      registrations.set(registrationId, key)
      return Object.freeze({ kind: 'registered', registrationId, definition: existing.definition })
    },
    releaseContribution(registrationId: number): void {
      const key = registrations.get(registrationId)
      if (key === undefined) return
      registrations.delete(registrationId)
      const entry = definitions.get(key)!
      entry.leases.delete(registrationId)
      if (entry.leases.size === 0) revision++
    },
    snapshot(): SettingsRegistrySnapshot {
      return Object.freeze({
        revision,
        definitions: Object.freeze(
          [...definitions.entries()]
            .filter(([, entry]) => entry.leases.size > 0)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([, entry]) => entry.definition),
        ),
      })
    },
    close(): void {
      if (closed) return
      closed = true
      for (const entry of definitions.values()) entry.leases.clear()
      registrations.clear()
      revision++
    },
  })
}
