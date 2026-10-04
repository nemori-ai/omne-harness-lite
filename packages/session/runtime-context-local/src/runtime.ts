import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type {
  ContextConsumer, ContextMutation, ContextRead, ContextRegistration, ContextSource, ContextSourceRegistrations,
  ContextValue, RuntimeContextOperations,
} from '@omne-harness-lite/runtime-context'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { AccessIdentity, AccessOperation, SessionAccess, SessionAccessOperations, SessionScope } from '@omne-harness-lite/session-tenancy'
import { createContextJournal, type ContextState } from './journal.ts'
import { decode } from './codec.ts'
import { identity, own, object } from './values.ts'

export interface RuntimeContextDependencies {
  readonly log: SessionLog
  readonly access: SessionAccessOperations
  readonly now?: () => string
  readonly changed?: () => void
  readonly diagnostic?: (stage: 'authority' | 'log' | 'source' | 'notification', error: unknown) => void
}
type Reason = Extract<ContextMutation, {kind: 'rejected'}>['reason']
const rejected = <R extends string>(reason: R) => ({ kind: 'rejected', reason } as const)
function checkedScope(scope: SessionScope): SessionScope | undefined {
  try {
    const value = own(scope)
    if (!object(value) || Object.keys(value).some(key => key !== 'tenant' && key !== 'session')) return undefined
    const tenant = parseTenantId(value.tenant), session = parseOpaqueIdentifier(value.session, 'SessionRef')
    return 'ok' in tenant && 'ok' in session ? Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok }) : undefined
  } catch { return undefined }
}
function compatible(source: ContextSource, registration: ContextRegistration, state: ContextState): boolean {
  const required = state.seed?.required.find(item => item.key === registration.key)
  return source.recovery === registration.recovery && registration.consumers.every(consumer => source.consumers.includes(consumer)) &&
    Boolean(required) === source.requiredKeys.includes(registration.key) && registration.required === Boolean(required) &&
    (!required || required.source === source.name)
}

export function createRuntimeContext(deps: RuntimeContextDependencies) {
  const journal = createContextJournal(deps.log), sources = new Map<string, ContextSource>()
  let active = true
  function diagnostic(stage: Parameters<NonNullable<RuntimeContextDependencies['diagnostic']>>[0], error: unknown) {
    try { deps.diagnostic?.(stage, error) } catch { /* Diagnostic observers cannot replace the explicit business failure. */ }
  }
  async function authorize(access: SessionAccess, scope: SessionScope, operation: AccessOperation) {
    if (!active) return rejected('ownerStopped')
    try {
      const result = await deps.access.authorize(access, scope, operation)
      return active ? result : rejected('ownerStopped')
    } catch (error) { diagnostic('authority', error); return rejected('unavailable') }
  }
  async function state(scope: SessionScope) {
    const read = await journal.read(scope)
    if (!active) return rejected('ownerStopped')
    return 'state' in read && read.state.seed ? read : rejected('unavailable')
  }
  function notify() {
    try { deps.changed?.() } catch (error) { diagnostic('notification', error) }
  }
  const registrations: ContextSourceRegistrations = {
    registerSource(input) {
      if (!active) throw new Error('runtime context owner stopped')
      if (typeof input.name !== 'string' || !input.name || typeof input.read !== 'function' ||
          !['persisted', 'reread_source', 'recompute'].includes(input.recovery) ||
          !input.consumers.length || input.consumers.some(v => !['model', 'tool', 'extension'].includes(v)) ||
          new Set(input.consumers).size !== input.consumers.length ||
          input.requiredKeys.some(v => typeof v !== 'string' || !v) || new Set(input.requiredKeys).size !== input.requiredKeys.length) throw new TypeError('invalid context source')
      if (sources.has(input.name)) throw new Error('duplicate context source')
      const source: ContextSource = Object.freeze({ name: input.name, read: input.read, recovery: input.recovery,
        consumers: Object.freeze([...input.consumers]), requiredKeys: Object.freeze([...input.requiredKeys]) })
      sources.set(source.name, source)
      notify()
      return () => { if (sources.get(source.name) === source) { sources.delete(source.name); notify() } }
    },
  }
  async function readValues(access: SessionAccess, scope: SessionScope, consumer: ContextConsumer, keys: readonly string[]): Promise<ContextRead> {
    const checked = await authorize(access, scope, 'context.read')
    if (checked.kind === 'rejected') return checked
    if (checked.identity.consumer !== consumer || keys.some(key => !checked.identity.contextKeys.includes(key))) return rejected('notAuthorized')
    if (keys.some(key => typeof key !== 'string' || !key) || new Set(keys).size !== keys.length) return rejected('invalidInput')
    const current = await state(scope)
    if ('kind' in current) return current
    const values: ContextValue[] = []
    const adoptedSources = new Map<string, ContextSource>()
    for (const key of keys) {
      const registration = current.state.registrations.get(key)
      if (!registration) return rejected('missingRegistration')
      if (!registration.consumers.includes(consumer)) return rejected('notAuthorized')
      const source = sources.get(registration.source)
      if (!source || !compatible(source, registration, current.state)) return rejected('sourceUnavailable')
      adoptedSources.set(source.name, source)
      let content: ContextValue | undefined
      if (registration.recovery === 'persisted') content = current.state.contents.get(key)
      else {
        try {
          const result = await source.read(scope, own(registration.config))
          if (result.kind !== 'values' || sources.get(source.name) !== source) return rejected('sourceUnavailable')
          const seen = new Set<string>()
          for (const item of result.values) {
            const value = decode('Value', item)
            if (!value || seen.has(value.key)) return rejected('sourceUnavailable')
            seen.add(value.key)
            if (value.key === key) content = value
          }
        } catch (error) { diagnostic('source', error); return rejected('sourceUnavailable') }
      }
      if (!content) return rejected('sourceUnavailable')
      const fixed = current.state.seed?.fixed.find(item => item.key === key)
      if (fixed && identity(fixed.value) !== identity(content.value)) return rejected('sourceUnavailable')
      const copy = decode('Value', content)
      if (!copy) return rejected('sourceUnavailable')
      values.push(copy)
    }
    const stillAuthorized = await authorize(access, scope, 'context.read')
    if (stillAuthorized.kind === 'rejected') return stillAuthorized
    if (stillAuthorized.identity.consumer !== consumer || keys.some(key => !stillAuthorized.identity.contextKeys.includes(key))) return rejected('notAuthorized')
    if ([...adoptedSources].some(([name, source]) => sources.get(name) !== source)) return rejected('sourceUnavailable')
    return { kind: 'values', values: Object.freeze(values) }
  }
  async function mutate(access: SessionAccess, inputScope: SessionScope, operation: AccessOperation, key: string,
    prepare: (current: ContextState, caller: AccessIdentity, scope: SessionScope) => import('./journal-types.ts').ContextEvent | {readonly kind: 'rejected'; readonly reason: Reason}): Promise<ContextMutation> {
    const scope = checkedScope(inputScope)
    if (!scope) return rejected('invalidInput')
    const checked = await authorize(access, scope, operation)
    if (checked.kind === 'rejected') return checked
    if (!checked.identity.contextKeys.includes(key)) return rejected('notAuthorized')
    const current = await state(scope)
    if ('kind' in current) return current
    let candidate
    try { candidate = prepare(current.state, checked.identity, scope) }
    catch { return rejected('invalidInput') }
    if (candidate.kind === 'rejected') return candidate
    const event = decode('Event', candidate)
    if (!event) return rejected('invalidInput')
    const latest = await authorize(access, scope, operation)
    if (latest.kind === 'rejected') return latest
    if (!latest.identity.contextKeys.includes(key)) return rejected('notAuthorized')
    const result = await journal.commit(scope, current.state, event)
    if (result !== 'applied') return rejected('unavailable')
    notify()
    return { kind: 'applied', revision: event.revision }
  }
  const operations: RuntimeContextOperations = {
    async bind(access, inputScope, consumer) {
      const scope = checkedScope(inputScope)
      if (!scope || !['model', 'tool', 'extension'].includes(consumer)) return rejected('invalidInput')
      const result = await authorize(access, scope, 'context.read')
      if (result.kind === 'rejected') return result
      if (result.identity.consumer !== consumer) return rejected('notAuthorized')
      return { kind: 'bound', reader: Object.freeze({ read(keys: readonly string[]) {
        if (!Array.isArray(keys)) return Promise.resolve(rejected('invalidInput'))
        return readValues(access, scope, consumer, Object.freeze([...keys]))
      } }) }
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
      const entries = [...current.state.registrations.values()].filter(entry => latest.identity.contextKeys.includes(entry.key))
      return { kind: 'registrations', revision: current.state.registrationRevision, entries: Object.freeze(entries.map(entry => decode('Registration', entry)!)) }
    },
    register(access, scope, input, expectedRevision) {
      if (typeof expectedRevision !== 'string' || !expectedRevision) return Promise.resolve(rejected('invalidInput'))
      const registration = decode('Registration', input)
      if (!registration) return Promise.resolve(rejected('invalidInput'))
      return mutate(access, scope, 'context.configure', registration.key, (current, _caller, ownedScope) => {
        if (current.registrationRevision !== expectedRevision || current.registrations.has(registration.key)) return rejected('revisionConflict')
        const source = sources.get(registration.source)
        if (!source || !compatible(source, registration, current)) return rejected('sourceUnavailable')
        return { codec: 'runtime-context/1', kind: 'registered', scope: ownedScope, previous: expectedRevision,
          revision: identity({ scope: ownedScope, expectedRevision, registration }), registration }
      })
    },
    update(access, scope, input, expectedRevision) {
      if (typeof expectedRevision !== 'string' || !expectedRevision) return Promise.resolve(rejected('invalidInput'))
      let copied: JsonValue
      try { copied = own(input) } catch { return Promise.resolve(rejected('invalidInput')) }
      if (!object(copied) || Object.keys(copied).some(key => key !== 'key' && key !== 'value') || typeof copied.key !== 'string' || !copied.key || copied.value === undefined) return Promise.resolve(rejected('invalidInput'))
      const key = copied.key, value = copied.value
      return mutate(access, scope, 'context.publish', key, (current, caller, ownedScope) => {
        if (caller.consumer !== 'source') return rejected('notAuthorized')
        const registration = current.registrations.get(key)
        if (!registration || (current.contents.get(key)?.revision ?? 'absent') !== expectedRevision) return rejected('revisionConflict')
        const source = sources.get(registration.source)
        if (!source || !compatible(source, registration, current) || registration.recovery !== 'persisted') return rejected('sourceUnavailable')
        const fixed = current.seed?.fixed.find(item => item.key === key)
        if (fixed && identity(value) !== identity(fixed.value)) return rejected('invalidInput')
        const revision = identity({ scope: ownedScope, key, expectedRevision, value })
        return { codec: 'runtime-context/1', kind: 'updated', scope: ownedScope, previous: expectedRevision, revision,
          content: { key, revision, value, observedAt: deps.now?.() ?? new Date().toISOString() } }
      })
    },
    remove(access, scope, key, expectedRevision) {
      if (typeof key !== 'string' || !key || typeof expectedRevision !== 'string' || !expectedRevision) return Promise.resolve(rejected('invalidInput'))
      return mutate(access, scope, 'context.configure', key, (current, _caller, ownedScope) => {
        if (current.seed?.required.some(item => item.key === key) || current.registrations.get(key)?.required) return rejected('requiredRegistration')
        if (current.registrationRevision !== expectedRevision || !current.registrations.has(key)) return rejected('revisionConflict')
        return { codec: 'runtime-context/1', kind: 'removed', scope: ownedScope, key, previous: expectedRevision,
          revision: identity({ scope: ownedScope, key, expectedRevision, kind: 'removed' }) }
      })
    },
  }
  return { operations: Object.freeze(operations), sources: Object.freeze(registrations),
    closeAdmission() { active = false }, drain: journal.drain }
}
