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
} from '@omne-harness-lite/tool-execution-runtime'
import { sameJson } from './json-values.ts'

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
  readonly generation: string
  readonly expected: CheckedPrefix
  readonly value: Extract<ToolJournalPayload, { kind: 'execution_intended' }>
  readonly stopped: Promise<void>
  readonly isOpen: () => boolean
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
  async function verifyIntent(unit: StorageUnit) {
    const source = await support.log.sourceIn(unit, support.access, expected.scope)
    if ('failure' in source) return false
    const prefix = await support.log.readPrefixIn(unit, support.access, source.source)
    if ('failure' in prefix) return false
    return prefix.entries.some(actual => {
      const { position: _position, session: _session, ...owned } = actual
      return sameJson(owned, entry)
    })
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
    const prefix = await support.log.readPrefixIn(unit, support.access, source.source)
    if ('failure' in prefix) return { kind: 'unavailable' }
    if (!sameJson(prefix.entries, expected.entries)) return { kind: 'retryFromFacts' }
    claim = Object.freeze({}) as ToolOriginalIssueClaim
    row.claim = randomUUID()
    const appended = await support.log.appendIn(unit, support.access, checked.ok, source.source)
    if ('failure' in appended)
      return { kind: appended.failure === 'denied' ? 'denied' : 'unavailable' }
    if ('invalid' in projectToolJournal(expected.scope, [...prefix.entries, ...appended.entries]))
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
      if (existing.consumed === 1) return { kind: 'alreadyConsumed', identity }
      if (existing.consumed !== 0)
        throw new StorageDefect('invalid original tool consumption state')
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
    })
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
          (await verifyIntent(unit))
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
  return Object.freeze({
    participant,
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
