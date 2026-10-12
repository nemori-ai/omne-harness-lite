import {
  readJsonStrict,
  writeJsonLossless,
  isNonNegativeJsonInteger,
} from '@omne-harness-lite/content-blocks'
import { toCanonicalJson } from '@omne-harness-lite/identity-values'
import {
  decodeContextData,
  type ContextRegistration,
  type ContextValue,
} from '@omne-harness-lite/runtime-context'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ContextState } from './projection.ts'
import { own } from './values.ts'

export class ProjectionDataInvalid extends Error {}
export interface ProjectionMeta {
  tenant: string
  session: string
  fold_version: string
  projection_revision: string
  applied_tail: string
  registration_revision: string
  initialization_revision: string
  seed: string | null
}
export interface ProjectionEntry {
  tenant: string
  session: string
  key: string
  registration: string
  content: string | null
}
export interface ProjectionTables {
  rc_projection_meta: ProjectionMeta
  rc_projection_entries: ProjectionEntry
}
export const projectionScope = (scope: SessionScope) => ({
  tenant: toCanonicalJson(scope.tenant),
  session: String(scope.session),
})
function json(value: string) {
  const read = readJsonStrict(value)
  if ('failed' in read) throw new ProjectionDataInvalid('invalid projection data')
  return read.ok
}
function decodedEntry(row: ProjectionEntry) {
  const registration = decodeContextData('Registration', json(row.registration))
  if (!registration || registration.key !== row.key)
    throw new ProjectionDataInvalid('invalid projection registration')
  if (row.content === null) return { registration }
  const content = decodeContextData('Value', json(row.content))
  if (!content || content.key !== row.key)
    throw new ProjectionDataInvalid('invalid projection content')
  return { registration, content }
}
export function decodeProjection(
  meta: ProjectionMeta,
  entries: readonly ProjectionEntry[],
): ContextState {
  const tail = json(meta.applied_tail)
  const seed = meta.seed === null ? undefined : decodeContextData('Seed', json(meta.seed))
  if (!isNonNegativeJsonInteger(tail)) throw new ProjectionDataInvalid('invalid projection tail')
  if (meta.seed !== null && !seed) throw new ProjectionDataInvalid('invalid projection seed')
  const registrations = new Map<string, ContextRegistration>(),
    contents = new Map<string, ContextValue>()
  for (const row of entries) {
    const value = decodedEntry(row)
    registrations.set(row.key, value.registration)
    if (value.content) contents.set(row.key, value.content)
  }
  return {
    tail,
    ...(seed ? { seed } : {}),
    registrations,
    contents,
    registrationRevision: meta.registration_revision,
    initializationRevision: meta.initialization_revision,
    events: new Map(),
  }
}
export function encodeProjectionMeta(
  scope: SessionScope,
  state: ContextState,
  token: string,
): ProjectionMeta {
  return {
    ...projectionScope(scope),
    fold_version: '1',
    projection_revision: token,
    applied_tail: writeJsonLossless(state.tail),
    registration_revision: state.registrationRevision,
    initialization_revision: state.initializationRevision,
    seed: state.seed ? writeJsonLossless(own(state.seed)) : null,
  }
}
export function encodeProjectionEntries(
  scope: SessionScope,
  state: ContextState,
  keys?: readonly string[],
) {
  return [...state.registrations]
    .filter(([k]) => !keys || keys.includes(k))
    .map(([key, registration]): ProjectionEntry => ({
      ...projectionScope(scope),
      key,
      registration: writeJsonLossless(own(registration)),
      content: state.contents.has(key) ? writeJsonLossless(own(state.contents.get(key))) : null,
    }))
}
