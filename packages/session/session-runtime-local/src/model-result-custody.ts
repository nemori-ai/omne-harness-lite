import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  captureModelLogValue,
  readModelLogEnvelope,
  type OriginalIssueIdentity,
} from '@omne-harness-lite/model-request-runtime'
import {
  checkAppendInput,
  checkKey,
  compareInteger,
  type SessionLogParticipant,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { sessionFactPayload, readSessionFact } from '@omne-harness-lite/session-runtime'
import type { CoordinationAuthority } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeOptions } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type {
  LocalModelResultCustody,
  ModelResultInput,
  ModelResultStored,
  ModelResultFailure,
} from './model-result-types.ts'
import { stateScope, InvalidStateInput } from './state-values.ts'
import { boundedText, CoordinationRejection } from './coordination-values.ts'
import { runtimeSemantic } from './runtime-values.ts'
import { decodeStoredModelIssue } from './model-invocation.ts'
import {
  CustodyRefusal,
  ownResult,
  isRunPending,
  checkedResultSource,
  sourceCovers,
  resultPosition,
  type OwnedResult,
} from './model-result-values.ts'

interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly log: SessionLogParticipant
}
interface ResultRow {
  session: string
  call: string
  result_key: string
  response: string
  record: string
}
interface Database {
  sr_model_result: ResultRow
  sr_model_issue: { session: string; call: string; dispatch: string; issue: string }
}
export function createModelResultCustody(host: Host) {
  const owner = new ResultCustody(host)
  return Object.freeze({
    operations: Object.freeze<LocalModelResultCustody>({ store: owner.store, read: owner.read }),
    readIn: owner.readIn,
  })
}
class ResultCustody {
  constructor(readonly host: Host) {}
  get limit() {
    return this.host.options.policy.maxRecordBytes
  }
  gate(authority: CoordinationAuthority, value: SessionScope): SessionScope {
    if (authority !== this.host.authority.coordination) throw new CustodyRefusal('denied')
    const scope = stateScope(value)
    if (!tenantIdEquals(scope.tenant, this.host.options.tenant)) throw new CustodyRefusal('denied')
    if (!this.host.options.modelResults) throw new CustodyRefusal('unavailable')
    return scope
  }
  store: LocalModelResultCustody['store'] = async (authority, requested, candidate) => {
    let writing = false,
      scope: SessionScope | undefined,
      input: OwnedResult | undefined
    try {
      scope = this.gate(authority, requested)
      input = ownResult(candidate, scope, this.limit)
      const fixedScope = scope,
        fixedInput = input
      return await this.host.options.storage.atomic(unit =>
        unit.run(() =>
          this.host.authority.withinRun(unit, fixedScope, fixedInput.pending.call.runId, () =>
            this.stage(unit, fixedScope, fixedInput, () => {
              writing = true
            }),
          ),
        ),
      )
    } catch (error) {
      if (error instanceof StorageUnavailable && writing && scope && input)
        return {
          kind: 'unknownCommit',
          scope,
          call: input.pending.call.callId,
          resultKey: input.resultKey,
        }
      return failure(error)
    }
  }
  read: LocalModelResultCustody['read'] = async (authority, requested, call, key) => {
    try {
      const scope = this.gate(authority, requested)
      if (!checkKey(call) || !checkKey(key)) throw new InvalidStateInput()
      return await this.host.options.storage.atomic(unit =>
        unit.run(async () => {
          const row = await this.row(unit, scope, call, key)
          if (!row) return { kind: 'absent' as const }
          const saved = this.decode(row, scope)
          return this.host.authority.withinRun(unit, scope, saved.pending.call.runId!, async () => {
            await this.verifySaved(unit, scope, saved)
            return saved
          })
        }),
      )
    } catch (error) {
      return failure(error)
    }
  }
  async stage(
    unit: StorageUnit,
    scope: SessionScope,
    input: OwnedResult,
    writing: () => void,
  ): Promise<ModelResultStored> {
    const row = await this.row(unit, scope, input.pending.call.callId, input.resultKey)
    if (row) return this.recognize(unit, row, scope, input)
    await this.noAlias(unit, scope, input)
    const original = await this.original(unit, scope, input)
    writing()
    const checked = await this.host.options.modelResults!.source.verifyIn(
      unit,
      scope,
      original,
      input.pending,
    )
    if (checked === 'invalidSource' || checked === 'unavailable') throw new CustodyRefusal(checked)
    if (checked !== 'verified')
      throw new StorageDefect('invalid original result verification outcome')
    const saved = await this.append(unit, scope, input, original)
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('sr_model_result')
        .values({
          session: scope.session,
          call: input.pending.call.callId,
          result_key: input.resultKey,
          response: input.pending.id,
          record: boundedText(saved, this.limit),
        })
        .execute(),
    )
    return saved
  }
  async noAlias(unit: StorageUnit, scope: SessionScope, input: OwnedResult) {
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_result')
        .select('result_key')
        .where('session', '=', scope.session)
        .where('call', '=', input.pending.call.callId)
        .where('response', '=', input.pending.id)
        .executeTakeFirst(),
    )
    if (row) throw new CustodyRefusal('identityConflict')
    const count = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_result')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    )
    if (Number(count.n) >= this.host.options.modelResults!.maxRecords)
      throw new CustodyRefusal('unavailable')
  }
  async original(
    unit: StorageUnit,
    scope: SessionScope,
    input: OwnedResult,
  ): Promise<OriginalIssueIdentity> {
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_issue')
        .select('issue')
        .where('session', '=', scope.session)
        .where('call', '=', input.pending.call.callId)
        .where('dispatch', '=', resultPosition(input.pending.dispatch, this.limit))
        .executeTakeFirst(),
    )
    if (!row) throw new CustodyRefusal('invalidSource')
    const issue = decodeStoredModelIssue(row.issue, this.limit)
    if (!originalMatches(issue.identity, scope, input) || !sourceCovers(input.source, issue.source))
      throw new CustodyRefusal('invalidSource')
    const current = await this.source(unit, scope)
    if (!sourceCovers(current, input.source)) throw new CustodyRefusal('invalidSource')
    const prefix = await this.host.log.readByKeyIn(
      unit,
      this.host.authority.logAccess,
      issue.source,
      issue.identity.originalPosition,
    )
    if ('failure' in prefix) throw new CustodyRefusal('unavailable')
    const entry = prefix.entries.find(item => item.dedupeKey === issue.identity.originalPosition)
    if (!entry) throw new StorageDefect('issued original model dispatch is missing')
    if (!dispatchMatches(entry.payload, issue.identity, input.pending.id))
      throw new CustodyRefusal('invalidSource')
    return issue.identity
  }
  async source(unit: StorageUnit, scope: SessionScope): Promise<SourceToken> {
    const result = await this.host.log.sourceIn(unit, this.host.authority.logAccess, scope)
    if ('failure' in result) throw new CustodyRefusal('unavailable')
    return result.source
  }
  async append(
    unit: StorageUnit,
    scope: SessionScope,
    input: OwnedResult,
    original: OriginalIssueIdentity,
  ): Promise<ModelResultStored> {
    const at = await this.host.options.now()
    if (at === 'unavailable') throw new CustodyRefusal('unavailable')
    const semanticDigest = runtimeSemantic(input.pending, this.limit)
    const request = checkAppendInput(
      scope.session,
      [
        {
          tenant: scope.tenant,
          run: input.pending.call.runId,
          attempt: input.pending.attemptId,
          readKeys: [],
          payload: sessionFactPayload({
            kind: 'result_custodied',
            run: input.pending.call.runId,
            attempt: input.pending.attemptId,
            call: input.pending.call.callId,
            resultKey: input.resultKey,
            semanticDigest,
            at,
          }),
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in request) throw new StorageDefect('invalid internally built custody fact')
    const appended = await this.host.log.appendIn(unit, this.host.authority.logAccess, request.ok)
    if ('failure' in appended) throw new CustodyRefusal('unavailable')
    const position = appended.entries[0]?.position
    if (position === undefined)
      throw new StorageDefect('result custody append missing its position')
    return {
      kind: 'custodied',
      pending: input.pending,
      witness: {
        original,
        response: input.pending.id,
        semanticDigest,
        receipt: {
          ...scope,
          call: input.pending.call.callId,
          resultKey: input.resultKey,
          position,
          source: await this.source(unit, scope),
        },
      },
    }
  }
  /** Private original-Unit seam; the coordinator supplies the actual Run grant before entry. */
  readIn = async (unit: StorageUnit, requested: SessionScope, call: string, key: string) => {
    try {
      unit.assertStorage(this.host.options.storage)
      const scope = this.gate(this.host.authority.coordination, requested)
      if (!checkKey(call) || !checkKey(key)) throw new InvalidStateInput()
      const row = await this.row(unit, scope, call, key)
      if (!row) return { kind: 'absent' as const }
      const saved = this.decode(row, scope)
      await this.verifySaved(unit, scope, saved)
      return saved
    } catch (error) {
      return failure(error)
    }
  }
  row(unit: StorageUnit, scope: SessionScope, call: string, key: string) {
    return unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_model_result')
        .selectAll()
        .where('session', '=', scope.session)
        .where('call', '=', call)
        .where('result_key', '=', key)
        .executeTakeFirst(),
    )
  }
  async recognize(unit: StorageUnit, row: ResultRow, scope: SessionScope, input: OwnedResult) {
    const saved = this.decode(row, scope)
    if (runtimeSemantic(saved.pending, this.limit) !== runtimeSemantic(input.pending, this.limit))
      throw new CustodyRefusal('identityConflict')
    await this.verifySaved(unit, scope, saved)
    return saved
  }
  async verifySaved(unit: StorageUnit, scope: SessionScope, saved: ModelResultStored) {
    const { receipt } = saved.witness
    const prefix = await this.host.log.readSinceIn(
      unit,
      this.host.authority.logAccess,
      { ...receipt.source, tail: receipt.position },
      ExactDecimal.from(receipt.position).add(ExactDecimal.from(-1)).toJsonNumber(),
    )
    if ('failure' in prefix) throw new CustodyRefusal('unavailable')
    const entry = prefix.entries.find(item => compareInteger(item.position, receipt.position) === 0)
    if (!entry) throw new StorageDefect('original custody fact is missing')
    const fact = readSessionFact(entry)
    if (!('kind' in fact) || fact.kind !== 'fact' || fact.fact.kind !== 'result_custodied')
      throw new StorageDefect('original custody fact position mismatch')
    checkCustodyFact(fact.fact, saved)
    const input = ownResult(
      { resultKey: receipt.resultKey, source: receipt.source, pending: saved.pending },
      scope,
      this.limit,
    )
    const original = await this.original(unit, scope, input)
    if (
      runtimeSemantic(original, this.limit) !== runtimeSemantic(saved.witness.original, this.limit)
    )
      throw new StorageDefect('original custody execution proof mismatch')
  }
  decode(row: ResultRow, scope: SessionScope): ModelResultStored {
    try {
      if (Buffer.byteLength(row.record) > this.limit) throw new Error('oversized custody record')
      const read = readJsonStrict(row.record)
      if ('failed' in read) throw new Error('bad custody JSON')
      const saved = read.ok as unknown as ModelResultStored
      validateRecord(saved, row, scope, this.limit)
      return { kind: 'alreadyCustodied', pending: saved.pending, witness: saved.witness }
    } catch {
      throw new StorageDefect('corrupt original model custody record')
    }
  }
}
function checkCustodyFact(
  fact: Extract<
    import('@omne-harness-lite/session-runtime').SessionFact,
    { kind: 'result_custodied' }
  >,
  saved: ModelResultStored,
) {
  const { receipt, original } = saved.witness
  if (
    fact.run !== original.run ||
    original.attempt === undefined ||
    compareInteger(fact.attempt, original.attempt) !== 0 ||
    fact.call !== receipt.call ||
    fact.resultKey !== receipt.resultKey ||
    fact.semanticDigest !== saved.witness.semanticDigest
  )
    throw new StorageDefect('original custody fact contents mismatch')
}
function originalMatches(
  original: OriginalIssueIdentity,
  scope: SessionScope,
  input: OwnedResult,
): boolean {
  return (
    tenantIdEquals(original.tenant, scope.tenant) &&
    original.session === scope.session &&
    original.call === input.pending.call.callId &&
    original.run === input.pending.call.runId &&
    original.attempt !== undefined &&
    compareInteger(original.attempt, input.pending.attemptId) === 0 &&
    compareInteger(original.dispatch, input.pending.dispatch) === 0
  )
}
function dispatchMatches(
  payload: unknown,
  original: OriginalIssueIdentity,
  response: string,
): boolean {
  const read = readModelLogEnvelope(payload)
  if (!('kind' in read) || read.kind !== 'model' || read.envelope.category !== 'record')
    return false
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: read.envelope.value },
  })
  if ('invalidValue' in captured || captured.ok.record?.kind !== 'model_call_dispatched')
    return false
  const record = captured.ok.record
  return (
    record.call === original.call &&
    record.response === response &&
    compareInteger(record.dispatch, original.dispatch) === 0
  )
}
function validateRecord(
  saved: ModelResultStored,
  row: ResultRow,
  scope: SessionScope,
  limit: number,
) {
  if (Object.keys(saved).length !== 3 || saved.kind !== 'custodied' || !isRunPending(saved.pending))
    throw new Error('bad stored result')
  const { witness, pending } = saved
  if (
    Object.keys(witness).length !== 4 ||
    witness.response !== row.response ||
    pending.id !== row.response ||
    runtimeSemantic(pending, limit) !== witness.semanticDigest
  )
    throw new Error('bad custody value witness')
  const input: OwnedResult = { resultKey: row.result_key, source: witness.receipt.source, pending }
  if (!originalMatches(witness.original, scope, input))
    throw new Error('bad original custody identity')
  validateReceipt(witness.receipt, row, scope, limit)
}
function validateReceipt(
  receipt: ModelResultStored['witness']['receipt'],
  row: ResultRow,
  scope: SessionScope,
  limit: number,
) {
  if (
    Object.keys(receipt).length !== 6 ||
    receipt.call !== row.call ||
    receipt.resultKey !== row.result_key ||
    receipt.session !== row.session ||
    !tenantIdEquals(receipt.tenant, scope.tenant)
  )
    throw new Error('bad custody receipt identity')
  const source = checkedResultSource(receipt.source, scope)
  resultPosition(receipt.position, limit)
  if (compareInteger(receipt.position, source.tail) > 0) throw new Error('future custody position')
}
function failure(error: unknown): ModelResultFailure {
  if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
  if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
  if (error instanceof CustodyRefusal) return { failure: error.failure }
  if (error instanceof CoordinationRejection)
    return { failure: error.failure === 'denied' ? 'denied' : 'unavailable' }
  throw error
}
