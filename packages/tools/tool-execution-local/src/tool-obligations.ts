import { narrow, type ReadTx, type Storage } from '@omne-harness-lite/storage'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseTenantId, tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import { checkLogPayload } from '@omne-harness-lite/session-log'
import {
  captureToolJournalValue,
  prepareToolJournalEntry,
  type ExecutionRef,
  type ToolExecutionObligations,
} from '@omne-harness-lite/tool-execution-runtime'
import { jsonObject, sameJson } from './json-values.ts'
import { borrowToolObligations } from './tool-obligation-borrow.ts'

export interface OriginalRow {
  tenant: string
  session: string
  call: string
  identity: string
  intent: string
  claim: string
  consumed: number
}

/** Trusted root construction; possession grants only this tenant's original-record read. */
export function createToolExecutionObligations(input: {
  readonly storage: Storage
  readonly tenant: TenantId
  readonly maxPageSize: number
}): ToolExecutionObligations<ExecutionRef> {
  const tenant = parseTenantId(input.tenant)
  if (!('ok' in tenant) || !Number.isSafeInteger(input.maxPageSize) || input.maxPageSize < 1)
    throw new TypeError('invalid Tool obligation source configuration')
  const { storage, maxPageSize } = input
  const key = writeJsonLossless(tenant.ok)
  return Object.freeze<ToolExecutionObligations<ExecutionRef>>({
    async withObligations(request, use) {
      const requested = parseTenantId(request.tenant)
      if (!('ok' in requested) || !tenantIdEquals(requested.ok, tenant.ok))
        return { kind: 'denied' }
      const limit = request.limit
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPageSize)
        return { kind: 'unavailable' }
      return borrowToolObligations(storage, tx => nativePages(tx, key, limit), use)
    },
  })
}

function nativePages(tx: ReadTx, tenant: string, limit: number) {
  let after: Pick<OriginalRow, 'session' | 'call'> | undefined
  return async () => {
    let query = narrow<{ tool_original_issue: OriginalRow }>(tx)
      .selectFrom('tool_original_issue')
      .selectAll()
      .where('tenant', '=', tenant)
    if (after) {
      const cursor = after
      query = query.where(eb =>
        eb.or([
          eb('session', '>', cursor.session),
          eb.and([eb('session', '=', cursor.session), eb('call', '>', cursor.call)]),
        ]),
      )
    }
    const rows = await query.orderBy('session').orderBy('call').limit(limit).execute()
    const refs: ExecutionRef[] = []
    for (const row of rows) {
      const original = decodeToolOriginal(row)
      if (!original) return { kind: 'unavailable' as const }
      refs.push(original.identity.ref)
    }
    after = rows.at(-1) ?? after
    const [first, ...rest] = refs
    return first
      ? {
          kind: 'page' as const,
          refs: [first, ...rest] as readonly [ExecutionRef, ...ExecutionRef[]],
        }
      : { kind: 'end' as const }
  }
}

export function decodeToolOriginal(row: OriginalRow) {
  const decoded = readRow(row)
  if (!decoded) return
  const { identity, intent } = decoded
  const value = storedIntent(intent)
  if (!value || !sameCoordinates(row, value.ref)) return
  const prepared = prepareToolJournalEntry({ origin: value.origin, value })
  if ('invalid' in prepared || !sameJson(prepared.entry, intent)) return
  const generation = identity.executionGeneration
  if (typeof generation !== 'string' || generation.length === 0) return
  return sameJson(identity, {
    ref: value.ref,
    origin: value.origin,
    adoption: value.input.submission.adoption,
    executionGeneration: generation,
    originalPosition: prepared.entry.dedupeKey,
  })
    ? {
        identity: {
          ref: value.ref,
          origin: value.origin,
          adoption: value.input.submission.adoption,
          executionGeneration: generation,
          originalPosition: prepared.entry.dedupeKey!,
        },
        intent,
      }
    : undefined
}

function readRow(row: OriginalRow) {
  if (typeof row.claim !== 'string' || row.claim.length === 0 || ![0, 1].includes(row.consumed))
    return
  const identity = readJsonStrict(row.identity),
    intent = readJsonStrict(row.intent)
  if (
    'failed' in identity ||
    'failed' in intent ||
    !jsonObject(identity.ok) ||
    !jsonObject(intent.ok)
  )
    return
  return { identity: identity.ok, intent: intent.ok }
}

function storedIntent(intent: JsonObject) {
  const payload = checkLogPayload(intent.payload)
  if (
    'failure' in payload ||
    payload.kind !== 'fact' ||
    payload.payload.owner !== 'tool-execution-runtime' ||
    payload.payload.version !== '1'
  )
    return
  return originalValue(payload.payload.value)
}

function originalValue(envelope: JsonValue) {
  if (
    !jsonObject(envelope) ||
    envelope.format !== 'tool-runtime/1' ||
    envelope.category !== 'execution'
  )
    return
  const value = captureToolJournalValue(envelope.value)
  if ('invalid' in value || value.kind !== 'execution_intended' || !jsonObject(value.input)) return
  const submission = value.input.submission
  if (!jsonObject(submission) || typeof submission.adoption !== 'string') return
  return {
    ...value,
    input: { ...value.input, submission: { ...submission, adoption: submission.adoption } },
  }
}

function sameCoordinates(row: OriginalRow, ref: ExecutionRef) {
  return (
    row.tenant === writeJsonLossless(ref.tenant) &&
    row.session === ref.session &&
    row.call === ref.callId
  )
}
