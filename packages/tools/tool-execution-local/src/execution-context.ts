import { setTimeout as yieldToTimers } from 'node:timers/promises'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ContextRead, ContextReader } from '@omne-harness-lite/runtime-context'
import {
  captureToolJournalValue,
  type ExecutionOrigin,
  type ExecutionRef,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import type {
  createRuntimeJournal,
  RuntimeJournalView,
  RuntimeJournalFailure,
} from './runtime-journal.ts'
import { jsonObject } from './json-values.ts'

type RejectedRead = Extract<ContextRead, { kind: 'rejected' }>
type ReaderInput = {
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  readonly reader: ContextReader
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly isOpen: () => boolean
  readonly attempts: number
}
const rejected = (reason: RejectedRead['reason']): RejectedRead => ({ kind: 'rejected', reason })

function ownKeys(supplied: readonly string[]): readonly string[] | undefined {
  const copy = copyJsonValue(supplied)
  if (
    'failed' in copy ||
    !Array.isArray(copy.ok) ||
    copy.ok.some(key => !('ok' in parseOpaqueIdentifier(key, 'ContextKey'))) ||
    new Set(copy.ok).size !== copy.ok.length
  )
    return
  return copy.ok as readonly string[]
}

function captureSourceRead(
  result: ContextRead,
  keys: readonly string[],
): RejectedRead | { readonly kind: 'values'; readonly values: readonly unknown[] } {
  const captured = copyJsonValue(result)
  if ('failed' in captured || !jsonObject(captured.ok) || Object.keys(captured.ok).length !== 2)
    return rejected('sourceUnavailable')
  if (captured.ok.kind === 'rejected') {
    const reason = captured.ok.reason
    return typeof reason === 'string' &&
      [
        'invalidInput',
        'notAuthorized',
        'missingRegistration',
        'viewChanged',
        'sourceUnavailable',
        'ownerStopped',
        'unavailable',
      ].includes(reason)
      ? rejected(reason as RejectedRead['reason'])
      : rejected('sourceUnavailable')
  }
  if (captured.ok.kind !== 'values') return rejected('sourceUnavailable')
  const values = sourceValues(captured.ok.values, keys)
  return values ? { kind: 'values', values } : rejected('sourceUnavailable')
}

function sourceValues(values: unknown, keys: readonly string[]): readonly unknown[] | undefined {
  if (!Array.isArray(values)) return
  if (
    values.length !== keys.length ||
    values.some(item => !jsonObject(item) || !keys.includes(item.key as string))
  )
    return
  return values
}

function prepareContextRead(
  input: ReaderInput,
  view: RuntimeJournalView | RuntimeJournalFailure,
  values: readonly unknown[],
):
  | RejectedRead
  | {
      readonly kind: 'prepared'
      readonly expected: RuntimeJournalView['prefix']
      readonly record: Extract<ToolJournalPayload, { kind: 'execution_context_read' }>
    } {
  if (!input.isOpen()) return rejected('ownerStopped')
  if (view.kind !== 'view') return rejected('unavailable')
  const execution = view.executions.get(input.ref.callId)
  if (!execution) return rejected('unavailable')
  if (execution.terminal) return rejected('ownerStopped')
  const record = captureToolJournalValue({
    revision: 1,
    ref: input.ref,
    kind: 'execution_context_read',
    readIndex: execution.contextReads.length + 1,
    values,
  })
  if ('invalid' in record || record.kind !== 'execution_context_read')
    return rejected('sourceUnavailable')
  return { kind: 'prepared', expected: view.prefix, record }
}

async function commitSourceRead(
  input: ReaderInput,
  values: readonly unknown[],
): Promise<ContextRead> {
  for (let attempt = 0; attempt < input.attempts; attempt++) {
    const view = await input.journal.read(
      { tenant: input.ref.tenant, session: input.ref.session },
      input.ref.callId,
    )
    const prepared = prepareContextRead(input, view, values)
    if (prepared.kind === 'rejected') return prepared
    const committed = await input.journal.commit({
      ref: input.ref,
      origin: input.origin,
      expected: prepared.expected,
      values: [prepared.record],
    })
    if (!input.isOpen()) return rejected('ownerStopped')
    if (committed.kind === 'view') {
      if (committed.executions.get(input.ref.callId)?.terminal) return rejected('ownerStopped')
      return { kind: 'values', values: prepared.record.values }
    }
    if (committed.reason !== 'tailChanged') return rejected('unavailable')
  }
  return rejected('unavailable')
}

/** Runtime-owned reader: persist the actual source values before exposing them to an executor. */
export function createExecutionContextReader(input: ReaderInput): ContextReader {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1)
    throw new TypeError('positive context commit attempts required')
  let queue: Promise<unknown> = Promise.resolve()
  return Object.freeze({
    read(supplied: readonly string[]): Promise<ContextRead> {
      const keys = ownKeys(supplied)
      if (!keys) return Promise.resolve(rejected('invalidInput'))
      const task = queue.then(async (): Promise<ContextRead> => {
        try {
          // Give due maintenance a turn before the reader checks current access.
          await yieldToTimers(0)
          if (!input.isOpen()) return rejected('ownerStopped')
          const result = await input.reader.read(keys)
          if (!input.isOpen()) return rejected('ownerStopped')
          const captured = captureSourceRead(result, keys)
          if (captured.kind === 'rejected') return captured
          return await commitSourceRead(input, captured.values)
        } catch {
          return rejected(input.isOpen() ? 'unavailable' : 'ownerStopped')
        }
      })
      queue = task.then(
        () => undefined,
        () => undefined,
      )
      return task
    },
  })
}
