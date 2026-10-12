import {
  createProjectionCache,
  extendProjection,
  projectMessages,
  projectionKey,
  releaseProjectionCache,
  type CacheOptions,
  type CacheOwner,
  type ProjectionRules,
  type ProjectionOptions,
} from '@omne-harness-lite/model-message-projection'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { BorrowedRunJournal } from './run-journal-types.ts'

export interface MessageProjectionPolicy {
  readonly maxSessions: number
  readonly limits: CacheOptions['limits']
}
export interface MessageProjectionInput {
  readonly rules: ProjectionRules
  readonly options?: ProjectionOptions
  /** New identity whenever the trusted reader policy changes. It contains no authority. */
  readonly cache?: { readonly identity: object }
}
type Result = ReturnType<typeof projectMessages> | { readonly failure: 'unavailable' }
type Journal = Pick<BorrowedRunJournal, 'scope' | 'readProjection'>
async function readProjection(journal: Journal, previous: SourceToken | null) {
  const result = await journal.readProjection(previous)
  if (
    !('failure' in result) &&
    (!tenantIdEquals(result.source.tenant, journal.scope.tenant) ||
      result.source.session !== journal.scope.session)
  )
    throw new TypeError('foreign projection')
  return result
}
type Held = { readonly identity: object; source: SourceToken } & (
  | { readonly kind: 'cached'; readonly owner: CacheOwner }
  | { readonly kind: 'cold'; readonly inputKey: string }
)

/** Owns bounded, disposable history views. Every read still enters the current Run's journal. */
export function createSessionMessageProjections(policy: MessageProjectionPolicy) {
  if (
    ![policy.maxSessions, ...Object.values(policy.limits)].every(
      n => Number.isSafeInteger(n) && n > 0,
    )
  )
    throw new TypeError('positive projection cache limits required')
  const maxSessions = policy.maxSessions
  const limits = Object.freeze({ ...policy.limits })
  const held = new Map<string, Held>()
  const busy = new Set<string>()
  const active = new Set<Promise<Result>>()
  let open = true
  function remove(key: string) {
    const previous = held.get(key)
    if (previous) {
      if (previous.kind === 'cached') releaseProjectionCache(previous.owner)
      held.delete(key)
    }
  }
  function retain(key: string, value: Held) {
    remove(key)
    if (held.size >= maxSessions) {
      const victim = [...held.keys()].find(candidate => !busy.has(candidate))
      if (victim === undefined) {
        if (value.kind === 'cached') releaseProjectionCache(value.owner)
        return
      }
      remove(victim)
    }
    held.set(key, value)
  }
  function fromPrefix(
    full: {
      readonly source: SourceToken
      readonly entries: readonly import('@omne-harness-lite/session-log').LogEntry[]
    },
    input: MessageProjectionInput,
    key: string,
    inputKey: string,
  ): Result {
    const value = { source: full.source, entries: full.entries, rules: input.rules }
    if (!input.cache) return projectMessages(value, input.options)
    const created = createProjectionCache(value, { ...input.options, limits })
    if ('ready' in created) {
      retain(key, {
        kind: 'cached',
        owner: created.ready,
        source: full.source,
        identity: input.cache.identity,
      })
      return created
    }
    if ('unavailable' in created && created.reason === 'capacity') {
      retain(key, { kind: 'cold', inputKey, source: full.source, identity: input.cache.identity })
      return projectMessages(value, input.options)
    }
    return created
  }
  async function cold(
    journal: Journal,
    input: MessageProjectionInput,
    key: string,
    inputKey: string,
    previous?: Extract<Held, { kind: 'cold' }>,
  ): Promise<Result> {
    const full = await readProjection(journal, null)
    if ('failure' in full) return full
    if (
      previous &&
      previous.inputKey === inputKey &&
      previous.source.journalGeneration === full.source.journalGeneration
    ) {
      previous.source = full.source
      return projectMessages(
        { source: full.source, entries: full.entries, rules: input.rules },
        input.options,
      )
    }
    remove(key)
    return fromPrefix(full, input, key, inputKey)
  }
  async function project(
    journal: Journal,
    input: MessageProjectionInput,
    key: string,
  ): Promise<Result> {
    let previous = held.get(key)
    if (previous && previous.identity !== input.cache?.identity) {
      remove(key)
      previous = undefined
    }
    const rule = projectionKey(input.rules)
    if (!('key' in rule)) return rule
    if (!previous || previous.kind === 'cold') return cold(journal, input, key, rule.key, previous)
    const read = await readProjection(journal, previous.source)
    if ('failure' in read) return read
    if (read.kind === 'prefix') {
      remove(key)
      return fromPrefix(read, input, key, rule.key)
    }
    const extended = extendProjection(previous.owner, {
      source: read.source,
      entries: read.entries,
      rules: input.rules,
    })
    if ('projected' in extended) {
      previous.source = read.source
      held.delete(key)
      held.set(key, previous)
      return extended
    }
    remove(key)
    return 'rebuildRequired' in extended ? cold(journal, input, key, rule.key) : extended
  }
  return Object.freeze({
    async read(journal: Journal, input: MessageProjectionInput): Promise<Result> {
      if (!open) return { failure: 'unavailable' }
      const scope = journal.scope
      const key = JSON.stringify([scope.tenant.organization, scope.tenant.account, scope.session])
      if (busy.has(key)) return { failure: 'unavailable' }
      busy.add(key)
      const task = project(journal, input, key)
      active.add(task)
      try {
        return await task
      } finally {
        active.delete(task)
        busy.delete(key)
      }
    },
    async close() {
      open = false
      const outcomes = await Promise.allSettled([...active])
      for (const key of held.keys()) remove(key)
      const errors = outcomes.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length) throw new AggregateError(errors, 'message projection drain failed')
    },
  })
}
export type SessionMessageProjections = ReturnType<typeof createSessionMessageProjections>
