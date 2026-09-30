import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  ModelCallCreatedRecord,
  ModelCallPayloadRef,
  ModelCallReplyReadyRecord,
} from '@omne-harness-lite/messages'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
import { captureModelLogValue, prepareModelLogEntry, modelLogJsonEqual } from './log-codec.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import { settlementAppendReceipt } from './settlement-receipt.ts'
import { OwnedReadTracker, withOwnedReads } from './service-control.ts'
import type {
  ModelCallContentStore,
  ModelCallContentValue,
  ModelCallPublishPermit,
} from './reference-types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'
import { requestStopAndWait } from './settlement-stop.ts'

/** S-85/S-86: confirm original content before an unfenced, same-prefix publication marker.
 * An uncertain marker retains the original writer; it is never promoted to success. */
export async function publishModelCallContent(input: {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly concurrent: JsonNumber
  readonly reads: OwnedReadTracker
  readonly contentStore: ModelCallContentStore
  readonly content: ModelCallContentValue
  readonly locator: string
  readonly version: string
  readonly at: string
  readonly retainUnknown: (
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
    permit: ModelCallPublishPermit,
  ) => void
  readonly trackTask?: (task: SettlementTask<AppendResult>) => () => void
}): Promise<{ readonly published: true } | { readonly unavailable: true }> {
  const unavailable = { unavailable: true } as const
  const { binding, content, owner } = input
  if (!settlementGenerationCurrent(binding) || owner.admission() !== 'open') return unavailable
  const stored = await input.contentStore.put({
    binding,
    locator: input.locator,
    version: input.version,
    content,
  })
  if (!('ref' in stored)) return unavailable
  // RT12 S-98: the permit keeps ACK cleanup away from this content until the marker outcome
  // is known and the append task actually stopped. An unknown marker hands the permit to the
  // retained writer's owner, which releases it only after recognizing the original batch.
  let retained = false
  try {
    return await publishMarker(input, stored.ref, (registration, task) => {
      retained = true
      input.retainUnknown(registration, task, stored.permit)
    })
  } finally {
    if (!retained) await stored.permit.release()
  }
}

async function publishMarker(
  input: Parameters<typeof publishModelCallContent>[0],
  ref: ModelCallPayloadRef,
  retainUnknown: (registration: SettlementRegistration, task: SettlementTask<AppendResult>) => void,
): Promise<{ readonly published: true } | { readonly unavailable: true }> {
  const unavailable = { unavailable: true } as const
  const { binding, content, owner } = input
  const stored = { ref }
  let record: ModelCallCreatedRecord | ModelCallReplyReadyRecord
  if (content.kind === 'created') {
    if (stored.ref.kind !== 'created' || content.value.status !== 'accepted') return unavailable
    record = {
      kind: 'model_call_created',
      call: content.value.ref.callId,
      creationKey: content.value.creationKey,
      payload: { ...stored.ref, kind: 'created' },
      createdAt: input.at,
    }
  } else {
    if (stored.ref.kind !== 'reply_ready') return unavailable
    record = {
      kind: 'model_call_reply_ready',
      call: content.value.call.callId,
      dispatch: content.value.dispatch,
      response: content.value.id,
      payload: { ...stored.ref, kind: 'reply_ready' },
      readyAt: input.at,
    }
  }
  const run = content.kind === 'created' ? content.value.origin.run : content.value.call.runId
  const attempt =
    content.kind === 'created' ? content.value.origin.attempt : content.value.attemptId
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: record },
  })
  if (!('ok' in captured)) return unavailable
  const prepared = prepareModelLogEntry({
    session: binding.session,
    shell: { tenant: binding.tenant, ...(run === undefined ? {} : { run, attempt }) },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if (!('ok' in prepared)) return unavailable
  const read = await withOwnedReads(
    owner,
    input.concurrent,
    input.reads,
    async registration => await readSettlementPrefix({ binding, registration }),
  )
  if (!('ok' in read) || !('prefix' in read.ok)) return unavailable
  const prefix = read.ok.prefix
  const inspected = inspectCurrentModelLogPrefix({
    session: binding.session,
    tenant: binding.tenant,
    prefix,
  })
  if (!('ok' in inspected)) return unavailable
  const sameCall = inspected.ok.filter(
    item =>
      item.captured.record !== null &&
      'call' in item.captured.record &&
      item.captured.record.call === record.call,
  )
  const sameCreation =
    record.kind === 'model_call_created'
      ? inspected.ok.filter(
          item =>
            item.captured.record?.kind === 'model_call_created' &&
            item.captured.record.creationKey === record.creationKey,
        )
      : []
  const prior = sameCall.find(
    item =>
      item.captured.record?.kind === record.kind &&
      (record.kind === 'model_call_created' ||
        (item.captured.record.kind === 'model_call_reply_ready' &&
          item.captured.record.response === record.response)),
  )
  if (prior !== undefined) {
    const original = prior.captured.record
    const matches =
      original !== null &&
      original.kind === record.kind &&
      'payload' in original &&
      modelLogJsonEqual(original.payload, record.payload) &&
      (record.kind !== 'model_call_created' ||
        (original.kind === 'model_call_created' && original.creationKey === record.creationKey))
    return matches ? { published: true } : unavailable
  }
  if (record.kind === 'model_call_created') {
    if (sameCall.length !== 0 || sameCreation.length !== 0) {
      return unavailable
    }
  } else {
    const dispatch = sameCall.find(
      item =>
        item.captured.record?.kind === 'model_call_dispatched' &&
        item.captured.record.response === record.response &&
        ExactDecimal.from(item.captured.record.dispatch).compare(
          ExactDecimal.from(record.dispatch),
        ) === 0,
    )
    if (
      dispatch === undefined ||
      dispatch.entry.run !== run ||
      ExactDecimal.from(dispatch.entry.attempt ?? 0).compare(ExactDecimal.from(attempt ?? 0)) !==
        0 ||
      sameCall.some(
        item =>
          item.captured.record?.kind === 'model_call_ended' ||
          // RT12 S-98: an acknowledged call admits no new model-copy publication.
          item.captured.record?.kind === 'model_call_acknowledged',
      ) ||
      inspected.ok.some(item => item.captured.response?.id === record.response)
    ) {
      return unavailable
    }
  }
  const grant = owner.acquire(input.concurrent)
  if (!('registration' in grant)) return unavailable
  const registration = grant.registration
  let started = false
  let task: SettlementTask<AppendResult>
  try {
    task = registration.start('controlAppend', async () => {
      if (!settlementGenerationCurrent(binding) || owner.admission() !== 'open')
        return { failure: 'unavailable' } as const
      started = true
      return await binding.log.append(
        binding.session,
        [prepared.ok],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: prefix.tail },
      )
    })
  } catch {
    registration.release()
    return unavailable
  }
  const untrack = input.trackTask?.(task)
  try {
    let receipt: ReturnType<typeof settlementAppendReceipt>
    try {
      receipt = settlementAppendReceipt(await task.completion, 1)
    } catch {
      receipt = null
    }
    if (
      started &&
      (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
    ) {
      retainUnknown(registration, task)
      return unavailable
    }
    try {
      await requestStopAndWait(task)
    } catch {
      retainUnknown(registration, task)
      return unavailable
    }
    registration.release()
    return started && receipt !== null && !('failure' in receipt)
      ? { published: true }
      : unavailable
  } finally {
    untrack?.()
  }
}
