import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { judgePendingModelResponse } from '@omne-harness-lite/model-response'
import { checkKey, checkSourceToken, compareInteger } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  ModelResultInput,
  ModelResultSource,
  ModelResultStored,
} from './model-result-types.ts'
import type { LocalSessionIngress } from './runtime-types.ts'
import type {
  ModelRuntimeExecutionSource,
  AnchoredInvocationHandle,
  ModelRuntimeExecutionCapture,
  ModelRuntimeCapturedExecution,
} from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'

type Pending = ModelResultInput['pending']
declare const captureBrand: unique symbol
/** Original process-local capture. Copying its fields does not copy the capability. */
export interface CapturedSessionModelReply {
  readonly [captureBrand]: true
  readonly scope: SessionScope
  readonly pending: Pending
}
export interface SessionModelResultSourceOptions {
  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly executionSource: () => ModelRuntimeExecutionSource | undefined
  readonly maxCaptures: number
  /** Same-Unit retention of actual required references. There is no fallback retainer. */
  readonly retainReferencesIn: (
    unit: StorageUnit,
    scope: SessionScope,
    pending: Pending,
  ) => Promise<'retained' | 'unavailable'>
}
export interface SessionModelResultSource {
  readonly source: ModelResultSource
  readonly capture: (
    scope: SessionScope,
    call: string,
  ) => Promise<
    | { readonly captured: CapturedSessionModelReply }
    | { readonly failure: 'invalidInput' | 'unavailable' | 'invalidSource' }
  >
  /** Drop this observation only. It neither stops execution nor authorizes an ACK. */
  readonly release: (
    captured: CapturedSessionModelReply,
  ) => Promise<{ readonly released: true } | { readonly pending: true }>
  /** Recognition of the original full Session value can resolve an unknown transfer observation. */
  readonly confirmCustody: (
    captured: CapturedSessionModelReply,
    ingress: Pick<LocalSessionIngress, 'coordinationAuthority' | 'modelResults'>,
    resultKey: string,
  ) => Promise<{ readonly confirmed: true } | { readonly failure: 'invalidSource' | 'unavailable' }>
  /** Close new capture admission. Existing observations remain owned until explicit release. */
  readonly close: () => { readonly released: true } | { readonly pending: true }
}
export function createSessionModelResultSource(
  options: SessionModelResultSourceOptions,
): SessionModelResultSource {
  const tenant = parseTenantId(options.tenant)
  if (
    !('ok' in tenant) ||
    !Number.isSafeInteger(options.maxCaptures) ||
    options.maxCaptures < 1 ||
    typeof options.executionSource !== 'function' ||
    typeof options.retainReferencesIn !== 'function'
  )
    throw new TypeError('actual model result source and explicit capture capacity required')
  const owner = new ResultSourceOwner(Object.freeze({ ...options, tenant: tenant.ok }))
  return Object.freeze({
    source: Object.freeze({ verifyIn: owner.verifyIn }),
    capture: owner.capture,
    release: owner.release,
    confirmCustody: owner.confirmCustody,
    close: owner.close,
  })
}

type End = Awaited<ReturnType<StorageUnit['observeCompletion']>>
interface CaptureRecord {
  readonly scope: SessionScope
  readonly call: string
  readonly source: ModelRuntimeExecutionSource
  frame?: ModelRuntimeExecutionCapture
  execution?: ModelRuntimeCapturedExecution
  pending?: Pending
  journalGeneration?: string
  handle?: CapturedSessionModelReply
  releasing?: Promise<{ readonly released: true } | { readonly pending: true }>
  units: Set<Promise<End>>
  unknownCompletion: boolean
  revoking: boolean
  recognized: boolean
  returned: boolean
}
class ResultSourceOwner {
  readonly records = new Map<string, CaptureRecord>()
  readonly handles = new WeakMap<CapturedSessionModelReply, CaptureRecord>()
  closed = false
  constructor(readonly options: SessionModelResultSourceOptions) {}
  key(scope: SessionScope, call: string) {
    return JSON.stringify([scope.session, call])
  }
  owned(captured: CapturedSessionModelReply) {
    const record = this.handles.get(captured)
    if (!record) throw new TypeError('not the original model result capture')
    return record
  }
  availableSource(scope: SessionScope, call: string) {
    if (
      this.closed ||
      this.records.size >= this.options.maxCaptures ||
      this.records.has(this.key(scope, call))
    )
      return undefined
    return this.options.executionSource()
  }
  capture: SessionModelResultSource['capture'] = async (requested, call) => {
    const scope = ownedScope(requested)
    if (!scope || !checkKey(call)) return { failure: 'invalidInput' }
    if (!tenantIdEquals(scope.tenant, this.options.tenant)) return { failure: 'invalidSource' }
    const source = this.availableSource(scope, call)
    if (!source) return { failure: 'unavailable' }
    const record: CaptureRecord = {
      scope,
      call,
      source,
      units: new Set(),
      unknownCompletion: false,
      revoking: false,
      recognized: false,
      returned: false,
    }
    this.records.set(this.key(scope, call), record)
    let published = false
    try {
      const framed = source.capture(scope.session)
      if ('unavailable' in framed) return { failure: 'unavailable' }
      record.frame = framed.capture
      const selected = await this.readOriginal(record)
      if ('failure' in selected) return selected
      const handle = Object.freeze({
        scope,
        pending: selected.pending,
      }) as CapturedSessionModelReply
      record.handle = handle
      this.handles.set(handle, record)
      published = true
      return { captured: handle }
    } finally {
      if (!published) this.returnFrame(record)
    }
  }
  async readOriginal(
    record: CaptureRecord,
  ): Promise<
    | { readonly failure: 'invalidSource' | 'unavailable' }
    | { readonly pending: Pending; readonly invocation: AnchoredInvocationHandle }
  > {
    const selected = record.frame!.executions.filter(
      execution => execution.key.callId === record.call,
    )
    const execution = selected.length === 1 ? selected[0] : undefined
    if (!execution || !validExecution(execution, record.scope) || !execution.invocation)
      return { failure: 'invalidSource' } as const
    record.execution = execution
    const outcome = await execution.invocation.outcome
    if (!('replyPending' in outcome)) return { failure: 'unavailable' } as const
    const pending = ownedPending(outcome.replyPending)
    if (!pending || pending.call.callId !== record.call)
      return { failure: 'invalidSource' } as const
    record.pending = pending
    const failure = await this.readJournalIdentity(record, execution)
    if (failure) return failure
    return { pending, invocation: execution.invocation }
  }
  async readJournalIdentity(record: CaptureRecord, execution: ModelRuntimeCapturedExecution) {
    const prefix = await execution.session.log.readPrefix?.()
    if (!prefix || 'failure' in prefix) return { failure: 'unavailable' } as const
    const checked = checkSourceToken('history' in prefix ? prefix.history.source : prefix.source)
    if (
      'failure' in checked ||
      checked.ok.session !== record.scope.session ||
      !tenantIdEquals(checked.ok.tenant, record.scope.tenant)
    )
      return { failure: 'invalidSource' } as const
    record.journalGeneration = checked.ok.journalGeneration
    return undefined
  }
  verifyIn: ModelResultSource['verifyIn'] = async (unit, scope, original, pending) => {
    unit.assertStorage(this.options.storage)
    const record = this.records.get(this.key(scope, original.call))
    if (!record || record.revoking || !record.pending || !record.execution || !record.handle)
      return 'invalidSource'
    if (!sameOriginal(record, scope, original, pending)) return 'invalidSource'
    if (!originalAvailable(record)) return 'invalidSource'
    observeUnit(record, unit)
    const retained = await this.options.retainReferencesIn(unit, record.scope, record.pending)
    if (retained !== 'retained') return 'unavailable'
    return 'verified'
  }
  confirmCustody: SessionModelResultSource['confirmCustody'] = async (
    captured,
    ingress,
    resultKey,
  ) => {
    const record = this.owned(captured)
    if (record.returned) return { failure: 'invalidSource' }
    const saved = await ingress.modelResults.read(
      ingress.coordinationAuthority,
      record.scope,
      record.call,
      resultKey,
    )
    if (!('pending' in saved)) return { failure: 'unavailable' }
    if (
      !matchingReceipt(record, saved, resultKey) ||
      !sameOriginal(record, record.scope, saved.witness.original, saved.pending)
    )
      return { failure: 'invalidSource' }
    record.recognized = true
    return { confirmed: true }
  }
  release: SessionModelResultSource['release'] = async captured => {
    const record = this.owned(captured)
    if (record.returned) return { released: true }
    record.revoking = true
    if (record.releasing) return record.releasing
    const returning = this.releaseOriginal(record)
    record.releasing = returning
    const result = await returning
    if ('pending' in result) delete record.releasing
    return result
  }
  async releaseOriginal(record: CaptureRecord) {
    const ends = await Promise.all(record.units)
    if (!record.recognized && (record.unknownCompletion || ends.includes('unknown')))
      return { pending: true } as const
    this.returnFrame(record)
    return { released: true } as const
  }
  returnFrame(record: CaptureRecord) {
    // No escaped handle remains in this owner when it returns the native frame.
    delete record.execution
    delete record.handle
    record.frame?.release()
    delete record.frame
    record.returned = true
    this.records.delete(this.key(record.scope, record.call))
  }
  close: SessionModelResultSource['close'] = () => {
    this.closed = true
    return this.records.size === 0 ? { released: true } : { pending: true }
  }
}
function observeUnit(record: CaptureRecord, unit: StorageUnit) {
  const completion = unit.observeCompletion()
  if (record.units.has(completion)) return
  record.units.add(completion)
  // Keep active obligations and one unknown marker, rather than completed Unit history.
  void completion.then(end => {
    if (end === 'unknown') record.unknownCompletion = true
    record.units.delete(completion)
  })
}
function originalAvailable(record: CaptureRecord) {
  const execution = record.execution!
  const found = record.source.lookup(execution.key, execution.executionGeneration)
  if ('unknown' in found) return false
  return (
    !found.execution.copyReleased &&
    found.execution.executionGeneration === execution.executionGeneration &&
    found.execution.session === execution.session &&
    found.execution.owner === execution.owner &&
    found.execution.key.callId === record.call &&
    found.execution.key.session === record.scope.session
  )
}
function ownedScope(value: SessionScope): SessionScope | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !copied.ok || typeof copied.ok !== 'object' || Array.isArray(copied.ok))
    return undefined
  const data = copied.ok
  if (!('tenant' in data) || !('session' in data) || Object.keys(data).length !== 2)
    return undefined
  const tenant = parseTenantId(data.tenant),
    session = parseOpaqueIdentifier(data.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session
    ? Object.freeze({ tenant: tenant.ok, session: session.ok })
    : undefined
}
function ownedPending(value: Pending): Pending | undefined {
  const copy = copyJsonValue(value)
  if ('failed' in copy || !('ok' in judgePendingModelResponse(copy.ok))) return undefined
  const pending = copy.ok as unknown as Pending
  return pending.call.runId !== undefined && pending.attemptId !== undefined ? pending : undefined
}
function validExecution(execution: ModelRuntimeCapturedExecution, scope: SessionScope) {
  return (
    execution.key.session === scope.session &&
    execution.session.log.session === scope.session &&
    tenantIdEquals(execution.session.log.tenant, scope.tenant) &&
    !execution.copyReleased
  )
}
function sameOriginal(
  record: CaptureRecord,
  scope: SessionScope,
  original: Parameters<ModelResultSource['verifyIn']>[2],
  pending: Pending,
) {
  const expected = record.pending
  return (
    expected !== undefined &&
    sameScope(scope, record.scope) &&
    sameScope(original, record.scope) &&
    sameCall(record.call, original, expected) &&
    modelLogJsonEqual(pending, expected)
  )
}
function sameScope(value: SessionScope, expected: SessionScope) {
  return value.session === expected.session && tenantIdEquals(value.tenant, expected.tenant)
}
function matchingReceipt(record: CaptureRecord, saved: ModelResultStored, resultKey: string) {
  const { receipt } = saved.witness
  return (
    sameScope(receipt, record.scope) &&
    sameScope(receipt.source, record.scope) &&
    receipt.source.journalGeneration === record.journalGeneration &&
    receipt.call === record.call &&
    receipt.resultKey === resultKey &&
    saved.witness.response === record.pending?.id
  )
}
function sameCall(
  call: string,
  original: Parameters<ModelResultSource['verifyIn']>[2],
  expected: Pending,
) {
  return (
    original.call === call &&
    original.run === expected.call.runId &&
    original.attempt !== undefined &&
    compareInteger(original.attempt, expected.attemptId!) === 0 &&
    compareInteger(original.dispatch, expected.dispatch) === 0
  )
}
