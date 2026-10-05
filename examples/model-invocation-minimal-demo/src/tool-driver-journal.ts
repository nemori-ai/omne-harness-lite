import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  addInteger,
  checkAppendInput,
  compareInteger,
  type AppendRequest,
  type CheckedPrefix,
  type LogEntry,
  type OwnedLogEntry,
  type SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import { captureDriverValue, prepareDriverEntry } from './tool-driver-codec.ts'
import { readToolDriverHistory, type DriverHistory } from './tool-driver-history.ts'
import type { DriverValue } from './tool-driver-types.ts'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import {
  captureToolJournalValue,
  prepareToolJournalEntry,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'

type Borrow = Extract<
  Awaited<ReturnType<SessionLogOwnerOperations['borrow']>>,
  { kind: 'borrowed' }
>
export type DriverCommitResult =
  | { readonly kind: 'committed'; readonly prefix: CheckedPrefix }
  | {
      readonly kind: 'rejected'
      readonly reason: 'invalidInput' | 'conflict' | 'tailChanged' | 'unavailable'
    }
const rejected = (reason: Extract<DriverCommitResult, { kind: 'rejected' }>['reason']) =>
  ({ kind: 'rejected', reason }) as const

function sameEntry(actual: LogEntry, expected: OwnedLogEntry): boolean {
  const { session: _session, position: _position, ...value } = actual
  return modelLogJsonEqual(value, expected)
}

/** Recognition requires the original complete batch, consecutively and with exact values. */
function recognize(
  prefix: CheckedPrefix,
  entries: readonly OwnedLogEntry[],
): 'same' | 'absent' | 'conflict' {
  const first = prefix.entries.findIndex(item => item.dedupeKey === entries[0]?.dedupeKey)
  if (first >= 0)
    return entries.every((entry, offset) => {
      const actual = prefix.entries[first + offset]
      return actual !== undefined && sameEntry(actual, entry)
    })
      ? 'same'
      : 'conflict'
  return entries.some(entry => prefix.entries.some(actual => actual.dedupeKey === entry.dedupeKey))
    ? 'conflict'
    : 'absent'
}

function batch(
  scope: SessionScope,
  value: DriverValue,
  companion?: OwnedLogEntry,
): readonly OwnedLogEntry[] | undefined {
  const prepared = prepareDriverEntry(scope, value)
  if ('invalid' in prepared) return
  const needsMessage = value.kind === 'attempt_adopted' || value.kind === 'action_denied'
  if (needsMessage !== (companion !== undefined)) return
  if (value.kind === 'attempt_adopted' && companion?.dedupeKey !== value.startedMessageKey) return
  // Message identity, protocol and origin are checked by the common candidate projection below.
  return companion === undefined ? [prepared.entry] : [companion, prepared.entry]
}

function currentForWrite(history: DriverHistory, value: DriverValue): boolean {
  if (
    value.kind !== 'actions_completed' &&
    value.kind !== 'action_denial_intended' &&
    value.kind !== 'continuation_requested'
  )
    return true
  const run = history.runs.get(value.origin.run)
  return (
    run !== undefined &&
    run.end === undefined &&
    run.latest !== undefined &&
    compareInteger(run.latest.value.attempt, value.origin.attempt) === 0
  )
}

/** One coordinator borrow. Its lifetime is independent of observers and of the runner plugin. */
async function createJournal(input: {
  readonly owner: SessionLogOwnerOperations
  readonly access: SessionAccess | RecoveryAccess
  readonly scope: SessionScope
}) {
  const copied = copyJsonValue(input.scope)
  if ('failed' in copied) return rejected('invalidInput')
  const scope = copied.ok as unknown as SessionScope
  const acquired = await input.owner.borrow(input.access, scope)
  if (acquired.kind !== 'borrowed') return acquired
  const held: Borrow = acquired
  let open = true,
    released = false,
    closing: Promise<void> | undefined
  let pending: AppendRequest | undefined
  let sequence: Promise<unknown> = Promise.resolve()

  async function read(): Promise<DriverHistory | { readonly unavailable: true }> {
    let result
    try {
      result = await held.log.readSince(scope.session, 0)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in result) return { unavailable: true }
    return readToolDriverHistory({ scope, ownerGeneration: held.ownerGeneration, ...result })
  }
  async function resolvePending(history: DriverHistory): Promise<boolean> {
    if (pending === undefined) return true
    if (recognize(history.prefix, pending.entries) !== 'same') return false
    pending = undefined
    return true
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = sequence.then(operation)
    sequence = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  function write(captured: AppendRequest, value?: DriverValue): Promise<DriverCommitResult> {
    return serialize(async () => {
      const history = await read()
      if ('unavailable' in history || !(await resolvePending(history)))
        return rejected('unavailable')
      const found = recognize(history.prefix, captured.entries)
      if (found === 'same') return { kind: 'committed', prefix: history.prefix }
      if (found === 'conflict' || (value !== undefined && !currentForWrite(history, value)))
        return rejected('conflict')
      let tail = history.prefix.tail
      const appended = captured.entries.map(entry => ({
        ...entry,
        session: scope.session,
        position: (tail = addInteger(tail, 1)),
      }))
      const candidate = readToolDriverHistory({
        ...history.prefix,
        tail,
        entries: [...history.prefix.entries, ...appended],
      })
      if ('unavailable' in candidate) return rejected('conflict')
      if (
        value?.kind === 'action_denied' &&
        !modelLogJsonEqual(
          candidate.models.byKey.get(captured.entries[0]!.dedupeKey!)?.captured.message,
          value.message,
        )
      )
        return rejected('conflict')
      const request: AppendRequest = {
        ...captured,
        condition: { kind: 'tailEquals', tail: history.prefix.tail },
      }
      pending = request
      let result
      try {
        result = await held.log.append(
          request.session,
          request.entries,
          request.fence,
          request.condition,
        )
      } catch {
        return rejected('unavailable')
      }
      if ('failure' in result) {
        if (result.failure === 'unavailable') return rejected('unavailable')
        // This was the only unresolved append. A definite rejection does not erase an older unknown.
        pending = undefined
        if (result.failure === 'tailChanged') return rejected('tailChanged')
        if (result.failure !== 'alreadyRecorded') return rejected('conflict')
      }
      const confirmed = await read()
      if ('unavailable' in confirmed || recognize(confirmed.prefix, request.entries) !== 'same') {
        // Even a successful receipt is not a replacement for the common business projection.
        if (!('failure' in result)) pending = request
        return rejected('unavailable')
      }
      pending = undefined
      return { kind: 'committed', prefix: confirmed.prefix }
    })
  }

  return Object.freeze({
    kind: 'journal' as const,
    ownerGeneration: held.ownerGeneration,
    read(): Promise<DriverHistory | { readonly unavailable: true }> {
      if (!open) return Promise.resolve({ unavailable: true })
      return serialize(async () => {
        const history = await read()
        return 'unavailable' in history || !(await resolvePending(history))
          ? { unavailable: true }
          : history
      })
    },
    commit(supplied: unknown, companion?: OwnedLogEntry): Promise<DriverCommitResult> {
      if (!open) return Promise.resolve(rejected('unavailable'))
      const value = captureDriverValue(supplied)
      if ('invalid' in value) return Promise.resolve(rejected('invalidInput'))
      const ownCompanion = companion === undefined ? undefined : copyJsonValue(companion)
      if (ownCompanion !== undefined && 'failed' in ownCompanion)
        return Promise.resolve(rejected('invalidInput'))
      const entries = batch(scope, value, ownCompanion?.ok as unknown as OwnedLogEntry | undefined)
      if (entries === undefined) return Promise.resolve(rejected('invalidInput'))
      const execution =
        'origin' in value ? value.origin : value.kind === 'attempt_adopted' ? value : undefined
      // Capture both the owned value and the external message before the first await.
      const captured = checkAppendInput(
        scope.session,
        entries,
        execution === undefined
          ? { kind: 'unfenced' }
          : { kind: 'fenced', run: execution.run, attempt: execution.attempt },
        { kind: 'unconditional' },
      )
      if ('failure' in captured || captured.ok.entries.some(entry => entry.dedupeKey === undefined))
        return Promise.resolve(rejected('invalidInput'))
      return write(captured.ok, value)
    },
    commitTool(
      supplied: ToolJournalPayload,
      companion?: OwnedLogEntry,
    ): Promise<DriverCommitResult> {
      if (!open) return Promise.resolve(rejected('unavailable'))
      const value = captureToolJournalValue(supplied)
      if (
        'invalid' in value ||
        (value.kind !== 'delivery_ready' && value.kind !== 'delivery_confirmed')
      )
        return Promise.resolve(rejected('invalidInput'))
      const execution = value.kind === 'delivery_confirmed'
      if (execution !== (companion !== undefined)) return Promise.resolve(rejected('invalidInput'))
      const ownCompanion = companion === undefined ? undefined : copyJsonValue(companion)
      if (ownCompanion && 'failed' in ownCompanion) return Promise.resolve(rejected('invalidInput'))
      return serialize(async () => {
        const history = await read()
        if ('unavailable' in history || !(await resolvePending(history)))
          return rejected('unavailable')
        const facts = history.calls.get(value.ref.callId)
        if (!facts || facts.route.kind !== 'execution') return rejected('conflict')
        const entry = prepareToolJournalEntry({ value, origin: facts.origin })
        if ('invalid' in entry) return rejected('invalidInput')
        const entries =
          companion === undefined
            ? [entry.entry]
            : [ownCompanion!.ok as unknown as OwnedLogEntry, entry.entry]
        const captured = checkAppendInput(
          scope.session,
          entries,
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        if ('failure' in captured || captured.ok.entries.some(item => item.dedupeKey === undefined))
          return rejected('invalidInput')
        return { request: captured.ok }
      }).then(prepared => ('request' in prepared ? write(prepared.request) : prepared))
    },
    close(): Promise<void> {
      open = false
      if (released) return Promise.resolve()
      if (closing !== undefined) return closing
      const task = serialize(async () => {
        if (pending !== undefined) {
          const history = await read()
          if ('unavailable' in history || !(await resolvePending(history)))
            throw new Error('tool driver retains an unresolved batch')
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

/** Business advancement uses a current coordinator binding. */
export async function createToolDriverJournal(input: {
  readonly owner: SessionLogOwnerOperations
  readonly access: SessionAccess
  readonly scope: SessionScope
}) {
  const opened = await createJournal(input)
  if (opened.kind !== 'journal') return opened
  const { commitTool: _maintenanceOnly, ...journal } = opened
  return Object.freeze(journal)
}

/** Maintenance receives only the already-admitted B/C write surface, never Run advancement. */
export async function createToolDeliveryJournal(input: {
  readonly owner: SessionLogOwnerOperations
  readonly recovery: RecoveryAccess
  readonly scope: SessionScope
}) {
  const opened = await createJournal({
    owner: input.owner,
    scope: input.scope,
    access: input.recovery,
  })
  if (opened.kind !== 'journal') return opened
  return Object.freeze({
    kind: 'journal' as const,
    ownerGeneration: opened.ownerGeneration,
    read: opened.read,
    commit: opened.commitTool,
    close: opened.close,
  })
}
