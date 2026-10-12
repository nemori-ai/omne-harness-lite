import {
  captureModelLogValue,
  prepareModelLogEntry,
  settlementAppendReceipt,
  settlementGenerationCurrent,
  requestStopAndWait,
} from '@omne-harness-lite/model-request-runtime'
import type {
  ControlAppendInput,
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendFence, AppendResult } from '@omne-harness-lite/session-log'

/** S-68/S-70: one actual SL3 unconditional commit, with the original Run fence if present.
 * An unconfirmed effect is transferred to the caller's owner; it is never called absent. */
export async function appendControlRecord(
  input: ControlAppendInput,
): Promise<{ readonly appended: true } | { readonly unavailable: true }> {
  const { binding, owner, record } = input
  if (
    (input.run === undefined) !== (input.attempt === undefined) ||
    owner.admission() !== 'open' ||
    !settlementGenerationCurrent(binding)
  )
    return { unavailable: true }
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: record },
  })
  if ('invalidValue' in captured) return { unavailable: true }
  const prepared = prepareModelLogEntry({
    session: binding.session,
    shell: {
      tenant: binding.tenant,
      ...(input.run === undefined ? {} : { run: input.run, attempt: input.attempt }),
    },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in prepared) return { unavailable: true }
  const grant = owner.acquire(input.concurrent)
  if ('unavailable' in grant) return { unavailable: true }
  const registration = grant.registration
  const fence: AppendFence =
    input.run !== undefined && input.attempt !== undefined
      ? { kind: 'fenced', run: input.run, attempt: input.attempt }
      : { kind: 'unfenced' }
  return runControlAppend(input, binding, owner, prepared, registration, fence)
}

type ControlAppendOutcome = { readonly appended: true } | { readonly unavailable: true }
type PreparedControlRecord = Extract<
  ReturnType<typeof prepareModelLogEntry>,
  { readonly ok: unknown }
>
type ControlReceipt = ReturnType<typeof settlementAppendReceipt>

async function runControlAppend(
  input: ControlAppendInput,
  binding: SettlementLogBinding,
  owner: SettlementOwner,
  prepared: PreparedControlRecord,
  registration: SettlementRegistration,
  fence: AppendFence,
): Promise<ControlAppendOutcome> {
  let started = false
  let task: SettlementTask<AppendResult>
  try {
    task = registration.start('controlAppend', async () => {
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(binding))
        return { failure: 'unavailable' } as const
      started = true
      return await binding.log.append(binding.session, [prepared.ok], fence, {
        kind: 'unconditional',
      })
    })
  } catch {
    registration.release()
    return { unavailable: true }
  }
  const untrack = input.trackTask?.(task)

  async function rejectedCompletion(): Promise<ControlAppendOutcome> {
    try {
      if (started) {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        await requestStopAndWait(task)
        registration.release()
      } catch {
        input.retainUnknown(registration, task)
      }
      return { unavailable: true }
    } finally {
      untrack?.()
    }
  }

  async function receivedCompletion(raw: unknown): Promise<ControlAppendOutcome> {
    try {
      const receipt = settlementAppendReceipt(raw, 1)
      if (
        started &&
        (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
      ) {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        await requestStopAndWait(task)
      } catch {
        input.retainUnknown(registration, task)
        return { unavailable: true }
      }
      try {
        registration.release()
      } catch {
        return { unavailable: true }
      }
      return completedControlAppend(started, receipt)
    } finally {
      untrack?.()
    }
  }

  let raw: unknown
  try {
    raw = await task.completion
  } catch {
    return rejectedCompletion()
  }
  return receivedCompletion(raw)
}

function completedControlAppend(started: boolean, receipt: ControlReceipt): ControlAppendOutcome {
  return started && receipt !== null && !('failure' in receipt)
    ? { appended: true }
    : { unavailable: true }
}
