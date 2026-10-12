import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type {
  ContextMutation,
  ContextRegistration,
  RuntimeContextOperations,
  ContextSnapshotReader,
} from '@omne-harness-lite/runtime-context'
import type { Storage } from '@omne-harness-lite/storage'
import { createContextInitializer } from './initialize.ts'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type {
  AccessIdentity,
  AccessOperation,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import { createContextJournal, type ContextState } from './journal.ts'
import { decodeEvent } from './codec.ts'
import { identity, own, object } from './values.ts'
import { checkedScope } from './scope.ts'
import { compatible, createContextReader } from './observation.ts'
import { createContextSources } from './sources.ts'
import { createContextWork } from './work.ts'

export interface RuntimeContextDependencies {
  readonly storage: Storage
  readonly log: SessionLog
  readonly access: SessionAccessOperations
  readonly now: () => Promise<string | { readonly unavailable: true }>
  readonly changed?: () => void
  readonly diagnostic?: (
    stage: 'authority' | 'log' | 'source' | 'notification',
    error: unknown,
  ) => void
}
type Reason = Extract<ContextMutation, { kind: 'rejected' }>['reason']
const rejected = <R extends string>(reason: R) => ({ kind: 'rejected', reason }) as const
type PreparedEvent =
  import('./journal-types.ts').ContextEvent | { readonly kind: 'rejected'; readonly reason: Reason }
async function preparedEvent(prepare: () => PreparedEvent | Promise<PreparedEvent>) {
  try {
    const candidate = await prepare()
    if (candidate.kind === 'rejected') return candidate
    return decodeEvent(candidate) ?? rejected('invalidInput')
  } catch {
    return rejected('invalidInput')
  }
}
export function createRuntimeContext(deps: RuntimeContextDependencies) {
  const journal = createContextJournal(deps.log, deps.storage)
  const work = createContextWork()
  function diagnostic(
    stage: Parameters<NonNullable<RuntimeContextDependencies['diagnostic']>>[0],
    error: unknown,
  ) {
    try {
      deps.diagnostic?.(stage, error)
    } catch {
      /* Diagnostic observers cannot replace the explicit business failure. */
    }
  }
  async function authorize(access: SessionAccess, scope: SessionScope, operation: AccessOperation) {
    if (!work.active()) return rejected('ownerStopped')
    try {
      const result = await deps.access.authorize(access, scope, operation)
      return work.active() ? result : rejected('ownerStopped')
    } catch (error) {
      diagnostic('authority', error)
      return rejected('unavailable')
    }
  }
  async function state(scope: SessionScope, keys?: readonly string[]) {
    if (!work.active()) return rejected('ownerStopped')
    const read = await journal.read(scope, keys)
    if (!work.active()) return rejected('ownerStopped')
    return 'state' in read && read.state.seed ? read : rejected('unavailable')
  }
  function notify() {
    try {
      deps.changed?.()
    } catch (error) {
      diagnostic('notification', error)
    }
  }
  const sources = createContextSources({ active: work.active, state, notify })
  const stopped = () => rejected('ownerStopped')
  function trackedReader(reader: ContextSnapshotReader): ContextSnapshotReader {
    return Object.freeze({
      read: keys => work.run(() => reader.read(keys), stopped),
      snapshot: () => work.run(() => reader.snapshot(), stopped),
      changes: cursor => work.run(() => reader.changes(cursor), stopped),
    } satisfies ContextSnapshotReader)
  }
  async function mutate(
    access: SessionAccess,
    inputScope: SessionScope,
    operation: AccessOperation,
    key: string,
    prepare: (
      current: ContextState,
      caller: AccessIdentity,
      scope: SessionScope,
    ) => PreparedEvent | Promise<PreparedEvent>,
  ): Promise<ContextMutation> {
    const scope = checkedScope(inputScope)
    if (!scope) return rejected('invalidInput')
    const checked = await authorize(access, scope, operation)
    if (checked.kind === 'rejected') return checked
    if (!checked.identity.contextKeys.includes(key)) return rejected('notAuthorized')
    const current = await state(scope)
    if ('kind' in current) return current
    const event = await preparedEvent(() => prepare(current.state, checked.identity, scope))
    if ('reason' in event) return event
    const latest = await authorize(access, scope, operation)
    if (latest.kind === 'rejected') return latest
    if (!latest.identity.contextKeys.includes(key)) return rejected('notAuthorized')
    if (!work.active()) return rejected('ownerStopped')
    // A possibly committed write invalidates relevant reads before waiting for its receipt.
    sources.changed(scope, [key], event.kind !== 'updated')
    const result = await journal.commit(scope, current.state, event)
    if (result !== 'applied') return rejected('unavailable')
    notify()
    return { kind: 'applied', revision: event.revision }
  }
  const operations: RuntimeContextOperations = {
    async bind(access, inputScope, consumer) {
      const scope = checkedScope(inputScope)
      if (!scope || !['model', 'tool', 'extension'].includes(consumer))
        return rejected('invalidInput')
      const result = await authorize(access, scope, 'context.read')
      if (result.kind === 'rejected') return result
      if (result.identity.consumer !== consumer) return rejected('notAuthorized')
      return {
        kind: 'bound',
        reader: trackedReader(
          createContextReader({
            scope,
            consumer,
            sources,
            authorize: () => authorize(access, scope, 'context.read'),
            state: keys => state(scope, keys),
            diagnostic: error => diagnostic('source', error),
          }),
        ),
      }
    },
    async registrations(access, inputScope) {
      const scope = checkedScope(inputScope)
      if (!scope) return rejected('invalidInput')
      const checked = await authorize(access, scope, 'context.configure')
      if (checked.kind === 'rejected') return checked
      const current = await state(scope)
      if ('kind' in current) return current
      const latest = await authorize(access, scope, 'context.configure')
      if (latest.kind === 'rejected') return latest
      const entries = [...current.state.registrations.values()].filter(entry =>
        latest.identity.contextKeys.includes(entry.key),
      )
      return {
        kind: 'registrations',
        revision: current.state.registrationRevision,
        entries: Object.freeze(entries),
      }
    },
    register(access, scope, input, expectedRevision) {
      if (typeof expectedRevision !== 'string' || !expectedRevision)
        return Promise.resolve(rejected('invalidInput'))
      const registration = decodeContextData('Registration', input)
      if (!registration) return Promise.resolve(rejected('invalidInput'))
      return mutate(
        access,
        scope,
        'context.configure',
        registration.key,
        (current, _caller, ownedScope) => {
          if (
            current.registrationRevision !== expectedRevision ||
            current.registrations.has(registration.key)
          )
            return rejected('revisionConflict')
          const source = sources.get(registration.source)
          if (!source || !compatible(source, registration, current))
            return rejected('sourceUnavailable')
          return {
            codec: 'runtime-context/1',
            kind: 'registered',
            scope: ownedScope,
            previous: expectedRevision,
            revision: identity({ scope: ownedScope, expectedRevision, registration }),
            registration,
          }
        },
      )
    },
    update(access, scope, input, expectedRevision) {
      if (typeof expectedRevision !== 'string' || !expectedRevision)
        return Promise.resolve(rejected('invalidInput'))
      let copied: JsonValue
      try {
        copied = own(input)
      } catch {
        return Promise.resolve(rejected('invalidInput'))
      }
      if (
        !object(copied) ||
        Object.keys(copied).some(key => key !== 'key' && key !== 'value') ||
        typeof copied.key !== 'string' ||
        !copied.key ||
        copied.value === undefined
      )
        return Promise.resolve(rejected('invalidInput'))
      const key = copied.key,
        value = copied.value
      return mutate(access, scope, 'context.publish', key, async (current, caller, ownedScope) => {
        if (caller.consumer !== 'source') return rejected('notAuthorized')
        const registration = current.registrations.get(key)
        if (!registration || (current.contents.get(key)?.revision ?? 'absent') !== expectedRevision)
          return rejected('revisionConflict')
        const source = sources.get(registration.source)
        if (
          !source ||
          !compatible(source, registration, current) ||
          registration.recovery !== 'persisted'
        )
          return rejected('sourceUnavailable')
        const fixed = current.seed?.fixed.find(item => item.key === key)
        if (fixed && identity(value) !== identity(fixed.value)) return rejected('invalidInput')
        let observedAt: string | { readonly unavailable: true }
        try {
          observedAt = await deps.now()
        } catch {
          return rejected('unavailable')
        }
        if (!work.active()) return rejected('ownerStopped')
        if (sources.get(registration.source) !== source) return rejected('sourceUnavailable')
        if (typeof observedAt !== 'string' || !('ok' in instantFromRfc3339(observedAt)))
          return rejected('unavailable')
        const revision = identity({ scope: ownedScope, key, expectedRevision, value })
        return {
          codec: 'runtime-context/1',
          kind: 'updated',
          scope: ownedScope,
          previous: expectedRevision,
          revision,
          content: { key, revision, value, observedAt },
        }
      })
    },
    remove(access, scope, key, expectedRevision) {
      if (
        typeof key !== 'string' ||
        !key ||
        typeof expectedRevision !== 'string' ||
        !expectedRevision
      )
        return Promise.resolve(rejected('invalidInput'))
      return mutate(access, scope, 'context.configure', key, (current, _caller, ownedScope) => {
        if (
          current.seed?.required.some(item => item.key === key) ||
          current.registrations.get(key)?.required
        )
          return rejected('requiredRegistration')
        if (current.registrationRevision !== expectedRevision || !current.registrations.has(key))
          return rejected('revisionConflict')
        return {
          codec: 'runtime-context/1',
          kind: 'removed',
          scope: ownedScope,
          key,
          previous: expectedRevision,
          revision: identity({ scope: ownedScope, key, expectedRevision, kind: 'removed' }),
        }
      })
    },
  }
  const initializer = createContextInitializer(journal, work.active, notify)
  return {
    operations: Object.freeze({
      bind: (...args: Parameters<RuntimeContextOperations['bind']>) =>
        work.run(() => operations.bind(...args), stopped),
      registrations: (...args: Parameters<RuntimeContextOperations['registrations']>) =>
        work.run(() => operations.registrations(...args), stopped),
      register: (...args: Parameters<RuntimeContextOperations['register']>) =>
        work.run(() => operations.register(...args), stopped),
      update: (...args: Parameters<RuntimeContextOperations['update']>) =>
        work.run(() => operations.update(...args), stopped),
      remove: (...args: Parameters<RuntimeContextOperations['remove']>) =>
        work.run(() => operations.remove(...args), stopped),
    } satisfies RuntimeContextOperations),
    initializer: Object.freeze({
      initializeContextSession: (
        ...args: Parameters<typeof initializer.initializeContextSession>
      ) => work.run(() => initializer.initializeContextSession(...args), stopped),
    }),
    sources: Object.freeze(sources.registrations),
    closeAdmission() {
      work.closeAdmission()
    },
    async drain() {
      await work.drain()
      await sources.drain()
      await journal.drain()
    },
  }
}
