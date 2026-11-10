import { join } from 'node:path'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { createColdIndex, indexedKey } from '../cold-index.ts'
import { positive, type RecordedSession, type SessionCoordinate } from './session.ts'

const text = (value: string) => ({ kind: 'string', value }) as const

/**
 * The resource reference of a macOS domain. It is planned before the gate exists, so it names the
 * domain by its key and boot; the sessions are known only later and live in the domain's marker.
 */
export function domainReference(
  key: string,
  bootId: string,
  scope: ScopeRef,
): ManagedResource['reference'] {
  return {
    kind: 'object',
    entries: [
      { key: 'macosDomain', value: text(key) },
      { key: 'bootId', value: text(bootId) },
      { key: 'scope', value: text(scope.ref) },
    ],
  }
}

/** The key and boot in a macOS resource reference; undefined for any other reference. */
export function readDomainReference(
  reference: ManagedResource['reference'],
): Readonly<{ key: string; bootId: string }> | undefined {
  if (reference.kind !== 'object') return undefined
  const entry = (name: string) => {
    const value = reference.entries.find(item => item.key === name)?.value
    return value?.kind === 'string' ? value.value : undefined
  }
  const key = entry('macosDomain')
  const bootId = entry('bootId')
  if (key === undefined || bootId === undefined || !indexedKey(key)) return undefined
  return { key, bootId }
}

type Marker = Readonly<{
  resource: ManagedResource
  scope: string
  coordinate: SessionCoordinate
}>

function parseSessions(value: unknown): readonly RecordedSession[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const sessions: RecordedSession[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return undefined
    const sid = Reflect.get(item, 'sid')
    const start = Reflect.get(item, 'start')
    if (typeof sid !== 'number' || positive(String(sid)) === undefined || sid <= 1) return undefined
    if (typeof start !== 'string' || !/^[0-9]+\.[0-9]{6}$/u.test(start)) return undefined
    sessions.push({ sid, start })
  }
  return sessions
}

/** A marker's content; undefined when any part is missing or names another key. */
export function parseMarker(content: string, key: string): Marker | undefined {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const resource: unknown = Reflect.get(value, 'resource')
  const scope: unknown = Reflect.get(value, 'scope')
  const coordinate: unknown = Reflect.get(value, 'coordinate')
  if (typeof scope !== 'string' || typeof coordinate !== 'object' || coordinate === null)
    return undefined
  if (typeof resource !== 'object' || resource === null) return undefined
  if (Reflect.get(resource, 'key') !== key || typeof Reflect.get(resource, 'provider') !== 'string')
    return undefined
  const reference: unknown = Reflect.get(resource, 'reference')
  if (typeof reference !== 'object' || reference === null) return undefined
  const named = readDomainReference(reference as ManagedResource['reference'])
  const bootId: unknown = Reflect.get(coordinate, 'bootId')
  const sessions = parseSessions(Reflect.get(coordinate, 'sessions'))
  if (named?.key !== key || typeof bootId !== 'string' || bootId !== named.bootId) return undefined
  if (sessions === undefined) return undefined
  return { resource: resource as ManagedResource, scope, coordinate: { bootId, sessions } }
}

/**
 * The cold index of macOS domains: one marker per domain in the state directory. The marker is
 * written after the gate reported ready and before GO, so no command runs without one; it is
 * removed after the domain's confirmed stop was recorded. A terminal's marker is written again
 * once the shell's session exists.
 */
export type DomainIndex = Readonly<{
  /** Writes the marker atomically; false when it could not be written. */
  record(
    resource: ManagedResource,
    scope: ScopeRef,
    coordinate: SessionCoordinate,
  ): Promise<boolean>
  /** The recorded sessions; `absent` when there is no marker, `unreadable` when it cannot be read. */
  coordinate(key: string): Promise<SessionCoordinate | 'absent' | 'unreadable'>
  /** Removes the marker; false when it could not be removed. */
  forget(key: string): Promise<boolean>
  /** The domains of the scope; `unavailable` unless every marker was read. */
  list(scope: ScopeRef): Promise<readonly ManagedResource[] | 'unavailable'>
}>

export function createDomainIndex(stateDirectory: string): DomainIndex {
  const markers = createColdIndex({
    directory: join(stateDirectory, 'macos-domains'),
    parse: parseMarker,
  })
  return Object.freeze({
    record: (resource, scope, coordinate) =>
      markers.record(resource.key, { resource, scope: scope.ref, coordinate }),
    async coordinate(key) {
      const marker = await markers.read(key)
      return typeof marker === 'string' ? marker : marker.coordinate
    },
    forget: key => markers.forget(key),
    async list(scope) {
      const all = await markers.all()
      if (all === 'unavailable') return 'unavailable'
      return all.filter(marker => marker.scope === scope.ref).map(marker => marker.resource)
    },
  })
}
