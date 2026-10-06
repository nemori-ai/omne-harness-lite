import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { ContextRead, ContextReader } from '@omne-harness-lite/runtime-context'
import {
  captureToolJournalValue,
  type ExecutionOrigin,
  type ExecutionRef,
} from '@omne-harness-lite/tool-execution-runtime'
import type { createRuntimeJournal } from './runtime-journal.ts'
import { jsonObject } from './json-values.ts'

/** Runtime-owned reader: persist the actual source values before exposing them to an executor. */
export function createExecutionContextReader(input: {
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  readonly reader: ContextReader
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly isOpen: () => boolean
  readonly attempts: number
}): ContextReader {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1)
    throw new TypeError('positive context commit attempts required')
  let queue: Promise<unknown> = Promise.resolve()
  const rejected = (reason: Extract<ContextRead, { kind: 'rejected' }>['reason']): ContextRead => ({
    kind: 'rejected',
    reason,
  })
  return Object.freeze({
    read(supplied: readonly string[]): Promise<ContextRead> {
      const copy = copyJsonValue(supplied)
      if (
        'failed' in copy ||
        !Array.isArray(copy.ok) ||
        copy.ok.some(key => !('ok' in parseOpaqueIdentifier(key, 'ContextKey'))) ||
        new Set(copy.ok).size !== copy.ok.length
      )
        return Promise.resolve(rejected('invalidInput'))
      const keys = copy.ok as readonly string[]
      const task = queue.then(async (): Promise<ContextRead> => {
        try {
          if (!input.isOpen()) return rejected('ownerStopped')
          const result = await input.reader.read(keys)
          if (!input.isOpen()) return rejected('ownerStopped')
          const captured = copyJsonValue(result)
          if (
            'failed' in captured ||
            !jsonObject(captured.ok) ||
            Object.keys(captured.ok).length !== 2
          )
            return rejected('sourceUnavailable')
          if (captured.ok.kind === 'rejected') {
            const reason = captured.ok.reason
            return typeof reason === 'string' &&
              [
                'invalidInput',
                'notAuthorized',
                'missingRegistration',
                'sourceUnavailable',
                'ownerStopped',
                'unavailable',
              ].includes(reason)
              ? rejected(reason as Extract<ContextRead, { kind: 'rejected' }>['reason'])
              : rejected('sourceUnavailable')
          }
          if (captured.ok.kind !== 'values' || !Array.isArray(captured.ok.values))
            return rejected('sourceUnavailable')
          const values = captured.ok.values
          if (
            values.length !== keys.length ||
            values.some(item => !jsonObject(item) || !keys.includes(item.key as string))
          )
            return rejected('sourceUnavailable')
          for (let attempt = 0; attempt < input.attempts; attempt++) {
            const view = await input.journal.read(
              { tenant: input.ref.tenant, session: input.ref.session },
              input.ref.callId,
            )
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
            const committed = await input.journal.commit({
              ref: input.ref,
              origin: input.origin,
              expected: view.prefix,
              values: [record],
            })
            if (!input.isOpen()) return rejected('ownerStopped')
            if (committed.kind === 'view') {
              if (committed.executions.get(input.ref.callId)?.terminal)
                return rejected('ownerStopped')
              return {
                kind: 'values',
                values: record.values,
              }
            }
            if (committed.reason !== 'tailChanged') return rejected('unavailable')
          }
          return rejected('unavailable')
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
