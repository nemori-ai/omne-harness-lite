import { randomUUID } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  compareInteger,
  type CheckedPrefix,
} from '@omne-harness-lite/session-log'
import {
  narrow,
  StorageUnavailable,
  StorageDefect,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import {
  prepareToolJournalEntry,
  projectToolJournal,
  type ToolJournalPayload,
  type ToolOriginalIssueClaim,
  type ToolOriginalIssueConsumeStage,
  type ToolOriginalIssueIdentity,
  type ToolOriginalIssueParticipant,
  type ToolOriginalIssueStage,
  type ToolOriginalIssueSupport,
  type ToolExecutionJob,
} from '@omne-harness-lite/tool-execution-runtime'
import { sameJson } from './json-values.ts'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { createToolExecutionRecordReader } from './execution-records.ts'
import { createToolExecutionTransitions } from './execution-transitions.ts'

interface Row {
  tenant: string
  session: string
  call: string
  identity: string
  intent: string
  claim: string
  consumed: number
}
interface Database {
  tool_original_issue: Row
}
type Completion = Promise<'committed' | 'rolledBack' | 'unknown'>

export function createToolOriginalIssue(input: {
  readonly support: ToolOriginalIssueSupport
  readonly clock: Clock
  readonly generation: string
  readonly expected: Pick<CheckedPrefix, 'scope' | 'tail' | 'ownerGeneration'>
  readonly value: Extract<ToolJournalPayload, { kind: 'execution_intended' }>
  readonly stopped: Promise<void>
  readonly isOpen: () => boolean
  readonly isRetained: () => boolean
}) {
  const { support, value, expected } = input
  const prepared = prepareToolJournalEntry({ origin: value.origin, value })
  if ('invalid' in prepared) throw new TypeError('invalid original tool intent')
  const entry = prepared.entry
  const identity: ToolOriginalIssueIdentity = Object.freeze({
    ref: Object.freeze({ ...value.ref, tenant: Object.freeze({ ...value.ref.tenant }) }),
    origin: Object.freeze({ ...value.origin }),
    adoption: readAdoption(input.value.input),
    executionGeneration: input.generation,
    originalPosition: entry.dedupeKey!,
  })
  let claim: ToolOriginalIssueClaim | undefined
  const row: Row = {
    tenant: writeJsonLossless(identity.ref.tenant),
    session: identity.ref.session,
    call: identity.ref.callId,
    identity: writeJsonLossless(identity),
    intent: writeJsonLossless(entry),
    claim: randomUUID(),
    consumed: 0,
  }
  let staged: Completion | undefined, consumed: Completion | undefined
  let issued = false,
    launched = false,
    consumeUnconfirmed = false,
    admissionUnconfirmed = false
  function find(unit: StorageUnit) {
    return unit.query(tx =>
      narrow<Database>(tx)
        .selectFrom('tool_original_issue')
        .selectAll()
        .where('tenant', '=', row.tenant)
        .where('session', '=', row.session)
        .where('call', '=', row.call)
        .executeTakeFirst(),
    )
  }
  const same = (existing: Row) =>
    existing.identity === row.identity &&
    existing.intent === row.intent &&
    existing.claim === row.claim
  async function authorize(unit: StorageUnit) {
    unit.assertStorage(support.storage)
    await unit.mutate(tx =>
      tx.lockSentinel(`tool-original:${row.tenant}:${row.session}:${row.call}`),
    )
    return support.current.authorizeIn(unit, identity)
  }
  const records = createToolExecutionRecordReader({
    storage: support.storage,
    tenant: value.ref.tenant,
    participant: support.log,
    authority: support.access,
  })
  async function verifyIntent(unit: StorageUnit) {
    const original = await records.readOriginalIn(unit, identity.ref)
    if (original.kind !== 'found') return false
    const { position: _position, session: _session, ...owned } = original.history.intent.entry
    return sameJson(owned, entry)
  }
  async function stage(unit: StorageUnit): Promise<ToolOriginalIssueStage> {
    return unit.run(async () => {
      const permission = await authorize(unit)
      if (permission.kind !== 'authorized') return permission
      if (!input.isOpen()) return { kind: 'closed' }
      const existing = await find(unit)
      if (existing)
        return same(existing) && (await verifyIntent(unit))
          ? { kind: 'alreadyIssued', identity }
          : { kind: 'conflict' }
      return appendIntent(unit)
    })
  }
  async function appendIntent(unit: StorageUnit): Promise<ToolOriginalIssueStage> {
    const source = await support.log.sourceIn(unit, support.access, expected.scope)
    if ('failure' in source) return { kind: source.failure === 'denied' ? 'denied' : 'unavailable' }
    if (compareInteger(source.source.tail, expected.tail) !== 0) return { kind: 'retryFromFacts' }
    const checked = checkAppendInput(
      identity.ref.session,
      [entry],
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: expected.tail },
    )
    if ('failure' in checked) return { kind: 'invalidInput' }
    const prior = await records.readOriginalIn(unit, identity.ref)
    if (prior.kind === 'found') return { kind: 'conflict' }
    if (prior.kind !== 'absent') return { kind: 'unavailable' }
    claim = Object.freeze({}) as ToolOriginalIssueClaim
    row.claim = randomUUID()
    const appended = await support.log.appendIn(unit, support.access, checked.ok, source.source)
    if ('failure' in appended)
      return { kind: appended.failure === 'denied' ? 'denied' : 'unavailable' }
    if ('invalid' in projectToolJournal(expected.scope, appended.entries))
      throw new StorageDefect('invalid original tool journal transition')
    await unit.mutate(tx =>
      narrow<Database>(tx).insertInto('tool_original_issue').values(row).execute(),
    )
    staged = unit.observeCompletion()
    return { kind: 'staged', identity, claim, positions: appended.entries.map(e => e.position) }
  }
  async function consume(
    unit: StorageUnit,
    candidate: ToolOriginalIssueClaim,
  ): Promise<ToolOriginalIssueConsumeStage> {
    return unit.run(async () => {
      unit.assertStorage(support.storage)
      if (candidate !== claim || !staged) return { kind: 'invalidInput' }
      const permission = await authorize(unit)
      if (permission.kind !== 'authorized') return permission
      if (!input.isOpen()) return { kind: 'closed' }
      const existing = await find(unit)
      if (!existing || !same(existing) || !(await verifyIntent(unit))) return { kind: 'conflict' }
      if (existing.consumed === 1) return existingConsumption(unit)
      if (existing.consumed !== 0)
        throw new StorageDefect('invalid original tool consumption state')
      return stageConsumption(unit)
    })
  }
  async function existingConsumption(unit: StorageUnit): Promise<ToolOriginalIssueConsumeStage> {
    return (await verifyStarted(unit))
      ? { kind: 'alreadyConsumed', identity }
      : { kind: 'unavailable' }
  }
  async function stageConsumption(unit: StorageUnit): Promise<ToolOriginalIssueConsumeStage> {
    if (!(await startIn(unit))) return { kind: 'unavailable' }
    await unit.mutate(tx =>
      narrow<Database>(tx)
        .updateTable('tool_original_issue')
        .set({ consumed: 1 })
        .where('tenant', '=', row.tenant)
        .where('session', '=', row.session)
        .where('call', '=', row.call)
        .execute(),
    )
    consumed = unit.observeCompletion()
    return { kind: 'staged', identity }
  }
  async function verifyStarted(unit: StorageUnit) {
    const result = await records.readOriginalIn(unit, identity.ref)
    return result.kind === 'found' && result.history.started !== undefined
  }
  async function startIn(unit: StorageUnit): Promise<boolean> {
    const now = await input.clock.now()
    if (now === 'unavailable') return false
    const source = await support.log.sourceIn(unit, support.access, expected.scope)
    if ('failure' in source) return false
    const prepared = prepareToolJournalEntry({
      origin: identity.origin,
      value: {
        kind: 'execution_started',
        revision: 1,
        ref: identity.ref,
        at: instantToRfc3339(now),
      },
    })
    if ('invalid' in prepared) throw new StorageDefect('invalid original Tool start')
    const request = checkAppendInput(
      identity.ref.session,
      [prepared.entry],
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: source.source.tail },
    )
    if ('failure' in request) throw new StorageDefect('invalid original Tool start batch')
    const appended = await support.log.appendIn(unit, support.access, request.ok, source.source)
    if ('failure' in appended) throw new StorageUnavailable('original Tool start was not confirmed')
    return true
  }
  async function recognize(wantConsumed: boolean): Promise<boolean> {
    try {
      return await support.storage.atomic(async unit => {
        unit.assertStorage(support.storage)
        const existing = await find(unit)
        return (
          existing !== undefined &&
          same(existing) &&
          (!wantConsumed || existing.consumed === 1) &&
          (await verifyIntent(unit)) &&
          (!wantConsumed || (await verifyStarted(unit)))
        )
      })
    } catch (error) {
      if (error instanceof StorageUnavailable) return false
      throw error
    }
  }
  async function confirmedLaunch(
    result: Awaited<ReturnType<ToolOriginalIssueSupport['admission']['consumeOriginal']>>,
  ): Promise<boolean> {
    if (result.kind !== 'launch' || !sameJson(result.identity, identity) || !consumed) return false
    return (await consumed) === 'committed'
  }
  const participant: ToolOriginalIssueParticipant = Object.freeze({
    identity,
    expected: Object.freeze({ ownerGeneration: expected.ownerGeneration, tail: expected.tail }),
    stopped: input.stopped,
    stageOriginalIn: stage,
    consumeOriginalIn: consume,
  })
  const job = Object.freeze({}) as ToolExecutionJob
  const transitions = createToolExecutionTransitions({
    support,
    identity,
    job,
    isOpen: input.isRetained,
    async verifyIn(unit) {
      const existing = await find(unit)
      return existing !== undefined && same(existing) && (await verifyIntent(unit))
    },
  })
  return Object.freeze({
    participant,
    job,
    records: Object.freeze({ ...records, ...transitions }),
    async recordStatus(): Promise<'known' | 'absent' | 'unconfirmed'> {
      if (!staged) return admissionUnconfirmed ? 'unconfirmed' : 'absent'
      const completion = await staged
      if (completion === 'rolledBack') return 'absent'
      if (completion === 'committed') return 'known'
      return (await recognize(false)) ? 'known' : 'unconfirmed'
    },
    async admit(): Promise<boolean> {
      const result = await support.admission.admitOriginal(participant)
      if (result.kind === 'unknownCommit') admissionUnconfirmed = true
      if (
        (result.kind !== 'issued' && result.kind !== 'alreadyIssued') ||
        !sameJson(result.identity, identity)
      )
        return false
      if (result.kind === 'issued' && result.claim !== claim) return false
      if (!staged || (await staged) === 'rolledBack') return false
      issued = await recognize(false)
      return issued
    },
    async canClose(): Promise<boolean> {
      if (!admissionUnconfirmed) return true
      if (!staged) return false
      const completion = await staged
      return completion === 'rolledBack' || completion === 'committed' || (await recognize(false))
    },
    async launch(): Promise<'launch' | 'finishUnconfirmed' | 'retained'> {
      if (!issued || !claim) return 'retained'
      if (launched) return 'launch'
      const result = await support.admission.consumeOriginal(claim)
      if (await confirmedLaunch(result)) {
        launched = true
        return 'launch'
      }
      if (result.kind === 'unknownCommit' || result.kind === 'alreadyConsumed')
        consumeUnconfirmed = true
      if (!consumeUnconfirmed) return 'retained'
      const found = await recognize(true)
      return found ? 'finishUnconfirmed' : 'retained'
    },
  })
}
function readAdoption(input: unknown): string {
  const parsed = input as { submission?: { adoption?: unknown } }
  if (typeof parsed.submission?.adoption !== 'string')
    throw new TypeError('missing original tool adoption')
  return parsed.submission.adoption
}
