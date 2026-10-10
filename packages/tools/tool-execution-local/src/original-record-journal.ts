import { randomUUID } from 'node:crypto'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  tenantIdEquals,
  parseTenantId,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'
import {
  addInteger,
  compareInteger,
  type OwnedLogEntry,
  type JsonNumber,
} from '@omne-harness-lite/session-log'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import {
  prepareToolJournalEntry,
  type ToolExecutionJob,
  type ToolExecutionRecords,
  type ToolOriginalIssueIdentity,
  type ToolRuntimeOriginalIssueDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  RuntimeJournal,
  RuntimeJournalFailure,
  RuntimeJournalView,
} from './execution-journal.ts'
import { decodeToolOriginal, type OriginalRow } from './tool-obligations.ts'
import { createToolExecutionTransitions } from './execution-transitions.ts'
import { sameJson } from './json-values.ts'

type Journal = RuntimeJournal
type Request = Parameters<Journal['commit']>[0]
type Ref = Request['ref']
type PendingWrite = {
  readonly ref: Ref
  readonly entries: readonly OwnedLogEntry[]
  readonly positions: readonly JsonNumber[]
  readonly completion: ReturnType<StorageUnit['observeCompletion']>
}
const recordKey = (ref: Ref) => JSON.stringify([ref.session, ref.callId])
function sameBatch(view: RuntimeJournalView, write: PendingWrite) {
  return write.entries.every((proposed, index) => {
    const actual = view.prefix.entries.find(entry => entry.dedupeKey === proposed.dedupeKey)
    if (!actual) return false
    const { session: _session, position, ...entry } = actual
    return compareInteger(position, write.positions[index]!) === 0 && sameJson(entry, proposed)
  })
}

const rejected = (reason: RuntimeJournalFailure['reason']): RuntimeJournalFailure => ({
  kind: 'rejected',
  reason,
})
class RecordFailure extends Error {
  constructor(readonly reason: RuntimeJournalFailure['reason']) {
    super(reason)
  }
}

/** Own call records only. A recovered record handle cannot issue or consume an execution. */
export function createOriginalRecordJournal(
  input: Pick<ToolRuntimeOriginalIssueDependencies, 'tenant' | 'originalIssue'>,
): Journal {
  const { originalIssue: support } = input
  const parsed = parseTenantId(input.tenant)
  if (!('ok' in parsed)) throw new TypeError('invalid Tool pool tenant')
  const tenant = parsed.ok
  const generation = randomUUID()
  let open = true
  const tasks = new Set<Promise<unknown>>()
  const pending = new Map<string, PendingWrite>()
  let closing: Promise<void> | undefined
  const current = () => open
  function track<T>(task: Promise<T>) {
    tasks.add(task)
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    )
    return task
  }
  async function originalIn(unit: StorageUnit, ref: Ref) {
    unit.assertStorage(support.storage)
    const row = await unit.query(tx =>
      narrow<{ tool_original_issue: OriginalRow }>(tx)
        .selectFrom('tool_original_issue')
        .selectAll()
        .where('tenant', '=', writeJsonLossless(tenant))
        .where('session', '=', ref.session)
        .where('call', '=', ref.callId)
        .executeTakeFirst(),
    )
    if (!row) return
    const original = decodeToolOriginal(row)
    if (!original || !sameJson(original.identity.ref, ref))
      throw new StorageDefect('invalid original Tool record')
    const job = Object.freeze({}) as ToolExecutionJob
    const records = createToolExecutionTransitions({
      support,
      identity: original.identity,
      job,
      isOpen: current,
      async verifyIn(candidate) {
        candidate.assertStorage(support.storage)
        const found = await candidate.query(tx =>
          narrow<{ tool_original_issue: OriginalRow }>(tx)
            .selectFrom('tool_original_issue')
            .selectAll()
            .where('tenant', '=', row.tenant)
            .where('session', '=', row.session)
            .where('call', '=', row.call)
            .executeTakeFirst(),
        )
        return (
          found !== undefined &&
          found.identity === row.identity &&
          found.intent === row.intent &&
          found.claim === row.claim
        )
      },
    })
    return { ...original, records, job }
  }
  async function readIn(unit: StorageUnit, ref: Ref): ReturnType<Journal['read']> {
    const original = await originalIn(unit, ref)
    if (!original) {
      const source = await support.log.sourceIn(unit, support.access, {
        tenant,
        session: ref.session,
      })
      return 'failure' in source
        ? rejected('unavailable')
        : {
            kind: 'view',
            prefix: {
              scope: { tenant, session: ref.session },
              ownerGeneration: generation,
              tail: source.source.tail,
              entries: [],
            },
            executions: new Map(),
          }
    }
    const read = await original.records.readCurrentIn(unit)
    if (read.kind !== 'found') return rejected('unavailable')
    const { session: _session, position: _position, ...intent } = read.history.intent.entry
    if (!sameJson(intent, original.intent))
      throw new StorageDefect('original Tool intent differs from its index')
    return {
      kind: 'view',
      prefix: {
        scope: { tenant, session: ref.session },
        ownerGeneration: generation,
        tail: read.source.tail,
        entries: read.entries,
      },
      executions: new Map([[ref.callId, read.history]]),
    }
  }
  async function confirmedIn(unit: StorageUnit, ref: Ref): ReturnType<Journal['read']> {
    const key = recordKey(ref)
    const write = pending.get(key)
    if (write && (await write.completion) === 'rolledBack') pending.delete(key)
    const view = await readIn(unit, ref)
    if (!pending.has(key)) return view
    if (view.kind !== 'view' || !write) return rejected('unavailable')
    if (!sameBatch(view, write)) return rejected('unavailable')
    pending.delete(key)
    return view
  }
  async function readAccepted(ref: Ref): ReturnType<Journal['read']> {
    try {
      return await support.storage.atomic(unit => confirmedIn(unit, ref))
    } catch (error) {
      if (error instanceof StorageUnavailable) return rejected('unavailable')
      throw error
    }
  }
  async function read(ref: Ref): ReturnType<Journal['read']> {
    if (!current() || !tenantIdEquals(ref.tenant, tenant)) return rejected('unavailable')
    const result = await readAccepted(ref)
    return current() ? result : rejected('unavailable')
  }
  async function terminalValues(
    unit: StorageUnit,
    identity: ToolOriginalIssueIdentity,
    values: Request['values'],
  ) {
    type Transition = Parameters<ToolExecutionRecords['stageTransitionIn']>[2][number]
    if (
      !values.every(
        (value): value is Transition =>
          value.kind !== 'execution_intended' &&
          value.kind !== 'execution_started' &&
          value.kind !== 'delivery_confirmed',
      )
    )
      throw new RecordFailure('invalidInput')
    if (!values.some(value => value.kind === 'execution_ended')) return values
    const classification = await support.classifyTerminalIn(unit, identity)
    if (classification.kind !== 'classified') throw new RecordFailure('unavailable')
    return values.map(value => {
      if (value.kind !== 'execution_ended') return value
      const { late: _late, ...account } = value.account
      return {
        ...value,
        account: { ...account, ...(classification.late ? { late: true as const } : {}) },
      }
    })
  }
  async function commitIn(unit: StorageUnit, request: Request) {
    if ((await confirmedIn(unit, request.ref)).kind !== 'view')
      throw new RecordFailure('unavailable')
    const original = await originalIn(unit, request.ref)
    if (!original || !sameJson(original.identity.origin, request.origin))
      throw new RecordFailure('conflict')
    const source = await support.log.sourceIn(unit, support.access, {
      tenant,
      session: request.ref.session,
    })
    if ('failure' in source) throw new RecordFailure('unavailable')
    if (compareInteger(source.source.tail, request.expected.tail) !== 0)
      throw new RecordFailure('tailChanged')
    const transitions = await terminalValues(unit, original.identity, request.values)
    const entries = transitions.map(value => {
      const prepared = prepareToolJournalEntry({ origin: request.origin, value })
      if ('invalid' in prepared) throw new RecordFailure('invalidInput')
      return prepared.entry
    })
    const write: PendingWrite = {
      ref: request.ref,
      entries,
      positions: entries.map((_, index) => addInteger(request.expected.tail, index + 1)),
      completion: unit.observeCompletion(),
    }
    pending.set(recordKey(request.ref), write)
    const result = await original.records.stageTransitionIn(unit, original.job, transitions)
    if (result.kind !== 'staged' && result.kind !== 'recognized')
      throw new RecordFailure(result.kind === 'conflict' ? 'conflict' : 'unavailable')
    pending.set(recordKey(request.ref), { ...write, positions: result.positions })
  }
  async function commit(request: Request): ReturnType<Journal['commit']> {
    if (!current()) return rejected('unavailable')
    const captured = copyJsonValue(request)
    if ('failed' in captured) return rejected('invalidInput')
    const fixed = captured.ok as unknown as Request
    if (
      !current() ||
      fixed.expected.ownerGeneration !== generation ||
      !tenantIdEquals(fixed.ref.tenant, tenant)
    )
      return rejected('unavailable')
    try {
      await support.storage.atomic(unit => commitIn(unit, fixed))
      return readAccepted(fixed.ref)
    } catch (error) {
      if (error instanceof RecordFailure) return rejected(error.reason)
      if (error instanceof StorageUnavailable) return rejected('unavailable')
      throw error
    }
  }
  return Object.freeze<Journal>({
    generation,
    isCurrent: current,
    read(scope, call) {
      const parsed = parseOpaqueIdentifier(call, 'CallId')
      return 'ok' in parsed
        ? track(read({ ...scope, callId: parsed.ok }))
        : Promise.resolve(rejected('invalidInput'))
    },
    commit: request => track(commit(request)),
    close() {
      if (closing) return closing
      open = false
      closing = (async () => {
        await Promise.allSettled([...tasks])
        for (const write of pending.values()) await readAccepted(write.ref)
        if (pending.size > 0) throw new Error('unresolved Tool record writes')
      })()
      void closing.catch(() => {
        closing = undefined
      })
      return closing
    },
  })
}
