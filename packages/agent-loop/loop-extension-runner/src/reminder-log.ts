import type { LogPrefixView, SystemReminderMessage } from '@omne-harness-lite/messages'
import {
  captureModelLogValue,
  encodeModelLogKey,
  inspectModelLogEntry,
  modelLogJsonEqual,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { executionFence, type RunnerExecution } from './conclusion-codec.ts'
import type { RunnerReminderAppend, RunnerReminderRead } from './run-pass.ts'
import type { RunnerLogBinding, RunnerTaskOwner } from './task-owner.ts'

export interface RunnerReminderLogAdapter {
  readonly inspect: (message: SystemReminderMessage) => Promise<RunnerReminderRead>
  readonly append: (
    message: SystemReminderMessage,
    execution: RunnerExecution,
  ) => Promise<RunnerReminderAppend>
}

/** The caller supplies an authoritative complete prefix at each message operation. */
export function createRunnerReminderLogAdapter(input: {
  readonly log: SessionLog
  readonly binding: RunnerLogBinding
  readonly owner: RunnerTaskOwner
  readonly readMessagePrefix: () => Promise<LogPrefixView | { readonly unavailable: true }>
}): RunnerReminderLogAdapter {
  const { log, binding, owner, readMessagePrefix } = input
  const session = parseOpaqueIdentifier(binding.session, 'SessionRef')
  if (!('ok' in session)) throw new TypeError('Invalid runner reminder session binding')
  const sessionRef = session.ok

  async function prefix(): Promise<LogPrefixView | { readonly unavailable: true }> {
    const started = owner.start({ kind: 'read', execute: readMessagePrefix })
    if ('unavailable' in started) return { unavailable: true }
    try {
      return await started.completion
    } catch {
      return { unavailable: true }
    }
  }

  async function inspect(message: SystemReminderMessage): Promise<RunnerReminderRead> {
    const key = encodeModelLogKey({ kind: 'message', message: message.id })
    if (!('ok' in key) || owner.hasUnknown(binding, key.ok)) return { kind: 'unavailable' }
    const currentPrefix = await prefix()
    if (!Array.isArray(currentPrefix)) return { kind: 'unavailable' }
    const started = owner.start({ kind: 'read', execute: () => log.readByKey(sessionRef, key.ok) })
    if ('unavailable' in started) return { kind: 'unavailable' }
    try {
      const read = await started.completion
      if (!('entries' in read) || read.entries.length > 1) return { kind: 'unavailable' }
      const actual = read.entries[0]
      if (actual === undefined) return { kind: 'absent' }
      const decoded = inspectModelLogEntry({
        session: binding.session,
        tenant: binding.tenant,
        entry: actual,
        purpose: { kind: 'message' },
        messagePrefix: currentPrefix,
      })
      if (!('ok' in decoded)) return { kind: 'conflict' }
      return modelLogJsonEqual(decoded.ok.captured.message, message)
        ? { kind: 'same' }
        : { kind: 'conflict' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  async function append(
    message: SystemReminderMessage,
    execution: RunnerExecution,
  ): Promise<RunnerReminderAppend> {
    const currentPrefix = await prefix()
    if (!Array.isArray(currentPrefix)) return { kind: 'unavailable' }
    const captured = captureModelLogValue({
      category: 'message',
      input: { kind: 'value', value: message },
    })
    if (!('ok' in captured)) return { kind: 'unavailable' }
    const prepared = prepareModelLogEntry({
      session: binding.session,
      shell: {
        tenant: binding.tenant,
        ...(execution.kind === 'withRun' ? { run: execution.run, attempt: execution.attempt } : {}),
      },
      captured: captured.ok,
      purpose: { kind: 'message' },
      messagePrefix: currentPrefix,
    })
    if (!('ok' in prepared)) return { kind: 'unavailable' }
    const started = owner.start({
      kind: 'append',
      candidate: {
        kind: 'reminder',
        binding,
        entry: prepared.ok,
        message,
        messagePrefix: currentPrefix,
      },
      execute: () =>
        log.append(sessionRef, [prepared.ok], executionFence(execution), { kind: 'unconditional' }),
      unknown: result => 'failure' in result && result.failure === 'unavailable',
    })
    if ('unavailable' in started) return { kind: 'unavailable' }
    try {
      const result = await started.completion
      if ('positions' in result) {
        const read = await inspect(message)
        return read.kind === 'same'
          ? { kind: 'confirmed' }
          : read.kind === 'conflict'
            ? { kind: 'alreadyRecorded' }
            : { kind: 'unavailable' }
      }
      return appendFailure(result)
    } catch {
      return { kind: 'unknown' }
    }
  }

  return Object.freeze({ inspect, append })
}

function appendFailure(result: { readonly failure: string }): RunnerReminderAppend {
  if (result.failure === 'unavailable') return { kind: 'unknown' }
  if (result.failure === 'attemptSuperseded') return { kind: 'attemptSuperseded' }
  if (result.failure === 'alreadyRecorded') return { kind: 'alreadyRecorded' }
  return { kind: 'unavailable' }
}
