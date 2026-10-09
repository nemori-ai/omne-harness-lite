import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { readJsonStrict, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  prepareToolJournalEntry,
  projectToolJournal,
} from '@omne-harness-lite/tool-execution-runtime'
import {
  checkAppendInput,
  checkLogPayload,
  checkSourceToken,
  compareInteger,
  positiveInteger,
  messageLogPayload,
  factLogPayload,
  type LogEntry,
  type LogEntryInput,
  type SessionLogParticipant,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { CoordinationAuthority } from '@omne-harness-lite/session-runtime'
import type { RuntimeOptions } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { createLocalSessionState } from './state-participant.ts'
import type { createToolResultCustody } from './tool-result-custody.ts'
import type {
  LocalToolResultDelivery,
  ToolDeliveryInput,
  ToolResultStored,
} from './tool-result-types.ts'
import { ownToolDelivery, deliverySemantic, verifyToolConclusions } from './tool-delivery-values.ts'
import { object, ToolCustodyRefusal } from './tool-custody-values.ts'
import { CustodyRefusal, sourceCovers } from './model-result-values.ts'
import { stateScope, InvalidStateInput } from './state-values.ts'
import { CoordinationRejection, boundedText } from './coordination-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

interface Host {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly log: SessionLogParticipant
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly readToolIn: ReturnType<typeof createToolResultCustody>['readIn']
}
interface Database {
  sr_tool_delivery: {
    session: string
    call: string
    result_key: string
    semantic: string
    record: string
  }
}
interface Proof {
  readonly source: SourceToken
  readonly messagePosition: JsonNumber
  readonly batch: readonly LogEntry[]
}
export function createToolResultDelivery(host: Host): LocalToolResultDelivery {
  const owner = new ToolDelivery(host)
  return Object.freeze({ confirm: owner.confirm })
}
class ToolDelivery {
  constructor(readonly host: Host) {}
  text(value: unknown) {
    return runtimeSemantic(value, this.host.options.policy.maxRecordBytes)
  }
  gate(authority: CoordinationAuthority, requested: SessionScope) {
    if (authority !== this.host.authority.coordination) throw new ToolCustodyRefusal('denied')
    const scope = stateScope(requested)
    if (!tenantIdEquals(scope.tenant, this.host.options.tenant))
      throw new ToolCustodyRefusal('denied')
    if (!this.host.options.toolDelivery || !this.host.options.toolResults)
      throw new ToolCustodyRefusal('unavailable')
    return scope
  }
  confirm: LocalToolResultDelivery['confirm'] = async (authority, requested, candidate) => {
    let writing = false,
      input: ToolDeliveryInput | undefined,
      scope: SessionScope | undefined
    try {
      scope = this.gate(authority, requested)
      input = ownToolDelivery(candidate, scope, this.host.options.policy.maxRecordBytes)
      const fixedInput = input,
        fixedScope = scope
      return await this.host.options.storage.atomic(unit =>
        this.host.authority.withinRun(
          unit,
          fixedScope,
          fixedInput.witness.original.origin.run,
          () =>
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
          call: input.witness.receipt.call,
          resultKey: input.witness.receipt.resultKey,
        }
      return failure(error)
    }
  }
  async stage(
    unit: StorageUnit,
    scope: SessionScope,
    input: ToolDeliveryInput,
    writing: () => void,
  ) {
    const original = input.witness.original
    const saved = await this.host.readToolIn(
      unit,
      scope,
      original.ref.callId,
      input.witness.receipt.resultKey,
    )
    if (saved.kind === 'absent') throw new CoordinationRejection('retryFromFacts')
    if (this.text(saved.witness) !== this.text(input.witness))
      throw new ToolCustodyRefusal('invalidSource')
    const semantic = deliverySemantic(input, this.host.options.policy.maxRecordBytes)
    const row = await unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('sr_tool_delivery')
        .selectAll()
        .where('session', '=', scope.session)
        .where('call', '=', original.ref.callId)
        .executeTakeFirst(),
    )
    if (row) {
      if (row.result_key !== saved.witness.receipt.resultKey || row.semantic !== semantic)
        throw new ToolCustodyRefusal('identityConflict')
      const proof = await this.recognize(unit, scope, row.record, input)
      return {
        kind: 'alreadyConfirmed' as const,
        receipt: saved.witness.receipt,
        source: proof.source,
        messagePosition: proof.messagePosition,
      }
    }
    if (
      !(await this.host.state.checkPermitIn(
        unit,
        input.permit,
        scope,
        original.origin.run,
        original.origin.attempt,
      ))
    )
      throw new CoordinationRejection('staleAttempt')
    const source = await this.source(unit, scope)
    if (!sourceCovers(source, input.source) || compareInteger(source.tail, input.source.tail) !== 0)
      throw new CoordinationRejection('retryFromFacts')
    const prefix = await this.prefix(unit, source)
    verifyToolConclusions(this.host.options, scope, source, prefix, saved, input)
    return this.append(unit, scope, saved, input, prefix, semantic, writing)
  }
  async source(unit: StorageUnit, scope: SessionScope) {
    const source = await this.host.log.sourceIn(unit, this.host.authority.logAccess, scope)
    if ('failure' in source) throw new ToolCustodyRefusal('unavailable')
    return source.source
  }
  async prefix(unit: StorageUnit, source: SourceToken) {
    const read = await this.host.log.readPrefixIn(unit, this.host.authority.logAccess, source)
    if ('failure' in read) throw new ToolCustodyRefusal('unavailable')
    return read.entries
  }
  async append(
    unit: StorageUnit,
    scope: SessionScope,
    saved: ToolResultStored,
    input: ToolDeliveryInput,
    prefix: readonly LogEntry[],
    semantic: string,
    writing: () => void,
  ) {
    const original = saved.witness.original
    const { request, oldReady } = this.prepareBatch(scope, saved, input, prefix)
    writing()
    const appended = await this.host.log.appendIn(
      unit,
      this.host.authority.logAccess,
      request,
      input.source,
    )
    if ('failure' in appended)
      throw new ToolCustodyRefusal(appended.failure === 'denied' ? 'denied' : 'unavailable')
    const full = [...prefix, ...appended.entries]
    if ('invalid' in projectToolJournal(scope, full))
      throw new StorageDefect('invalid committed Tool delivery transitions')
    const message = appended.entries.find(
      entry => entry.dedupeKey === `message:${input.message.id}`,
    )
    if (!message) throw new StorageDefect('Tool delivery lacks its message position')
    const proof: Proof = {
      source: await this.source(unit, scope),
      messagePosition: message.position,
      batch: oldReady ? [oldReady, ...appended.entries] : appended.entries,
    }
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .insertInto('sr_tool_delivery')
        .values({
          session: scope.session,
          call: original.ref.callId,
          result_key: saved.witness.receipt.resultKey,
          semantic,
          record: boundedText(proof, this.host.options.policy.maxRecordBytes),
        })
        .execute(),
    )
    return {
      kind: 'confirmed' as const,
      receipt: saved.witness.receipt,
      source: proof.source,
      messagePosition: message.position,
    }
  }
  prepareBatch(
    scope: SessionScope,
    saved: ToolResultStored,
    input: ToolDeliveryInput,
    prefix: readonly LogEntry[],
  ) {
    const original = saved.witness.original
    const history = projectToolJournal(scope, prefix)
    if ('invalid' in history) throw new StorageDefect('invalid original Tool delivery history')
    const execution = history.executions.get(original.ref.callId)
    if (!execution?.terminal) throw new StorageDefect('missing original Tool terminal')
    if (execution.confirmed) throw new StorageDefect('Tool confirmation lacks its Session batch')
    const ready = nativeEntry(original.origin, {
      kind: 'delivery_ready',
      revision: 1,
      ref: original.ref,
      result: input.result,
      basis: { kind: 'conclusions', keys: input.conclusions },
    })
    if (execution.ready && this.text(execution.ready.value) !== this.text(ready.value))
      throw new ToolCustodyRefusal('identityConflict')
    const entries = this.batchEntries(scope, saved, input, ready.entry, !execution.ready)
    const request = checkAppendInput(
      scope.session,
      entries,
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: input.source.tail },
    )
    if ('failure' in request) throw new StorageDefect('invalid ordinary Tool delivery batch')
    if (prefix.some(entry => entry.dedupeKey === `message:${input.message.id}`))
      throw new ToolCustodyRefusal('identityConflict')
    return { request: request.ok, oldReady: execution.ready?.entry }
  }
  batchEntries(
    scope: SessionScope,
    saved: Pick<ToolResultStored, 'witness'>,
    input: ToolDeliveryInput,
    ready: LogEntryInput,
    includeReady: boolean,
  ) {
    const original = saved.witness.original
    const confirmed = nativeEntry(original.origin, {
      kind: 'delivery_confirmed',
      revision: 1,
      ref: original.ref,
      message: input.message,
    })
    const shell = {
      tenant: scope.tenant,
      run: original.origin.run,
      attempt: original.origin.attempt,
      readKeys: [],
    }
    return [
      ...(includeReady ? [ready] : []),
      {
        ...shell,
        dedupeKey: `message:${input.message.id}`,
        payload: messageLogPayload(input.message),
      },
      confirmed.entry,
      {
        ...shell,
        dedupeKey: `session-runtime/tool-adopted/${JSON.stringify([original.ref.callId, saved.witness.receipt.resultKey])}`,
        payload: factLogPayload('session-runtime-local', '1', {
          kind: 'tool_result_adopted',
          call: original.ref.callId,
          resultKey: saved.witness.receipt.resultKey,
          resultPosition: saved.witness.receipt.position,
          message: input.message.id,
        }),
      },
    ]
  }
  async recognize(
    unit: StorageUnit,
    scope: SessionScope,
    text: string,
    input: ToolDeliveryInput,
  ): Promise<Proof> {
    const proof = decodeProof(text, this.host.options.policy.maxRecordBytes)
    const checked = checkSourceToken(proof.source)
    if (
      'failure' in checked ||
      checked.ok.session !== scope.session ||
      !tenantIdEquals(checked.ok.tenant, scope.tenant)
    )
      throw new StorageDefect('corrupt Tool delivery source')
    const prefix = await this.prefix(unit, checked.ok)
    this.verifyProofBatch(scope, prefix, proof, input)
    verifyMessagePosition(prefix, proof, input, this.host.options.policy.maxRecordBytes)
    const history = projectToolJournal(scope, prefix)
    if (
      'invalid' in history ||
      !history.executions.get(input.witness.original.ref.callId)?.confirmed
    )
      throw new StorageDefect('Tool delivery proof lacks original confirmation')
    return proof
  }
  verifyProofBatch(
    scope: SessionScope,
    prefix: readonly LogEntry[],
    proof: Proof,
    input: ToolDeliveryInput,
  ) {
    const original = input.witness.original
    const ready = nativeEntry(original.origin, {
      kind: 'delivery_ready',
      revision: 1,
      ref: original.ref,
      result: input.result,
      basis: { kind: 'conclusions', keys: input.conclusions },
    })
    const saved = { witness: input.witness }
    const expected = this.batchEntries(scope, saved, input, ready.entry, true)
    for (const [index, entry] of proof.batch.entries()) {
      const actual = prefix.find(actual => compareInteger(actual.position, entry.position) === 0)
      if (!actual || this.text(actual) !== this.text(entry))
        throw new StorageDefect('Tool delivery batch is incomplete')
      const { position: _position, session: _session, ...owned } = actual
      if (this.text(owned) !== this.text(expected[index]))
        throw new StorageDefect('Tool delivery batch is incomplete')
    }
    if (
      compareInteger(proof.batch[1]!.position, proof.messagePosition) !== 0 ||
      compareInteger(proof.batch[3]!.position, proof.source.tail) !== 0
    )
      throw new StorageDefect('Tool delivery batch is incomplete')
  }
}
function decodeProof(text: string, limit: number): Proof {
  if (Buffer.byteLength(text) > limit) throw new StorageDefect('oversized Tool delivery proof')
  const parsed = readJsonStrict(text)
  if (
    'failed' in parsed ||
    !object(parsed.ok) ||
    Object.keys(parsed.ok).length !== 3 ||
    !Array.isArray(parsed.ok.batch) ||
    parsed.ok.batch.length !== 4
  )
    throw new StorageDefect('Tool delivery batch is incomplete')
  const proof = parsed.ok as unknown as Proof
  if (
    !positiveInteger(proof.messagePosition) ||
    proof.batch.some(entry => !positiveInteger(entry?.position))
  )
    throw new StorageDefect('Tool delivery batch is incomplete')
  return proof
}
function nativeEntry(
  origin: import('@omne-harness-lite/tool-execution-runtime').ExecutionOrigin,
  value: import('@omne-harness-lite/tool-execution-runtime').ToolJournalPayload,
) {
  const prepared = prepareToolJournalEntry({ origin, value })
  if ('invalid' in prepared) throw new StorageDefect('invalid native Tool delivery fact')
  return { ...prepared, value }
}
function verifyMessagePosition(
  prefix: readonly LogEntry[],
  proof: Proof,
  input: ToolDeliveryInput,
  limit: number,
) {
  const message = prefix.find(entry => compareInteger(entry.position, proof.messagePosition) === 0)
  const payload = message && checkLogPayload(message.payload)
  if (
    !payload ||
    !('kind' in payload) ||
    payload.kind !== 'message' ||
    runtimeSemantic(payload.payload.value, limit) !== runtimeSemantic(input.message, limit)
  )
    throw new StorageDefect('Tool delivery message position mismatch')
}
function failure(error: unknown) {
  if (
    error instanceof ToolCustodyRefusal ||
    error instanceof CustodyRefusal ||
    error instanceof CoordinationRejection
  )
    return { failure: error.failure }
  if (error instanceof InvalidStateInput) return { failure: 'invalidInput' as const }
  if (error instanceof StorageUnavailable) return { failure: 'unavailable' as const }
  throw error
}
