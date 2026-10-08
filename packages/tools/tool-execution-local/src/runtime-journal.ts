import { setImmediate } from 'node:timers/promises'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  addInteger,
  checkAppendInput,
  compareInteger,
  type AppendRequest,
  type CheckedPrefix,
  type LogEntry,
  type OwnedLogEntry,
  type SessionLogBackingOperations,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  ToolActionFacts,
  ToolActionHistoryOperations,
} from '@omne-harness-lite/tool-admission'
import {
  prepareToolJournalEntry,
  projectToolJournal,
  type ExecutionOrigin,
  type ExecutionRef,
  type ToolJournalHistory,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import { jsonObject, sameJson } from './json-values.ts'

export interface RuntimeJournalView {
  readonly kind: 'view'
  readonly prefix: CheckedPrefix
  readonly executions: ReadonlyMap<string, ToolJournalHistory>
  readonly facts?: ToolActionFacts
}
export type RuntimeJournalFailure = {
  readonly kind: 'rejected'
  readonly reason: 'invalidInput' | 'unavailable' | 'conflict' | 'tailChanged'
}
const reject = (reason: RuntimeJournalFailure['reason']): RuntimeJournalFailure => ({
  kind: 'rejected',
  reason,
})

function ownScope(input: unknown): SessionScope | undefined {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !jsonObject(copied.ok) || Object.keys(copied.ok).length !== 2) return
  const tenant = parseTenantId(copied.ok.tenant),
    session = parseOpaqueIdentifier(copied.ok.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session ? { tenant: tenant.ok, session: session.ok } : undefined
}
function sameEntry(actual: LogEntry, proposed: OwnedLogEntry): boolean {
  const { position: _position, session: _session, ...entry } = actual
  return sameJson(entry, proposed)
}
function recognize(prefix: CheckedPrefix, batch: AppendRequest): 'same' | 'absent' | 'conflict' {
  const first = prefix.entries.findIndex(entry => entry.dedupeKey === batch.entries[0]?.dedupeKey)
  if (first < 0)
    return batch.entries.some(proposed =>
      prefix.entries.some(entry => entry.dedupeKey === proposed.dedupeKey),
    )
      ? 'conflict'
      : 'absent'
  return batch.entries.every((entry, index) => {
    const actual = prefix.entries[first + index]
    return actual !== undefined && sameEntry(actual, entry)
  })
    ? 'same'
    : 'conflict'
}

/** Trusted runtime writer. Business authorization stays in submit/read/control; tools never receive this object. */
export function createRuntimeJournal(input: {
  readonly backing: SessionLogBackingOperations
  readonly history: ToolActionHistoryOperations
}) {
  const generation = input.backing.ownerGeneration,
    held = input.backing.borrow()
  const pending = new Map<
    string,
    { readonly request: AppendRequest; readonly scope: SessionScope; readonly call: string }
  >()
  const tasks = new Set<Promise<unknown>>(),
    queues = new Map<string, Promise<unknown>>()
  let open = true,
    released = false,
    closing: Promise<void> | undefined
  const active = () => !released && generation === input.backing.ownerGeneration
  function track<T>(session: string, operation: () => Promise<T>): Promise<T> {
    const task = (queues.get(session) ?? Promise.resolve()).then(async () => {
      // Complete-prefix checks can form a long microtask chain. Keep timers and IO runnable.
      await setImmediate()
      return operation()
    })
    const complete = task.then(
      () => undefined,
      () => undefined,
    )
    queues.set(session, complete)
    tasks.add(task)
    void complete.then(() => {
      tasks.delete(task)
      if (queues.get(session) === complete) queues.delete(session)
    })
    return task
  }
  function project(
    prefix: CheckedPrefix,
    call: string,
  ): RuntimeJournalView | RuntimeJournalFailure {
    const parsed = parseOpaqueIdentifier(call, 'CallId')
    if (!('ok' in parsed)) return reject('invalidInput')
    const facts = input.history.inspect(prefix, parsed.ok),
      tools = projectToolJournal(prefix.scope, prefix.entries)
    if (facts.kind === 'unavailable' || !('executions' in tools)) return reject('unavailable')
    return {
      kind: 'view',
      prefix,
      executions: tools.executions,
      ...(facts.kind === 'known' ? { facts: facts.facts } : {}),
    }
  }
  async function read(
    scope: SessionScope,
    call: string,
  ): Promise<RuntimeJournalView | RuntimeJournalFailure> {
    if (!active()) return reject('unavailable')
    let result
    try {
      result = await held.log.readSince(scope.session, 0)
    } catch {
      return reject('unavailable')
    }
    if (!active() || 'failure' in result) return reject('unavailable')
    const copy = copyJsonValue({ scope, ownerGeneration: generation, ...result })
    if ('failed' in copy) return reject('unavailable')
    // The adopted history provider validates the complete shell and every known owner.
    return project(copy.ok as unknown as CheckedPrefix, call)
  }
  function resolvePending(view: RuntimeJournalView): boolean {
    const previous = pending.get(view.prefix.scope.session)
    if (previous === undefined) return true
    if (
      !sameJson(previous.scope, view.prefix.scope) ||
      recognize(view.prefix, previous.request) !== 'same'
    )
      return false
    pending.delete(view.prefix.scope.session)
    return true
  }

  return Object.freeze({
    generation,
    read(
      supplied: SessionScope,
      call: string,
    ): Promise<RuntimeJournalView | RuntimeJournalFailure> {
      const scope = ownScope(supplied)
      if (!scope || !('ok' in parseOpaqueIdentifier(call, 'CallId')))
        return Promise.resolve(reject('invalidInput'))
      if (!open) return Promise.resolve(reject('unavailable'))
      return track(scope.session, async () => {
        const result = await read(scope, call)
        return result.kind === 'view' && !resolvePending(result) ? reject('unavailable') : result
      })
    },
    commit(input: {
      readonly ref: ExecutionRef
      readonly origin: ExecutionOrigin
      readonly expected: Pick<CheckedPrefix, 'ownerGeneration' | 'tail'>
      readonly values: readonly ToolJournalPayload[]
    }): Promise<RuntimeJournalView | RuntimeJournalFailure> {
      if (!open || !active()) return Promise.resolve(reject('unavailable'))
      const copied = copyJsonValue(input)
      if ('failed' in copied || !jsonObject(copied.ok) || Object.keys(copied.ok).length !== 4)
        return Promise.resolve(reject('invalidInput'))
      const value = copied.ok as unknown as typeof input
      if (
        !value.ref ||
        !value.expected ||
        !Array.isArray(value.values) ||
        value.values.length === 0
      )
        return Promise.resolve(reject('invalidInput'))
      const scope = ownScope({ tenant: value.ref.tenant, session: value.ref.session })
      if (!scope || value.expected.ownerGeneration !== generation)
        return Promise.resolve(reject('unavailable'))
      const entries: OwnedLogEntry[] = []
      for (const record of value.values) {
        if (!record || !sameJson(record.ref, value.ref))
          return Promise.resolve(reject('invalidInput'))
        const prepared = prepareToolJournalEntry({ origin: value.origin, value: record })
        if ('invalid' in prepared) return Promise.resolve(reject('invalidInput'))
        entries.push(prepared.entry)
      }
      const checked = checkAppendInput(
        scope.session,
        entries,
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: value.expected.tail },
      )
      if ('failure' in checked) return Promise.resolve(reject('invalidInput'))
      const request = checked.ok
      return track(scope.session, async () => {
        const current = await read(scope, value.ref.callId)
        if (current.kind !== 'view') return current
        if (!resolvePending(current)) return reject('unavailable')
        const seen = recognize(current.prefix, request)
        if (seen === 'same') return current
        if (seen === 'conflict') return reject('conflict')
        if (compareInteger(current.prefix.tail, value.expected.tail) !== 0)
          return reject('tailChanged')
        let tail = current.prefix.tail
        const projected = project(
          {
            ...current.prefix,
            tail: addInteger(tail, entries.length),
            entries: [
              ...current.prefix.entries,
              ...entries.map(entry => ({
                ...entry,
                session: scope.session,
                position: (tail = addInteger(tail, 1)),
              })),
            ],
          },
          value.ref.callId,
        )
        if (projected.kind !== 'view') return reject('conflict')
        if (!active()) return reject('unavailable')
        pending.set(scope.session, { request, scope, call: value.ref.callId })
        let result
        try {
          result = await held.log.append(
            request.session,
            request.entries,
            request.fence,
            request.condition,
          )
        } catch {
          return reject('unavailable')
        }
        if ('failure' in result) {
          if (result.failure === 'unavailable') return reject('unavailable')
          pending.delete(scope.session)
          if (result.failure === 'tailChanged') return reject('tailChanged')
          if (result.failure !== 'alreadyRecorded') return reject('conflict')
        }
        const confirmed = await read(scope, value.ref.callId)
        if (confirmed.kind !== 'view' || recognize(confirmed.prefix, request) !== 'same') {
          if (!('failure' in result))
            pending.set(scope.session, { request, scope, call: value.ref.callId })
          return reject('unavailable')
        }
        pending.delete(scope.session)
        return confirmed
      })
    },
    close(): Promise<void> {
      open = false
      if (released) return Promise.resolve()
      if (closing !== undefined) return closing
      const task = Promise.resolve().then(async () => {
        await Promise.allSettled([...tasks])
        for (const item of pending.values()) {
          const view = await read(item.scope, item.call)
          if (view.kind !== 'view' || !resolvePending(view))
            throw new Error('tool runtime journal retains unresolved writes')
        }
        await held.release()
        released = true
      })
      closing = task
      void task.then(
        () => {
          closing = undefined
        },
        () => {
          closing = undefined
        },
      )
      return task
    },
  })
}
