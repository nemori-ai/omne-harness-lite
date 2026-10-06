import type { SessionLog } from '@omne-harness-lite/session-log'
import { compareInteger, type JsonNumber } from '@omne-harness-lite/session-log'
import { StorageDefect, StorageUnavailable, type Storage } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { inspectContextLogEntry } from './history.ts'
import { createProjectionStore } from './projection-store.ts'
import { ProjectionDataInvalid } from './projection-codec.ts'
import {
  projectContext,
  projectContextSuffix,
  ContextHistoryInvalid,
  type ContextState,
} from './projection.ts'
import type { ContextEvent } from './journal-types.ts'
import { identity } from './values.ts'
export { projectContext, ContextHistoryInvalid, type ContextState } from './projection.ts'
export type JournalRead = { readonly state: ContextState } | { readonly unavailable: true }
const unavailable = { unavailable: true } as const
function readFailure(error: unknown) {
  if (
    error instanceof StorageUnavailable ||
    error instanceof ContextHistoryInvalid ||
    error instanceof ProjectionDataInvalid
  )
    return unavailable
  throw error
}
function commitFailure(error: unknown) {
  if (error instanceof StorageDefect) throw error
  return 'unavailable' as const
}
interface Pending {
  readonly event: ContextEvent
  readonly after: JsonNumber
}
function touchedKeys(
  scope: SessionScope,
  entries: readonly import('@omne-harness-lite/session-log').LogEntry[],
) {
  const keys = new Set<string>()
  for (const entry of entries) {
    const inspected = inspectContextLogEntry(scope, entry)
    if ('unrelated' in inspected) continue
    if ('invalid' in inspected) throw new ContextHistoryInvalid('invalid context journal')
    const event = inspected.event
    switch (event.kind) {
      case 'updated':
        keys.add(event.content.key)
        break
      case 'registered':
        keys.add(event.registration.key)
        break
      case 'removed':
        keys.add(event.key)
        break
      case 'session_initialized':
        for (const registration of event.seed.required) keys.add(registration.key)
    }
  }
  return [...keys]
}
function selectedState(state: ContextState, keys?: readonly string[]): ContextState {
  if (!keys) return { ...state, events: new Map() }
  const selected = new Set(keys)
  return {
    ...state,
    registrations: new Map([...state.registrations].filter(([key]) => selected.has(key))),
    contents: new Map([...state.contents].filter(([key]) => selected.has(key))),
    events: new Map(),
  }
}

/** One owner keeps exact original receipts and projects only confirmed log prefixes. */
export function createContextJournal(log: SessionLog, storage: Storage) {
  const projection = createProjectionStore(storage)
  const verified = new Set<string>(),
    pending = new Map<string, Pending>()
  const active = new Set<Promise<unknown>>()
  const reads = new Map<string, Promise<JournalRead>>()
  async function recognize(scope: SessionScope, held: Pending) {
    const result = await log.readSince(scope.session, held.after)
    if ('failure' in result) return false
    return result.entries.some(entry => {
      const inspected = inspectContextLogEntry(scope, entry)
      return 'event' in inspected && identity(inspected.event) === identity(held.event)
    })
  }
  async function advanceSuffix(
    scope: SessionScope,
    basis: import('./projection-store.ts').ProjectionSnapshot,
    entries: readonly import('@omne-harness-lite/session-log').LogEntry[],
    tail: JsonNumber,
    keys?: readonly string[],
  ): Promise<JournalRead> {
    const changed = touchedKeys(scope, entries)
    const loaded =
      keys === undefined ? basis : await projection.load(scope, [...new Set([...keys, ...changed])])
    if (loaded.token !== basis.token) return unavailable
    if (!loaded.state) {
      const prefix = await log.readSince(scope.session, 0)
      if ('failure' in prefix) return unavailable
      const rebuilt = projectContext(scope, prefix.entries, prefix.tail)
      return (await projection.save(scope, loaded, rebuilt)) ? { state: rebuilt } : unavailable
    }
    const state = projectContextSuffix(scope, entries, tail, loaded.state)
    if (
      compareInteger(tail, loaded.state.tail) !== 0 &&
      !(await projection.save(scope, loaded, state, changed))
    )
      return unavailable
    return { state }
  }
  async function catchUp(
    scope: SessionScope,
    basis: import('./projection-store.ts').ProjectionSnapshot,
    keys?: readonly string[],
  ): Promise<JournalRead> {
    const rebuild = !verified.has(identity(scope)) || !basis.state
    const after = rebuild ? 0 : basis.state!.tail
    const result = await log.readSince(scope.session, after)
    if ('failure' in result || compareInteger(result.tail, after) < 0) return unavailable
    if (!rebuild) return advanceSuffix(scope, basis, result.entries, result.tail, keys)
    const state = projectContext(scope, result.entries, result.tail)
    return (await projection.save(scope, basis, state)) ? { state } : unavailable
  }
  async function current(scope: SessionScope, keys?: readonly string[]): Promise<JournalRead> {
    const key = identity(scope),
      held = pending.get(key)
    // Do not advance derived progress using an observation that cannot recognize the original fact.
    if (held && !(await recognize(scope, held))) return unavailable
    const basis = await projection.load(scope, keys === undefined ? undefined : [])
    const caught = await catchUp(scope, basis, keys)
    if ('unavailable' in caught) return caught
    const state = caught.state
    verified.add(key)
    if (held) pending.delete(key)
    // History is not retained by current readers or projection state.
    return { state: selectedState(state, keys) }
  }
  function read(scope: SessionScope, keys?: readonly string[]): Promise<JournalRead> {
    const key = identity(scope),
      predecessor = reads.get(key)
    const task = Promise.resolve(predecessor)
      .then(() => current(scope, keys))
      .catch(readFailure)
    reads.set(key, task)
    active.add(task)
    const clean = () => {
      active.delete(task)
      if (reads.get(key) === task) reads.delete(key)
    }
    void task.then(clean, clean)
    return task
  }
  async function append(
    scope: SessionScope,
    state: ContextState,
    event: ContextEvent,
  ): Promise<'applied' | 'unavailable'> {
    const key = identity(scope)
    const result = await log.append(
      scope.session,
      [
        {
          tenant: scope.tenant,
          dedupeKey: `context:${event.revision}`,
          readKeys: ['runtime-context'],
          payload: event,
        },
      ],
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: state.tail },
    )
    if ('failure' in result && !['unavailable', 'alreadyRecorded'].includes(result.failure)) {
      // The original physical append has definitely rejected. No unknown predecessor exists.
      pending.delete(key)
      return 'unavailable'
    }
    if ('failure' in result && result.failure === 'unavailable') return 'unavailable'
    const confirmed = await read(scope)
    return 'state' in confirmed ? 'applied' : 'unavailable'
  }
  async function commit(
    scope: SessionScope,
    state: ContextState,
    event: ContextEvent,
  ): Promise<'applied' | 'unavailable'> {
    const key = identity(scope)
    if (pending.has(key)) return 'unavailable'
    pending.set(key, { event, after: state.tail })
    const task = Promise.resolve()
      .then(() => append(scope, state, event))
      .catch(commitFailure)
    active.add(task)
    try {
      return await task
    } finally {
      active.delete(task)
    }
  }
  return {
    read,
    commit,
    async drain() {
      while (active.size) await Promise.allSettled([...active])
      await projection.drain()
      for (const { event } of pending.values()) await read(event.scope)
      if (pending.size)
        throw new Error('runtime context unresolved writes; retain original dependencies')
    },
    get unresolved() {
      return pending.size
    },
  }
}
