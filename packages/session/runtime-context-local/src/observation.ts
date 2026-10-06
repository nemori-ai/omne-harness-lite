import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type {
  ContextConsumer,
  ContextCursor,
  ContextRead,
  ContextRegistration,
  ContextScope,
  ContextSnapshotReader,
  ContextSource,
  ContextValue,
  ContextVisibleRegistration,
  ContextObservationFailure,
} from '@omne-harness-lite/runtime-context'
import type { AccessIdentity } from '@omne-harness-lite/session-tenancy'
import type { ContextState } from './journal.ts'
import type { createContextSources } from './sources.ts'

import { identity, own } from './values.ts'

const rejected = <R extends string>(reason: R) => ({ kind: 'rejected', reason }) as const
export function compatible(
  source: ContextSource,
  registration: ContextRegistration,
  state: ContextState,
): boolean {
  const required = state.seed?.required.find(item => item.key === registration.key)
  return (
    source.recovery === registration.recovery &&
    registration.consumers.every(consumer => source.consumers.includes(consumer)) &&
    Boolean(required) === source.requiredKeys.includes(registration.key) &&
    registration.required === Boolean(required) &&
    (!required || required.source === source.name)
  )
}
interface View {
  readonly range: string
  readonly generations: ReadonlyMap<string, string>
  readonly registrations: readonly ContextVisibleRegistration[]
  readonly values: readonly ContextValue[]
  readonly viewRevision: string
}
interface Dependencies {
  readonly scope: ContextScope
  readonly consumer: ContextConsumer
  readonly sources: ReturnType<typeof createContextSources>
  readonly authorize: () => Promise<
    { readonly kind: 'authorized'; readonly identity: AccessIdentity } | ContextObservationFailure
  >
  readonly state: () => Promise<{ readonly state: ContextState } | ContextObservationFailure>
  readonly diagnostic: (error: unknown) => void
}
const visible = (state: ContextState, caller: AccessIdentity, consumer: ContextConsumer) =>
  [...state.registrations.values()]
    .filter(entry => entry.consumers.includes(consumer) && caller.contextKeys.includes(entry.key))
    .sort((a, b) => a.key.localeCompare(b.key))
const range = (caller: AccessIdentity) => identity([...new Set(caller.contextKeys)].sort())
const basis = (state: ContextState, keys: readonly string[]) =>
  identity(
    keys.map(key => ({
      registration: state.registrations.get(key) ?? null,
      content: state.contents.get(key) ?? null,
    })),
  )
async function content(
  deps: Dependencies,
  registration: ContextRegistration,
  state: ContextState,
  source: ContextSource,
): Promise<ContextValue | undefined> {
  let value = state.contents.get(registration.key)
  if (registration.recovery !== 'persisted') {
    const result = await source.read(deps.scope, own(registration.config))
    if (result.kind !== 'values') return undefined
    const seen = new Set<string>()
    value = undefined
    for (const item of result.values) {
      const checked = decodeContextData('Value', item)
      if (!checked || seen.has(checked.key)) return undefined
      seen.add(checked.key)
      if (checked.key === registration.key) value = checked
    }
  }
  if (!value) return undefined
  const fixed = state.seed?.fixed.find(item => item.key === registration.key)
  return fixed && identity(fixed.value) !== identity(value.value)
    ? undefined
    : decodeContextData('Value', value)
}
/** Resolve all values against the one durable prefix adopted for this read. */
async function resolveValues(
  deps: Dependencies,
  registrations: readonly ContextRegistration[],
  state: ContextState,
) {
  const values: ContextValue[] = [],
    adopted = new Map<string, ContextSource>(),
    generations = new Map<string, string>()
  for (const entry of registrations) {
    const source = adopted.get(entry.source) ?? deps.sources.get(entry.source),
      generation = source && deps.sources.generation(source)
    if (!source || !generation || !compatible(source, entry, state))
      return rejected('sourceUnavailable')
    adopted.set(source.name, source)
    generations.set(source.name, generation)
    const value = await content(deps, entry, state, source)
    if (!value) return rejected('sourceUnavailable')
    values.push(value)
  }
  return { values, adopted, generations }
}

/** Validate adoption, rather than silently returning a partial or stale visible projection. */
function verifyView(
  deps: Dependencies,
  input: {
    readonly complete: boolean
    readonly before: ContextState
    readonly after: ContextState
    readonly original: AccessIdentity
    readonly authorized: AccessIdentity
    readonly keys: readonly string[]
    readonly adopted: ReadonlyMap<string, ContextSource>
    readonly changed: boolean
  },
) {
  if (
    input.authorized.consumer !== deps.consumer ||
    input.keys.some(key => !input.authorized.contextKeys.includes(key))
  )
    return rejected('notAuthorized')
  if ([...input.adopted.values()].some(source => !deps.sources.current(source)))
    return rejected('sourceUnavailable')
  if (input.changed || basis(input.before, input.keys) !== basis(input.after, input.keys))
    return rejected('viewChanged')
  if (
    input.complete &&
    (range(input.original) !== range(input.authorized) ||
      identity(input.keys) !==
        identity(visible(input.after, input.authorized, deps.consumer).map(entry => entry.key)))
  )
    return rejected('viewChanged')
  return undefined
}

/** Keeps only caller-held cursor bases, never a strong history table or full journal prefixes. */
export function createContextReader(deps: Dependencies): ContextSnapshotReader {
  const cursors = new WeakMap<ContextCursor, View>()
  async function view(requested?: readonly string[]): Promise<View | ContextObservationFailure> {
    const checked = await deps.authorize()
    if (checked.kind === 'rejected') return checked
    if (checked.identity.consumer !== deps.consumer) return rejected('notAuthorized')
    if (requested?.some(key => !checked.identity.contextKeys.includes(key)))
      return rejected('notAuthorized')
    const current = await deps.state()
    if ('kind' in current) return current
    const selected = requested
      ? requested.map(key => current.state.registrations.get(key))
      : visible(current.state, checked.identity, deps.consumer)
    const registrations: ContextRegistration[] = []
    for (const entry of selected) {
      if (!entry) return rejected('missingRegistration')
      if (!entry.consumers.includes(deps.consumer)) return rejected('notAuthorized')
      registrations.push(entry)
    }
    const keys = registrations.map(entry => entry.key),
      watch = deps.sources.watch(deps.scope, keys, !requested)
    try {
      const resolved = await resolveValues(deps, registrations, current.state)
      if ('kind' in resolved) return resolved
      const latest = await deps.state()
      if ('kind' in latest) return latest
      const authorized = await deps.authorize()
      if (authorized.kind === 'rejected') return authorized
      const invalid = verifyView(deps, {
        complete: !requested,
        before: current.state,
        after: latest.state,
        original: checked.identity,
        authorized: authorized.identity,
        keys,
        adopted: resolved.adopted,
        changed: watch.changed(),
      })
      if (invalid) return invalid
      const projection = Object.freeze(
        registrations.map(entry =>
          Object.freeze({ key: entry.key, required: entry.required, recovery: entry.recovery }),
        ),
      )
      return {
        range: range(authorized.identity),
        generations: resolved.generations,
        registrations: projection,
        values: Object.freeze(resolved.values),
        viewRevision: identity({ registrations: projection, values: resolved.values }),
      }
    } catch (error) {
      deps.diagnostic(error)
      return rejected('sourceUnavailable')
    } finally {
      watch.release()
    }
  }
  function cursor(view: View): ContextCursor {
    // Only object identity in this reader's private WeakMap grants cursor validity.
    const token = Object.freeze({}) as ContextCursor
    cursors.set(token, view)
    return token
  }
  return Object.freeze({
    async read(keys): Promise<ContextRead> {
      if (
        !Array.isArray(keys) ||
        keys.some(key => typeof key !== 'string' || !key) ||
        new Set(keys).size !== keys.length
      )
        return rejected('invalidInput')
      const result = await view(Object.freeze([...keys]))
      return 'kind' in result ? result : { kind: 'values', values: result.values }
    },
    async snapshot() {
      const result = await view()
      return 'kind' in result
        ? result
        : {
            kind: 'snapshot',
            snapshot: Object.freeze({
              viewRevision: result.viewRevision,
              registrations: result.registrations,
              values: result.values,
              cursor: cursor(result),
            }),
          }
    },
    async changes(token) {
      const before = token !== null && typeof token === 'object' ? cursors.get(token) : undefined
      // Invalid cursors return no historical data and cannot become read authority.
      if (!before) return { kind: 'resetRequired' }
      const after = await view()
      if ('kind' in after) return after
      if (
        before.range !== after.range ||
        [...before.generations].some(
          ([name, generation]) =>
            after.generations.has(name) && after.generations.get(name) !== generation,
        )
      )
        return { kind: 'resetRequired' }
      const prior = new Map(
          before.registrations.map((registration, i) => [
            registration.key,
            { registration, value: before.values[i] },
          ]),
        ),
        added = [],
        updated = []
      for (const [i, registration] of after.registrations.entries()) {
        const value = after.values[i]
        if (!value) return rejected('unavailable')
        const pair = Object.freeze({ registration, value }),
          old = prior.get(registration.key)
        if (!old) added.push(pair)
        else if (identity(old) !== identity(pair)) updated.push(pair)
        prior.delete(registration.key)
      }
      return {
        kind: 'changes',
        viewRevision: after.viewRevision,
        added: Object.freeze(added),
        updated: Object.freeze(updated),
        removed: Object.freeze([...prior.keys()]),
        cursor: cursor(after),
      }
    },
  } satisfies ContextSnapshotReader)
}
