import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ContextRegistration, ContextValue } from '@omne-harness-lite/runtime-context'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { inspectContextLogEntry } from './history.ts'
import type { ContextEvent } from './journal-types.ts'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import { identity, sameScope } from './values.ts'

export interface ContextState {
  readonly tail: JsonNumber
  readonly seed?: ContextSessionSeed
  readonly registrations: ReadonlyMap<string, ContextRegistration>
  readonly contents: ReadonlyMap<string, ContextValue>
  readonly initializationRevision: string
  readonly registrationRevision: string
  readonly events: ReadonlyMap<string, ContextEvent>
}
/** A decoded prefix violates this provider's durable context relations. */
export class ContextHistoryInvalid extends Error {}

/** Initialization owns the required registrations, initial values and fixed-value relation. */
function initializeProjection(
  seed: ContextSessionSeed,
  registrations: Map<string, ContextRegistration>,
  contents: Map<string, ContextValue>,
) {
  for (const value of seed.required) {
    if (!value.required || registrations.has(value.key))
      throw new ContextHistoryInvalid('invalid required declarations')
    registrations.set(value.key, value)
  }
  for (const value of seed.initial) {
    if (
      !registrations.has(value.key) ||
      contents.has(value.key) ||
      !decodeContextData('Value', value)
    )
      throw new ContextHistoryInvalid('invalid initial context')
    contents.set(value.key, value)
  }
  validateFixed(seed, contents)
}
function validateFixed(seed: ContextSessionSeed, contents: ReadonlyMap<string, ContextValue>) {
  const fixed = new Set<string>()
  for (const item of seed.fixed) {
    const content = contents.get(item.key)
    if (fixed.has(item.key) || !content || identity(content.value) !== identity(item.value))
      throw new ContextHistoryInvalid('invalid fixed context')
    fixed.add(item.key)
  }
}
function updateProjection(
  event: Extract<ContextEvent, { kind: 'updated' }>,
  seed: ContextSessionSeed,
  registrations: ReadonlyMap<string, ContextRegistration>,
  contents: Map<string, ContextValue>,
) {
  const prior = contents.get(event.content.key)
  if (
    !registrations.has(event.content.key) ||
    event.previous !== (prior?.revision ?? 'absent') ||
    event.content.revision !== event.revision ||
    !decodeContextData('Value', event.content)
  )
    throw new ContextHistoryInvalid('invalid content revision')
  const fixed = seed.fixed.find(item => item.key === event.content.key)
  if (fixed && identity(fixed.value) !== identity(event.content.value))
    throw new ContextHistoryInvalid('fixed context changed')
  contents.set(event.content.key, event.content)
}
function changeRegistrations(
  event: Extract<ContextEvent, { kind: 'registered' | 'removed' }>,
  seed: ContextSessionSeed,
  registrations: Map<string, ContextRegistration>,
  contents: Map<string, ContextValue>,
) {
  if (event.kind === 'registered') {
    if (event.registration.required || registrations.has(event.registration.key))
      throw new ContextHistoryInvalid('required set or registration changed')
    registrations.set(event.registration.key, event.registration)
  } else {
    const prior = registrations.get(event.key)
    if (!prior || prior.required || seed.required.some(item => item.key === event.key))
      throw new ContextHistoryInvalid('invalid context removal')
    registrations.delete(event.key)
    contents.delete(event.key)
  }
}

interface Fold {
  seed?: ContextSessionSeed
  registrationRevision: string
  initializationRevision: string
  registrations: Map<string, ContextRegistration>
  contents: Map<string, ContextValue>
}
function applyEvent(fold: Fold, event: ContextEvent) {
  if (event.kind === 'session_initialized') {
    if (fold.seed || event.previous !== 'absent')
      throw new ContextHistoryInvalid('context initialized twice')
    initializeProjection(event.seed, fold.registrations, fold.contents)
    fold.seed = event.seed
    fold.registrationRevision = fold.initializationRevision = event.revision
    return
  }
  if (!fold.seed) throw new ContextHistoryInvalid('context declaration missing')
  if (event.kind === 'updated') {
    updateProjection(event, fold.seed, fold.registrations, fold.contents)
    return
  }
  if (event.previous !== fold.registrationRevision)
    throw new ContextHistoryInvalid('invalid registration revision')
  changeRegistrations(event, fold.seed, fold.registrations, fold.contents)
  fold.registrationRevision = event.revision
}
function checkedEvent(
  scope: SessionScope,
  entry: import('@omne-harness-lite/session-log').LogEntry,
) {
  if (!sameScope(scope, { tenant: entry.tenant, session: entry.session }))
    throw new ContextHistoryInvalid('context log scope mismatch')
  const inspected = inspectContextLogEntry(scope, entry)
  if ('unrelated' in inspected) return undefined
  if ('invalid' in inspected) throw new ContextHistoryInvalid('invalid context journal')
  return inspected.event
}
export function projectContextSuffix(
  scope: SessionScope,
  entries: readonly import('@omne-harness-lite/session-log').LogEntry[],
  tail: JsonNumber,
  prior?: ContextState,
): ContextState {
  const fold: Fold = {
    ...(prior?.seed ? { seed: prior.seed } : {}),
    registrationRevision: prior?.registrationRevision ?? 'absent',
    initializationRevision: prior?.initializationRevision ?? 'absent',
    registrations: new Map(prior?.registrations),
    contents: new Map(prior?.contents),
  }
  const events = new Map<string, ContextEvent>()
  for (const entry of entries) {
    const event = checkedEvent(scope, entry)
    if (!event) continue
    if (events.has(event.revision)) throw new ContextHistoryInvalid('duplicate context revision')
    applyEvent(fold, event)
    events.set(event.revision, event)
  }
  return { tail, ...fold, events }
}
export function projectContext(
  scope: SessionScope,
  entries: readonly import('@omne-harness-lite/session-log').LogEntry[],
  tail: JsonNumber,
): ContextState {
  return projectContextSuffix(scope, entries, tail)
}
