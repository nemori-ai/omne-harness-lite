import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  ModelCallCreatedRecord,
  ModelCallPayloadRef,
  ModelCallReplyReadyRecord,
} from '@omne-harness-lite/messages'
import type { AppendResult, OwnedLogEntry } from '@omne-harness-lite/session-log'
import { captureModelLogValue, prepareModelLogEntry, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { inspectCurrentModelLogPrefix } from '@omne-harness-lite/model-request-runtime'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from './settlement-prefix.ts'
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
    entry: OwnedLogEntry,
  ) => void
  readonly trackTask?: (task: SettlementTask<AppendResult>) => () => void
}): Promise<{ readonly published: true } | { readonly unavailable: true }> {
  const unavailable = { unavailable: true } as const
  const { binding, owner } = input
  if (!settlementGenerationCurrent(binding) || owner.admission() !== 'open') return unavailable
  // RT12 S-98 (review S3): admit the marker from the complete prefix before any content is
  // written, so a refused publication never leaves a model copy behind it.
  const admitted = await admitMarker(input)
  if (admitted === undefined) return unavailable
  const stored = await input.contentStore.put({
    binding,
    locator: input.locator,
    version: input.version,
    content: input.content,
  })
  if (!('ref' in stored)) return unavailable
  // The permit keeps ACK cleanup away from this content until the marker outcome is known and
  // the append task actually stopped. An unknown marker hands the permit to the retained
  // writer's owner, which releases it only after recognizing the original batch.
  let retained = false
  try {
    return await publishMarker(input, admitted, stored.ref, (registration, task, entry) => {
      retained = true
      input.retainUnknown(registration, task, stored.permit, entry)
    })
  } finally {
    if (!retained) await stored.permit.release()
  }
}

interface MarkerAdmission {
  readonly prefix: SettlementPrefix
  /** The same marker already in this prefix: only its payload is still to be compared. */
  readonly prior: ModelCallCreatedRecord | ModelCallReplyReadyRecord | undefined
}

/** The marker's identity as the content fixes it, before any payload reference exists. */
function markerIdentity(content: ModelCallContentValue) {
  return content.kind === 'created'
    ? {
        kind: 'model_call_created' as const,
        call: content.value.ref.callId,
        creationKey: content.value.creationKey,
        run: content.value.origin.run,
        attempt: content.value.origin.attempt,
      }
    : {
        kind: 'model_call_reply_ready' as const,
        call: content.value.call.callId,
        dispatch: content.value.dispatch,
        response: content.value.id,
        run: content.value.call.runId,
        attempt: content.value.attemptId,
      }
}

/** S-85/S-86/S-98 marker admission over one owned complete prefix; no content is touched. */
async function admitMarker(
  input: Parameters<typeof publishModelCallContent>[0],
): Promise<MarkerAdmission | undefined> {
  const { binding, content, owner } = input
  if (content.kind === 'created' && content.value.status !== 'accepted') return undefined
  const marker = markerIdentity(content)
  const read = await withOwnedReads(
    owner,
    input.concurrent,
    input.reads,
    async registration => await readSettlementPrefix({ binding, registration }),
  )
  if (!('ok' in read) || !('prefix' in read.ok)) return undefined
  const prefix = read.ok.prefix
  const inspected = inspectCurrentModelLogPrefix({
    session: binding.session,
    tenant: binding.tenant,
    prefix,
  })
  if (!('ok' in inspected)) return undefined
  const sameCall = recordsForCall(inspected.ok, marker)
  const priorEntry = priorMarker(sameCall, marker)
  const prior = priorEntry?.captured.record
  if (prior !== undefined && prior !== null) return admitPrior(prefix, prior, marker)
  return marker.kind === 'model_call_created'
    ? admitCreation(prefix, inspected.ok, sameCall, marker)
    : admitReply(prefix, inspected.ok, sameCall, marker)
}

type MarkerIdentity = ReturnType<typeof markerIdentity>
type PrefixEntries = Extract<
  ReturnType<typeof inspectCurrentModelLogPrefix>,
  { readonly ok: unknown }
>['ok']
type MarkerRecord = ModelCallCreatedRecord | ModelCallReplyReadyRecord

function recordsForCall(entries: PrefixEntries, marker: MarkerIdentity): PrefixEntries {
  return entries.filter(
    item =>
      item.captured.record !== null &&
      'call' in item.captured.record &&
      item.captured.record.call === marker.call,
  )
}

function priorMarker(
  sameCall: PrefixEntries,
  marker: MarkerIdentity,
): PrefixEntries[number] | undefined {
  return sameCall.find(
    item =>
      item.captured.record?.kind === marker.kind &&
      (marker.kind === 'model_call_created' ||
        (item.captured.record.kind === 'model_call_reply_ready' &&
          item.captured.record.response === marker.response)),
  )
}

function admitPrior(
  prefix: SettlementPrefix,
  prior: NonNullable<PrefixEntries[number]['captured']['record']>,
  marker: MarkerIdentity,
): MarkerAdmission | undefined {
  if (prior.kind !== 'model_call_created' && prior.kind !== 'model_call_reply_ready')
    return undefined
  if (marker.kind === 'model_call_created' && prior.kind === 'model_call_created')
    return prior.creationKey === marker.creationKey ? { prefix, prior } : undefined
  return { prefix, prior }
}

function admitCreation(
  prefix: SettlementPrefix,
  entries: PrefixEntries,
  sameCall: PrefixEntries,
  marker: Extract<MarkerIdentity, { readonly kind: 'model_call_created' }>,
): MarkerAdmission | undefined {
  const sameCreation = entries.some(
    item =>
      item.captured.record?.kind === 'model_call_created' &&
      item.captured.record.creationKey === marker.creationKey,
  )
  return sameCall.length !== 0 || sameCreation ? undefined : { prefix, prior: undefined }
}

function matchesDispatch(
  item: PrefixEntries[number],
  marker: Extract<MarkerIdentity, { readonly kind: 'model_call_reply_ready' }>,
): boolean {
  return (
    item.captured.record?.kind === 'model_call_dispatched' &&
    item.captured.record.response === marker.response &&
    ExactDecimal.from(item.captured.record.dispatch).compare(ExactDecimal.from(marker.dispatch)) ===
      0
  )
}

function admitReply(
  prefix: SettlementPrefix,
  entries: PrefixEntries,
  sameCall: PrefixEntries,
  marker: Extract<MarkerIdentity, { readonly kind: 'model_call_reply_ready' }>,
): MarkerAdmission | undefined {
  const dispatch = sameCall.find(item => matchesDispatch(item, marker))
  if (
    dispatch === undefined ||
    dispatch.entry.run !== marker.run ||
    ExactDecimal.from(dispatch.entry.attempt ?? 0).compare(
      ExactDecimal.from(marker.attempt ?? 0),
    ) !== 0 ||
    sameCall.some(
      item =>
        item.captured.record?.kind === 'model_call_ended' ||
        // RT12 S-98: an acknowledged call admits no new model-copy publication.
        item.captured.record?.kind === 'model_call_acknowledged',
    ) ||
    entries.some(item => item.captured.response?.id === marker.response)
  )
    return undefined
  return { prefix, prior: undefined }
}

async function publishMarker(
  input: Parameters<typeof publishModelCallContent>[0],
  admitted: MarkerAdmission,
  ref: ModelCallPayloadRef,
  retainUnknown: (
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
    entry: OwnedLogEntry,
  ) => void,
): Promise<{ readonly published: true } | { readonly unavailable: true }> {
  const unavailable = { unavailable: true } as const
  const { binding, content, owner } = input
  const { prefix, prior } = admitted
  const marker = markerIdentity(content)
  const record = publicationRecord(marker, ref, input)
  if (record === undefined) return unavailable
  // The same original marker recognizes only with the very same payload reference.
  if (prior !== undefined) return recognizePublication(prior, record, unavailable)
  const prepared = preparePublication(marker, record, binding)
  if (prepared === undefined || !('ok' in prepared)) return unavailable
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
    if (unknownPublication(started, receipt)) {
      retainUnknown(registration, task, prepared.ok)
      return unavailable
    }
    try {
      await requestStopAndWait(task)
    } catch {
      retainUnknown(registration, task, prepared.ok)
      return unavailable
    }
    registration.release()
    return publicationResult(started, receipt, unavailable)
  } finally {
    untrack?.()
  }
}

function publicationRecord(
  marker: MarkerIdentity,
  ref: ModelCallPayloadRef,
  input: Parameters<typeof publishModelCallContent>[0],
): MarkerRecord | undefined {
  if (marker.kind === 'model_call_created') {
    if (ref.kind !== 'created') return undefined
    return {
      kind: marker.kind,
      call: marker.call,
      creationKey: marker.creationKey,
      payload: { ...ref, kind: 'created' },
      createdAt: input.at,
    }
  } else {
    if (ref.kind !== 'reply_ready') return undefined
    return {
      kind: marker.kind,
      call: marker.call,
      dispatch: marker.dispatch,
      response: marker.response,
      payload: { ...ref, kind: 'reply_ready' },
      readyAt: input.at,
    }
  }
}

function preparePublication(
  marker: MarkerIdentity,
  record: MarkerRecord,
  binding: SettlementLogBinding,
): ReturnType<typeof prepareModelLogEntry> | undefined {
  const { run, attempt } = marker
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: record },
  })
  if (!('ok' in captured)) return undefined
  return prepareModelLogEntry({
    session: binding.session,
    shell: { tenant: binding.tenant, ...(run === undefined ? {} : { run, attempt }) },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
}

function unknownPublication(
  started: boolean,
  receipt: ReturnType<typeof settlementAppendReceipt>,
): boolean {
  return (
    started && (receipt === null || ('failure' in receipt && receipt.failure === 'unavailable'))
  )
}

function publicationResult(
  started: boolean,
  receipt: ReturnType<typeof settlementAppendReceipt>,
  unavailable: { readonly unavailable: true },
): { readonly published: true } | { readonly unavailable: true } {
  return started && receipt !== null && !('failure' in receipt) ? { published: true } : unavailable
}

function recognizePublication(
  prior: MarkerRecord,
  record: MarkerRecord,
  unavailable: { readonly unavailable: true },
): { readonly published: true } | { readonly unavailable: true } {
  return modelLogJsonEqual(prior.payload, record.payload) ? { published: true } : unavailable
}
