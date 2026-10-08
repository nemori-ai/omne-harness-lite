import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { readJsonStrict, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  checkKey,
  checkSourceToken,
  compareInteger,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StepReceipt } from '@omne-harness-lite/session-runtime'
import { AdmissionFailure, type AdmissionTicket } from './admission-types.ts'
import type { RuntimeOptions, SessionLifecycleStep } from './runtime-types.ts'
import { checkedTicket } from './admission-values.ts'
import { recordedUse } from './admission-sql.ts'
import { CoordinationRejection, boundedText } from './coordination-values.ts'
import { positionText, positionNumber } from './state-values.ts'

interface CoordinationDb {
  sr_call_preparation: { session: string; call: string; preparation: string }
  sr_run_grant: { session: string; run: string; grant: string }
  sr_coordination_step: { session: string; step_key: string; semantic: string; receipt: string }
}
export async function grantRun(
  unit: StorageUnit,
  scope: SessionScope,
  run: string,
  ticket: AdmissionTicket,
  options: RuntimeOptions,
) {
  const grant = boundedText(
    { scope, run, principal: options.principal, ticket },
    options.policy.maxRecordBytes,
  )
  await unit.mutate(tx =>
    narrow<CoordinationDb>(tx)
      .insertInto('sr_run_grant')
      .values({ session: scope.session, run, grant })
      .execute(),
  )
}
/** Original Run authorization survives login expiry. It remains bound to this trusted host identity. */
export async function originalGrant(
  unit: StorageUnit,
  scope: SessionScope,
  run: string,
  options: RuntimeOptions,
) {
  const row = await unit.query(tx =>
    narrow<CoordinationDb>(tx)
      .selectFrom('sr_run_grant')
      .selectAll()
      .where('session', '=', scope.session)
      .where('run', '=', run)
      .executeTakeFirst(),
  )
  if (!row) throw new CoordinationRejection('denied')
  const grant = decodeGrant(row.grant, scope, run, options)
  let original: string | undefined
  try {
    original = await recordedUse(unit, grant.ticket, options.policy)
  } catch (error) {
    if (error instanceof AdmissionFailure)
      throw new StorageDefect('corrupt original Run ticket usage')
    throw error
  }
  if (original !== grant.ticket.target.operationKey)
    throw new StorageDefect('missing original Run ticket usage')
}
function decodeGrant(
  text: string,
  scope: SessionScope,
  run: string,
  options: RuntimeOptions,
): RunGrant {
  try {
    const value = storedJson(text, options.policy.maxRecordBytes) as unknown as RunGrant
    const keys = ['scope', 'run', 'principal', 'ticket']
    if (Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)))
      throw new Error('bad grant fields')
    const ticket = checkedTicket(value.ticket, options.policy)
    if (
      !grantScopeMatches(value, scope, run, options) ||
      !grantSourceMatches(ticket, scope, options)
    )
      throw new Error('bad grant')
    positionText(positionNumber(ticket.target.inputPosition!), options.policy.maxRecordBytes)
    return { ...value, ticket }
  } catch {
    throw new StorageDefect('corrupt original Run admission grant')
  }
}

interface RunGrant {
  scope: SessionScope
  run: string
  principal: string
  ticket: AdmissionTicket
}
function grantScopeMatches(
  value: RunGrant,
  scope: SessionScope,
  run: string,
  options: RuntimeOptions,
) {
  return (
    value.run === run &&
    value.principal === options.principal &&
    value.scope.session === scope.session &&
    tenantIdEquals(value.scope.tenant, scope.tenant)
  )
}
function grantSourceMatches(ticket: AdmissionTicket, scope: SessionScope, options: RuntimeOptions) {
  return (
    ticket.source.centerId === options.source.centerId &&
    ticket.source.accountId === options.source.accountId &&
    ticket.target.purpose === 'startRun' &&
    ticket.target.session === scope.session &&
    tenantIdEquals(ticket.target.tenant, scope.tenant) &&
    checkKey(ticket.source.loginStateHandle) &&
    checkKey(ticket.id) &&
    checkKey(ticket.target.operationKey)
  )
}
function storedJson(text: string, limit: number): JsonValue {
  if (Buffer.byteLength(text) > limit) throw new Error('oversized coordination record')
  const decoded = readJsonStrict(text)
  if ('failed' in decoded) throw new Error('bad coordination JSON')
  return decoded.ok
}

export async function readStep(
  unit: StorageUnit,
  scope: SessionScope,
  key: string,
  semantic: string,
  options: RuntimeOptions,
): Promise<StepReceipt | undefined> {
  const row = await unit.query(tx =>
    narrow<CoordinationDb>(tx)
      .selectFrom('sr_coordination_step')
      .selectAll()
      .where('session', '=', scope.session)
      .where('step_key', '=', key)
      .executeTakeFirst(),
  )
  if (!row) return undefined
  if (row.semantic !== semantic) throw new CoordinationRejection('retryFromFacts')
  const receipt = decodeReceipt(row.receipt, scope, key, options.policy.maxRecordBytes)
  if (receipt.run === null) throw new StorageDefect('Run coordination receipt missing Run')
  await originalGrant(unit, scope, receipt.run, options)
  return receipt
}
function decodeReceipt(text: string, scope: SessionScope, key: string, limit: number): StepReceipt {
  try {
    const receipt = storedJson(text, limit) as unknown as StepReceipt
    checkReceiptIdentity(receipt, scope, key)
    const source = receiptSource(receipt, scope)
    positionText(receipt.position, limit)
    if (compareInteger(receipt.position, source.tail) > 0) throw new Error('future position')
    if (receipt.step === 'startRun' ? receipt.attempt !== null : receipt.attempt === null)
      throw new Error('bad attempt')
    if (receipt.attempt !== null) positionText(receipt.attempt, limit)
    return receipt
  } catch {
    throw new StorageDefect('corrupt original coordination receipt')
  }
}
function checkReceiptIdentity(receipt: StepReceipt, scope: SessionScope, key: string) {
  const keys = ['tenant', 'session', 'run', 'attempt', 'stepKey', 'step', 'position', 'source']
  if (
    !tenantIdEquals(receipt.tenant, scope.tenant) ||
    receipt.session !== scope.session ||
    receipt.stepKey !== key ||
    !checkKey(receipt.run) ||
    !['startRun', 'startAttempt', 'adoptInput', 'prepareCall', 'finish'].includes(receipt.step) ||
    Object.keys(receipt).length !== keys.length ||
    !keys.every(k => Object.hasOwn(receipt, k))
  )
    throw new Error('bad step identity')
}
function receiptSource(receipt: StepReceipt, scope: SessionScope): SourceToken {
  const source = checkSourceToken(receipt.source)
  if (
    'failure' in source ||
    !tenantIdEquals(source.ok.tenant, scope.tenant) ||
    source.ok.session !== scope.session
  )
    throw new Error('bad receipt source')
  return source.ok
}

export async function saveStep(
  unit: StorageUnit,
  receipt: StepReceipt,
  semantic: string,
  options: RuntimeOptions,
) {
  const count = await unit.query(tx =>
    narrow<CoordinationDb>(tx)
      .selectFrom('sr_coordination_step')
      .select(eb => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow(),
  )
  if (Number(count.n) >= options.policy.maxSteps) throw new CoordinationRejection('unavailable')
  await unit.mutate(tx =>
    narrow<CoordinationDb>(tx)
      .insertInto('sr_coordination_step')
      .values({
        session: receipt.session,
        step_key: receipt.stepKey,
        semantic,
        receipt: boundedText(receipt, options.policy.maxRecordBytes),
      })
      .execute(),
  )
}

export async function saveCallPreparation(
  unit: StorageUnit,
  scope: SessionScope,
  step: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>,
  position: StepReceipt['position'],
  options: RuntimeOptions,
) {
  const existing = await unit.query(tx =>
    narrow<CoordinationDb>(tx)
      .selectFrom('sr_call_preparation')
      .select('call')
      .where('session', '=', scope.session)
      .where('call', '=', step.call)
      .executeTakeFirst(),
  )
  if (existing) throw new CoordinationRejection('retryFromFacts')
  const { permit: _permit, ...data } = step
  const preparation = boundedText({ ...scope, ...data, position }, options.policy.maxRecordBytes)
  await unit.mutate(tx =>
    narrow<CoordinationDb>(tx)
      .insertInto('sr_call_preparation')
      .values({ session: scope.session, call: step.call, preparation })
      .execute(),
  )
}
