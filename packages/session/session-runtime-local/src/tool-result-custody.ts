import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { copyJsonValue, readJsonStrict } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  checkAppendInput,
  checkKey,
  compareInteger,
  type SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import {
  projectToolJournal,
  type ToolResultCustodyEvidence,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  readSessionFact,
  sessionFactPayload,
  type CoordinationAuthority,
} from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeOptions } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type {
  LocalToolResultCustody,
  ToolResultInput,
  ToolResultStored,
} from './tool-result-types.ts'
import { ownToolResult, object, ToolCustodyRefusal } from './tool-custody-values.ts'
import { stateScope, InvalidStateInput } from './state-values.ts'
import { boundedText, CoordinationRejection } from './coordination-values.ts'
import { sourceCovers, CustodyRefusal } from './model-result-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly log: SessionLogParticipant
}
interface Row {
  session: string
  call: string
  result_key: string
  record: string
}
interface Database {
  sr_tool_result: Row
  sr_tool_issue: { session: string; call: string; identity: string }
}
export function createToolResultCustody(host: Host) {
  const owner = new ToolCustody(host)
  return Object.freeze({
    operations: Object.freeze<LocalToolResultCustody>({ store: owner.store, read: owner.read }),
    readIn: owner.readIn,
  })
}
class ToolCustody {
  constructor(readonly host: Host) {}
  text(value: unknown) {
    return runtimeSemantic(value, this.host.options.policy.maxRecordBytes)
  }
  gate(authority: CoordinationAuthority, value: SessionScope) {
    if (authority !== this.host.authority.coordination) throw new ToolCustodyRefusal('denied')
    const scope = stateScope(value)
    if (!tenantIdEquals(scope.tenant, this.host.options.tenant))
      throw new ToolCustodyRefusal('denied')
    if (!this.host.options.toolResults) throw new ToolCustodyRefusal('unavailable')
    return scope
  }
  store: LocalToolResultCustody['store'] = async (authority, requested, candidate) => {
    let writing = false,
      input: ToolResultInput | undefined,
      scope: SessionScope | undefined
    try {
      scope = this.gate(authority, requested)
      input = ownToolResult(candidate, scope, this.host.options.policy.maxRecordBytes)
      const fixedScope = scope,
        fixedInput = input
      return await this.host.options.storage.atomic(unit =>
        this.host.authority.withinRun(unit, fixedScope, fixedInput.original.origin.run, () =>
          this.stage(unit, fixedScope, fixedInput, () => {
            writing = true
          }),
        ),
      )
    } catch (error) {
      if (error instanceof StorageUnavailable && writing && scope && input)
        return {
          kind: 'unknownCommit',
          scope,
          call: input.original.ref.callId,
          resultKey: input.resultKey,
        }
      return failure(error)
    }
  }
  read: LocalToolResultCustody['read'] = async (authority, requested, call, key) => {
    try {
      const scope = this.gate(authority, requested)
      if (!checkKey(call) || !checkKey(key)) throw new InvalidStateInput()
      return await this.host.options.storage.atomic(async unit => {
        const row = await this.row(unit, scope, call, key)
        if (!row) return { kind: 'absent' as const }
        const saved = this.decode(row, scope)
        return this.host.authority.withinRun(
          unit,
          scope,
          saved.witness.original.origin.run,
          async () => {
            await this.verifySaved(unit, scope, saved)
            return saved
          },
        )
      })
    } catch (error) {
      return failure(error)
    }
  }
  row(unit: StorageUnit, scope: SessionScope, call: string, key?: string) {
    return unit.query(tx => {
      let query = narrow<Database>(tx)
        .selectFrom('sr_tool_result')
        .selectAll()
        .where('session', '=', scope.session)
        .where('call', '=', call)
      if (key !== undefined) query = query.where('result_key', '=', key)
      return query.executeTakeFirst()
    })
  }
  readIn = async (unit: StorageUnit, scope: SessionScope, call: string, key: string) => {
    unit.assertStorage(this.host.options.storage)
    const row = await this.row(unit, scope, call, key)
    if (!row) return { kind: 'absent' as const }
    const saved = this.decode(row, scope)
    await this.verifySaved(unit, scope, saved)
    return saved
  }
  async stage(unit: StorageUnit, scope: SessionScope, input: ToolResultInput, writing: () => void) {
    const row = await this.row(unit, scope, input.original.ref.callId)
    if (row) {
      const saved = this.decode(row, scope)
      if (
        row.result_key !== input.resultKey ||
        this.text(saved.result.terminal) !== this.text(input.terminal) ||
        this.text(saved.witness.original) !== this.text(input.original)
      )
        throw new ToolCustodyRefusal('identityConflict')
      await this.verifySaved(unit, scope, saved)
      return saved
    }
    await this.verifyOriginal(unit, scope, input)
    await this.capacity(unit)
    writing()
    const verified = await this.host.options.toolResults!.source.verifyIn(
      unit,
      input.original,
      input.terminal,
    )
    if ('failure' in verified) throw new ToolCustodyRefusal(verified.failure)
    const evidence = this.evidence(verified.verified, input)
    const saved = await this.append(unit, scope, input, evidence)
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('sr_tool_result')
        .values({
          session: scope.session,
          call: input.original.ref.callId,
          result_key: input.resultKey,
          record: boundedText(saved, this.host.options.policy.maxRecordBytes),
        })
        .execute(),
    )
    return saved
  }
  evidence(value: ToolResultCustodyEvidence, input: ToolResultInput): ToolResultCustodyEvidence {
    const copied = copyJsonValue(value)
    if ('failed' in copied || !object(copied.ok))
      throw new StorageDefect('invalid Tool custody evidence')
    const result = copied.ok as unknown as ToolResultCustodyEvidence
    if (
      this.text(result.original) !== this.text(input.original) ||
      this.text(result.terminal) !== this.text(input.terminal) ||
      !Array.isArray(result.references)
    )
      throw new StorageDefect('Tool custody source changed original result')
    return result
  }
  async capacity(unit: StorageUnit) {
    const count = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_result')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    )
    if (Number(count.n) >= this.host.options.toolResults!.maxRecords)
      throw new ToolCustodyRefusal('unavailable')
  }
  async source(unit: StorageUnit, scope: SessionScope) {
    const result = await this.host.log.sourceIn(unit, this.host.authority.logAccess, scope)
    if ('failure' in result) throw new ToolCustodyRefusal('unavailable')
    return result.source
  }
  async verifyOriginal(unit: StorageUnit, scope: SessionScope, input: ToolResultInput) {
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_issue')
        .select('identity')
        .where('session', '=', scope.session)
        .where('call', '=', input.original.ref.callId)
        .executeTakeFirst(),
    )
    if (!row || row.identity !== this.text(input.original))
      throw new ToolCustodyRefusal('invalidSource')
    const current = await this.source(unit, scope)
    if (!sourceCovers(current, input.source)) throw new ToolCustodyRefusal('invalidSource')
    const prefix = await this.host.log.readPrefixIn(
      unit,
      this.host.authority.logAccess,
      input.source,
    )
    if ('failure' in prefix) throw new ToolCustodyRefusal('unavailable')
    const projected = projectToolJournal(scope, prefix.entries, this.host.options.parameters)
    if ('invalid' in projected) throw new ToolCustodyRefusal('invalidSource')
    const history = projected.executions.get(input.original.ref.callId)
    if (
      !history?.terminal ||
      history.intent.entry.dedupeKey !== input.original.originalPosition ||
      this.text(history.intent.value.origin) !== this.text(input.original.origin) ||
      this.text(history.terminal) !== this.text(input.terminal)
    )
      throw new ToolCustodyRefusal('invalidSource')
  }
  async append(
    unit: StorageUnit,
    scope: SessionScope,
    input: ToolResultInput,
    result: ToolResultCustodyEvidence,
  ): Promise<ToolResultStored> {
    const at = await this.host.options.now()
    if (at === 'unavailable') throw new ToolCustodyRefusal('unavailable')
    const semanticDigest = this.text(result),
      original = input.original
    const request = checkAppendInput(
      scope.session,
      [
        {
          tenant: scope.tenant,
          dedupeKey: `session-runtime/tool-result/${JSON.stringify([original.ref.callId, input.resultKey])}`,
          run: original.origin.run,
          attempt: original.origin.attempt,
          readKeys: [],
          payload: sessionFactPayload({
            kind: 'result_custodied',
            run: original.origin.run,
            attempt: original.origin.attempt,
            call: original.ref.callId,
            resultKey: input.resultKey,
            semanticDigest,
            at,
          }),
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in request) throw new StorageDefect('invalid Tool custody fact')
    const appended = await this.host.log.appendIn(unit, this.host.authority.logAccess, request.ok)
    if ('failure' in appended) throw new ToolCustodyRefusal('unavailable')
    const position = appended.entries[0]?.position
    if (position === undefined) throw new StorageDefect('Tool custody append lacks position')
    return {
      kind: 'custodied',
      result,
      witness: {
        original,
        semanticDigest,
        receipt: {
          ...scope,
          call: original.ref.callId,
          resultKey: input.resultKey,
          position,
          source: await this.source(unit, scope),
        },
      },
    }
  }
  decode(row: Row, scope: SessionScope): ToolResultStored {
    try {
      if (Buffer.byteLength(row.record) > this.host.options.policy.maxRecordBytes)
        throw new Error('oversized')
      const parsed = readJsonStrict(row.record)
      if ('failed' in parsed || !object(parsed.ok) || !object(parsed.ok.witness))
        throw new Error('bad record')
      const saved = parsed.ok as unknown as ToolResultStored
      const receipt = saved.witness.receipt
      const input = ownToolResult(
        {
          original: saved.witness.original,
          terminal: saved.result.terminal,
          resultKey: row.result_key,
          source: receipt.source,
        },
        scope,
        this.host.options.policy.maxRecordBytes,
      )
      this.checkSavedIdentity(saved, row, scope, input)
      this.evidence(saved.result, input)
      return { ...saved, kind: 'alreadyCustodied' }
    } catch {
      throw new StorageDefect('corrupt Tool custody record')
    }
  }
  checkSavedIdentity(
    saved: ToolResultStored,
    row: Row,
    scope: SessionScope,
    input: ToolResultInput,
  ) {
    const receipt = saved.witness.receipt
    if (
      saved.kind !== 'custodied' ||
      receipt.call !== row.call ||
      receipt.resultKey !== row.result_key ||
      receipt.session !== scope.session ||
      !tenantIdEquals(receipt.tenant, scope.tenant) ||
      input.original.ref.callId !== row.call ||
      this.text(saved.result) !== saved.witness.semanticDigest
    )
      throw new Error('bad identity')
  }
  async verifySaved(unit: StorageUnit, scope: SessionScope, saved: ToolResultStored) {
    const { receipt } = saved.witness
    await this.verifyStoredOriginal(unit, scope, saved)
    const prefix = await this.host.log.readPrefixIn(
      unit,
      this.host.authority.logAccess,
      receipt.source,
    )
    if ('failure' in prefix) throw new ToolCustodyRefusal('unavailable')
    const entry = prefix.entries.find(
      entry => compareInteger(entry.position, receipt.position) === 0,
    )
    const read = entry && readSessionFact(entry)
    if (!read || !('kind' in read) || read.kind !== 'fact' || read.fact.kind !== 'result_custodied')
      throw new StorageDefect('Tool custody fact is missing')
    checkCustodyFact(read.fact, saved)
  }
  async verifyStoredOriginal(unit: StorageUnit, scope: SessionScope, saved: ToolResultStored) {
    const { receipt, original } = saved.witness
    try {
      await this.verifyOriginal(unit, scope, {
        original,
        terminal: saved.result.terminal,
        resultKey: receipt.resultKey,
        source: receipt.source,
      })
    } catch (error) {
      if (error instanceof ToolCustodyRefusal && error.failure === 'invalidSource')
        throw new StorageDefect('stored Tool custody lost original proof')
      throw error
    }
  }
}
function checkCustodyFact(
  fact: Extract<
    import('@omne-harness-lite/session-runtime').SessionFact,
    { kind: 'result_custodied' }
  >,
  saved: ToolResultStored,
) {
  const { receipt, original, semanticDigest } = saved.witness
  if (
    fact.call !== receipt.call ||
    fact.resultKey !== receipt.resultKey ||
    fact.semanticDigest !== semanticDigest ||
    fact.run !== original.origin.run ||
    compareInteger(fact.attempt, original.origin.attempt) !== 0
  )
    throw new StorageDefect('Tool custody fact mismatch')
}
function failure(error: unknown) {
  if (error instanceof ToolCustodyRefusal || error instanceof CustodyRefusal)
    return { failure: error.failure }
  if (error instanceof InvalidStateInput) return { failure: 'invalidInput' as const }
  if (error instanceof StorageUnavailable) return { failure: 'unavailable' as const }
  if (error instanceof CoordinationRejection && error.failure === 'denied')
    return { failure: 'denied' as const }
  throw error
}
