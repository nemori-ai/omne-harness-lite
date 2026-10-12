import { narrow, type ReadTx, type Storage } from '@omne-harness-lite/storage'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { writeJsonLossless, readJsonStrict } from '@omne-harness-lite/content-blocks'
import { judgeModelInvocationRecord } from '@omne-harness-lite/messages'
import type {
  ModelExecutionCallRef,
  ModelExecutionObligations,
} from '@omne-harness-lite/model-request-runtime'
import type { RetentionRow } from './reference-content.ts'
import { borrowModelObligations } from './model-obligation-borrow.ts'

export function createModelExecutionObligations(input: {
  readonly storage: Storage
  readonly tenant: TenantId
  readonly maxPageSize: number
}): ModelExecutionObligations<ModelExecutionCallRef> {
  const tenant = parseTenantId(input.tenant)
  if (!('ok' in tenant) || !Number.isSafeInteger(input.maxPageSize) || input.maxPageSize < 1)
    throw new TypeError('invalid Model obligation source configuration')
  const fixed = Object.freeze(tenant.ok)
  const { storage, maxPageSize } = input
  return Object.freeze<ModelExecutionObligations<ModelExecutionCallRef>>({
    async withObligations(request, use) {
      const requested = parseTenantId(request.tenant)
      if (!('ok' in requested) || !tenantIdEquals(requested.ok, fixed)) return { kind: 'denied' }
      const limit = request.limit
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPageSize)
        return { kind: 'unavailable' }
      return borrowModelObligations(storage, tx => nativePages(tx, fixed, limit), use)
    },
  })
}

interface ObligationRow {
  readonly session: string
  readonly call: string
  readonly phase: RetentionRow['phase'] | null
  readonly acknowledgement: string | null
}

function nativePages(tx: ReadTx, tenant: TenantId, limit: number) {
  const db = narrow<{
    model_call_retention: RetentionRow
    mr_original_issue: { tenant: string; session: string; call: string }
  }>(tx)
  const keys = db
    .selectFrom('model_call_retention')
    .select(['session', 'call'])
    .where('organization', '=', tenant.organization)
    .where('account', '=', tenant.account)
    .union(
      db
        .selectFrom('mr_original_issue')
        .select(['session', 'call'])
        .where('tenant', '=', writeJsonLossless(tenant)),
    )
  let after: Pick<ObligationRow, 'session' | 'call'> | undefined
  return async () => {
    let query = db
      .selectFrom(keys.as('originals'))
      .leftJoin('model_call_retention as retained', join =>
        join
          .onRef('retained.session', '=', 'originals.session')
          .onRef('retained.call', '=', 'originals.call')
          .on('retained.organization', '=', tenant.organization)
          .on('retained.account', '=', tenant.account),
      )
      .select([
        'originals.session as session',
        'originals.call as call',
        'retained.phase as phase',
        'retained.acknowledgement as acknowledgement',
      ])
    if (after) {
      const cursor = after
      query = query.where(eb =>
        eb.or([
          eb('originals.session', '>', cursor.session),
          eb.and([
            eb('originals.session', '=', cursor.session),
            eb('originals.call', '>', cursor.call),
          ]),
        ]),
      )
    }
    const rows = await query
      .orderBy('originals.session')
      .orderBy('originals.call')
      .limit(limit)
      .execute()
    const refs: ModelExecutionCallRef[] = []
    for (const row of rows) {
      const ref = decodeRetention(row, tenant)
      if (!ref) return { kind: 'unavailable' as const }
      refs.push(ref)
    }
    after = rows.at(-1) ?? after
    const [first, ...rest] = refs
    return first
      ? {
          kind: 'page' as const,
          refs: [first, ...rest] as readonly [ModelExecutionCallRef, ...ModelExecutionCallRef[]],
        }
      : { kind: 'end' as const }
  }
}

function decodeRetention(row: ObligationRow, tenant: TenantId): ModelExecutionCallRef | undefined {
  const session = parseOpaqueIdentifier(row.session, 'SessionRef')
  const call = parseOpaqueIdentifier(row.call, 'ModelCallId')
  if (!('ok' in session) || !('ok' in call) || !validAcknowledgement(row)) return
  return Object.freeze({ tenant, session: session.ok, callId: call.ok })
}

function validAcknowledgement(row: ObligationRow): boolean {
  if (row.phase === null) return row.acknowledgement === null
  if (row.phase === 'retained') return row.acknowledgement === null
  if (!['retiring', 'acknowledged', 'released'].includes(row.phase) || row.acknowledgement === null)
    return false
  const parsed = readJsonStrict(row.acknowledgement)
  if (!('ok' in parsed)) return false
  const judged = judgeModelInvocationRecord(parsed.ok)
  return (
    'ok' in judged && judged.ok.kind === 'model_call_acknowledged' && judged.ok.call === row.call
  )
}
