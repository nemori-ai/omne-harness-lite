import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ContextRegistration, ContextValue } from '@omne-harness-lite/runtime-context'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { decode } from './codec.ts'
import type { ContextEvent, ContextSessionSeed } from './journal-types.ts'
import { identity, object, sameScope } from './values.ts'

export interface ContextState {
  readonly tail: JsonNumber
  readonly seed?: ContextSessionSeed
  readonly registrations: ReadonlyMap<string, ContextRegistration>
  readonly contents: ReadonlyMap<string, ContextValue>
  readonly registrationRevision: string
  readonly events: ReadonlyMap<string, ContextEvent>
}
export type JournalRead = { readonly state: ContextState } | { readonly unavailable: true }
const unavailable = { unavailable: true } as const

/** A decoded prefix violates this provider's durable context relations. */
export class ContextHistoryInvalid extends Error {}

export function projectContext(scope: SessionScope, entries: readonly import('@omne-harness-lite/session-log').LogEntry[], tail: JsonNumber): ContextState {
  let seed: ContextSessionSeed | undefined, registrationRevision = 'absent'
  const registrations = new Map<string, ContextRegistration>(), contents = new Map<string, ContextValue>(), events = new Map<string, ContextEvent>()
  for (const entry of entries) {
    if (!sameScope(scope, { tenant: entry.tenant, session: entry.session })) throw new ContextHistoryInvalid('context log scope mismatch')
    const payload = entry.payload
    if (!object(payload) || typeof payload.codec !== 'string' || !payload.codec.startsWith('runtime-context/')) continue
    const event = decode('Event', payload)
    if (!event || !sameScope(event.scope, scope) || events.has(event.revision)) throw new ContextHistoryInvalid('invalid context journal')
    if (event.kind === 'session_initialized') {
      if (seed || event.previous !== 'absent') throw new ContextHistoryInvalid('context initialized twice')
      seed = event.seed
      for (const value of seed.required) {
        if (!value.required || registrations.has(value.key)) throw new ContextHistoryInvalid('invalid required declarations')
        registrations.set(value.key, value)
      }
      for (const value of seed.initial) {
        if (!registrations.has(value.key) || contents.has(value.key) || !decode('Value', value)) throw new ContextHistoryInvalid('invalid initial context')
        contents.set(value.key, value)
      }
      const fixed = new Set<string>()
      for (const item of seed.fixed) {
        const content = contents.get(item.key)
        if (fixed.has(item.key) || !content || identity(content.value) !== identity(item.value)) throw new ContextHistoryInvalid('invalid fixed context')
        fixed.add(item.key)
      }
      registrationRevision = event.revision
    } else {
      if (!seed) throw new ContextHistoryInvalid('context declaration missing')
      if (event.kind === 'updated') {
        const prior = contents.get(event.content.key)
        if (!registrations.has(event.content.key) || event.previous !== (prior?.revision ?? 'absent') || event.content.revision !== event.revision || !decode('Value', event.content)) throw new ContextHistoryInvalid('invalid content revision')
        const fixed = seed.fixed.find(item => item.key === event.content.key)
        if (fixed && identity(fixed.value) !== identity(event.content.value)) throw new ContextHistoryInvalid('fixed context changed')
        contents.set(event.content.key, event.content)
      } else {
        if (event.previous !== registrationRevision) throw new ContextHistoryInvalid('invalid registration revision')
        if (event.kind === 'registered') {
          if (event.registration.required || registrations.has(event.registration.key)) throw new ContextHistoryInvalid('required set or registration changed')
          registrations.set(event.registration.key, event.registration)
        } else {
          const prior = registrations.get(event.key)
          if (!prior || prior.required || seed.required.some(item => item.key === event.key)) throw new ContextHistoryInvalid('invalid context removal')
          registrations.delete(event.key); contents.delete(event.key)
        }
        registrationRevision = event.revision
      }
    }
    events.set(event.revision, event)
  }
  return { tail, ...(seed ? { seed } : {}), registrations, contents, registrationRevision, events }
}

/** A pending receipt retains the exact original event. A later tail never proves absence. */
export function createContextJournal(log: SessionLog) {
  const pending = new Map<string, ContextEvent>()
  const active = new Set<Promise<unknown>>()
  async function read(scope: SessionScope): Promise<JournalRead> {
    try {
      const result = await log.readSince(scope.session, 0)
      if ('failure' in result) return unavailable
      const state = projectContext(scope, result.entries, result.tail)
      const key = identity(scope), held = pending.get(key)
      if (held) {
        const recorded = state.events.get(held.revision)
        if (!recorded || identity(recorded) !== identity(held)) return unavailable
        pending.delete(key)
      }
      return { state }
    } catch { return unavailable }
  }
  async function commit(scope: SessionScope, state: ContextState, event: ContextEvent): Promise<'applied' | 'unavailable'> {
    const key = identity(scope)
    if (pending.has(key)) return 'unavailable'
    pending.set(key, event)
    const task = Promise.resolve().then(() => log.append(scope.session, [{
      tenant: scope.tenant, dedupeKey: `context:${event.revision}`, readKeys: ['runtime-context'], payload: event,
    }], { kind: 'unfenced' }, { kind: 'tailEquals', tail: state.tail }))
    active.add(task)
    try {
      const result = await task
      if (!('failure' in result)) { pending.delete(key); return 'applied' }
      if (result.failure === 'unavailable') return 'unavailable'
      if (result.failure === 'alreadyRecorded') {
        const recovered = await read(scope)
        return 'state' in recovered && recovered.state.events.has(event.revision) ? 'applied' : 'unavailable'
      }
      // This is the first, resolved append, so a definite rejection has no unknown predecessor.
      pending.delete(key)
      return 'unavailable'
    } catch { return 'unavailable' } finally { active.delete(task) }
  }
  return {
    read, commit,
    async drain() {
      await Promise.allSettled([...active])
      for (const event of pending.values()) await read(event.scope)
      if (pending.size) throw new Error('runtime context has unresolved writes; retain physical owner')
    },
    get unresolved() { return pending.size },
  }
}
