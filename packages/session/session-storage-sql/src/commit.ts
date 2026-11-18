import { SESSION_ORDINARY_BASIS, sessionCommitCommands } from './commit-basis.ts'
import { createHash, randomUUID } from 'node:crypto'
import { tenantEquals } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandDigest,
  mutationAccessRequest,
  readAccessRequest,
  type CommitReceipt,
  type ControlOperationResolution,
  type DurableEvidence,
  type GuardCommand,
  type MutationName,
  type OperationResolution,
  type SessionAccess,
  type SessionCommand,
  type SessionFailure,
  type SessionOperationId,
  budgetTermsOf,
  prepareIntakeTerms,
  withIntakeTerms,
} from '@omne-harness/session-contract'
import {
  commitRejectionNature,
  type CommitRequestV2,
  type CommitResultV2,
  type FactCommandV2,
  type JsonValue,
  type QueryResultV2,
  type ReceiptV2,
  type SqlIdentity,
} from '@omne-harness/sql-contract'
import { canonicalText, decodeValue, encodeValue } from './codec.ts'
import { OWNER } from './cursor.ts'
import { SESSION_PARTICIPANT, decodeSessionReply, sessionCommandFacts } from './participants.ts'
import { afterSessionCommit } from './committed.ts'
import {
  domainOf,
  failure,
  qualify,
  unavailable,
  type Context,
  type TenantDomainRef,
  intakeBasisOf,
} from './context.ts'
import type { SessionProtectedBasisSource, SessionProtectedCommit } from './protected-basis.ts'

export type Expected = Readonly<{ operation: SessionOperationId; digest: string }>
type Found = Readonly<{
  kind: 'operation'
  form: string
  receipt: JsonValue
  result: JsonValue
  evidence: JsonValue
}>
type Rest = Awaited<ReturnType<typeof exclusion>>

const identityOf = (domain: TenantDomainRef, operation: string, key: string): SqlIdentity => ({
  scope: domain.domain.scope,
  transactionDomain: domain.domain.transactionDomain,
  operation,
  protocolVersion: '2',
  operationKey: key,
})

type Submission = Omit<CommitRequestV2, 'identity'>
type Submit = () => Promise<Outcome<Submission, SessionFailure>>

const ordinaryOf = <P>(context: Context<P>, command: FactCommandV2): Submission => ({
  ...context.options.combination,
  commands: sessionCommitCommands([command]),
})

function protectedSubmission<P>(
  source: SessionProtectedBasisSource<P>,
  commit: SessionProtectedCommit<P>,
): Submit {
  return async () => {
    let basis: Awaited<ReturnType<SessionProtectedBasisSource<P>>>
    try {
      basis = await source(commit)
    } catch (error) {
      return failure(
        unavailable(
          `the protected basis source threw: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    }
    if ('failure' in basis) return basis
    const { combination, commands } = basis.ok
    const own = [SESSION_PARTICIPANT, SESSION_ORDINARY_BASIS]
    if (commands.some(command => own.includes(command.participant)))
      return failure({
        kind: 'invalid',
        field: 'basis',
        reason: 'a protected basis carries no Session command and no ordinary basis',
      })
    return succeed({
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [commit.session, ...commands],
    })
  }
}

const sessionFacts = (facts: Readonly<Record<string, JsonValue>>): FactCommandV2 => ({
  participant: SESSION_PARTICIPANT,
  facts,
})

function markRecovered(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  const inner = record['receipt']
  if (typeof inner === 'object' && inner !== null && 'revision' in inner)
    return { ...record, receipt: { ...inner, recovered: true } }
  if ('revision' in record && 'first' in record && 'operation' in record)
    return { ...record, recovered: true }
  return value
}

export type Recall = (value: unknown) => unknown

function fromCommitted(
  receipt: ReceiptV2,
  expected: Expected,
  recall: boolean,
  mark: Recall = markRecovered,
): Outcome<unknown, SessionFailure> {
  const entry = receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
  if (entry?.reply.kind !== 'participated')
    return failure(unavailable('a committed receipt without a response'))
  const answer = decodeSessionReply(entry.reply)
  if (answer.kind !== 'participated') return failure(unavailable('an undecodable session reply'))
  if (answer.digest !== expected.digest)
    return failure({ kind: 'conflict', operation: expected.operation })
  if (recall || answer.recovered) return succeed(mark(answer.result))
  return succeed(answer.result)
}

function fromRolledBack(receipt: ReceiptV2): Outcome<never, SessionFailure> {
  const stop = receipt.responses[receipt.responses.length - 1]?.reply
  if (stop === undefined || stop.kind === 'participated')
    return failure(unavailable('a rolled back receipt without a stopping response'))
  const decoded = decodeSessionReply(stop)
  switch (decoded.kind) {
    case 'stopped':
      return failure(decoded.failure)
    case 'unsupported':
      return failure({
        kind: 'invalid',
        field: 'command',
        reason: 'the participant does not support the facts',
      })
    case 'failed':
      return stop.kind === 'failed' && stop.category !== 'participant_reported'
        ? failure({ kind: 'invalid', field: 'storage', reason: stop.category })
        : failure(unavailable(`participant failed (${decoded.diagnostic})`))
    case 'participated':
      return failure(unavailable('a rolled back receipt without a stopping response'))
  }
}

function fromResult(
  result: CommitResultV2,
  expected: Expected,
  mark: Recall,
): Outcome<unknown, SessionFailure> | 'next-attempt' {
  switch (result.kind) {
    case 'committed':
      return fromCommitted(result, expected, result.recalled, mark)
    case 'rolled_back':
      return result.recalled ? 'next-attempt' : fromRolledBack(result)
    case 'unknown':
      return failure({ kind: 'commit-unknown', operation: expected.operation })
    case 'identity_conflict':
      return result.existing.kind === 'rolled_back'
        ? 'next-attempt'
        : fromCommitted(result.existing, expected, true, mark)
    case 'rejected_before_accept':
      if (result.reason === 'writer_not_current')
        return failure({ kind: 'commit-unknown', operation: expected.operation })
      return commitRejectionNature(result.reason) === 'temporary'
        ? failure(unavailable(`storage rejected the commit: ${result.reason}`))
        : failure({ kind: 'invalid', field: 'storage', reason: result.reason })
  }
}

const generationKey = (domain: TenantDomainRef, session: string, operation: string): string =>
  JSON.stringify([domain.text, domain.domain.transactionDomain, session, operation])

function saw(
  generations: Map<string, number>,
  key: string,
  attempt: number,
  kind: QueryResultV2['kind'],
): void {
  if (kind === 'committed') generations.delete(key)
  else if (kind === 'rolled_back' && attempt > (generations.get(key) ?? 0))
    generations.set(key, attempt)
}

type Generation =
  | Readonly<{ kind: 'committed'; receipt: ReceiptV2 }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'open'; attempt: number; identity: SqlIdentity }>

async function generationFrom<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  session: string,
  operation: string,
  from: number,
): Promise<Generation> {
  const key = generationKey(domain, session, operation)
  for (let attempt = from; ; attempt += 1) {
    const identity = identityOf(domain, operation, JSON.stringify([session, operation, attempt]))
    const found = await context.options.storage.query(identity)
    saw(context.generations, key, attempt, found.kind)
    if (found.kind === 'rolled_back') continue
    if (found.kind === 'committed') return { kind: 'committed', receipt: found }
    if (found.kind === 'unknown') return { kind: 'unknown' }
    return { kind: 'open', attempt, identity }
  }
}

export async function withCommitTime<P>(
  context: Context<P>,
  command: FactCommandV2,
): Promise<FactCommandV2> {
  const { clock } = context.options
  if (clock === undefined) return command
  let at: string
  try {
    const sample = await clock.sample()
    if ('failure' in sample) return command
    at = sample.ok.at
  } catch {
    return command
  }
  return { ...command, facts: { ...command.facts, at } }
}

export async function commitFacts<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  session: string,
  expected: Expected,
  command: FactCommandV2,
  mark: Recall = markRecovered,
  submit?: Submit,
): Promise<Outcome<unknown, SessionFailure>> {
  const { operation } = expected
  const { storage } = context.options
  const { generations } = context
  const key = generationKey(domain, session, operation)
  const unknown = failure({ kind: 'commit-unknown', operation })
  for (let attempt = (generations.get(key) ?? 0) + 1; ; attempt += 1) {
    let identity: SqlIdentity
    let submission: Submission
    if (submit === undefined) {
      identity = identityOf(domain, operation, JSON.stringify([session, operation, attempt]))
      submission = ordinaryOf(context, command)
    } else {
      const slot = await generationFrom(context, domain, session, operation, attempt)
      if (slot.kind === 'committed') return fromCommitted(slot.receipt, expected, true, mark)
      if (slot.kind === 'unknown') return unknown
      const asked = await submit()
      if ('failure' in asked) {
        const again = await generationFrom(context, domain, session, operation, slot.attempt)
        if (again.kind === 'committed') return fromCommitted(again.receipt, expected, true, mark)
        return again.kind === 'unknown' ? unknown : asked
      }
      attempt = slot.attempt
      identity = slot.identity
      submission = asked.ok
    }
    const result = await storage.commit({ identity, ...submission })
    if (result.kind === 'committed' || result.kind === 'rolled_back')
      saw(generations, key, attempt, result.kind)
    else if (result.kind === 'identity_conflict')
      saw(generations, key, attempt, result.existing.kind)
    const settled = fromResult(result, expected, mark)
    await afterSessionCommit({
      storage,
      domain: domain.domain,
      tenant: domain.text,
      session,
      answer: result.kind === 'committed' ? { receipt: result, recalled: result.recalled } : null,
      ...(context.options.workCache === undefined ? {} : { bounds: context.options.workCache }),
    })
    if (settled !== 'next-attempt') return settled
  }
}

export async function commit<P, K extends MutationName>(
  context: Context<P>,
  input: Readonly<{
    access: SessionAccess<P>
    command: Extract<SessionCommand, { kind: K }>
    guards: readonly GuardCommand[]
  }>,
): Promise<Outcome<unknown, SessionFailure>> {
  const command: SessionCommand = input.command
  const access: SessionAccess<P> | undefined = input.access
  if (
    access === undefined ||
    !tenantEquals(access.tenant, command.input.tenant) ||
    access.session !== command.input.session
  )
    return failure({ kind: 'denied', action: command.kind })
  const allowed = await context.access(mutationAccessRequest(access, command))
  if ('failure' in allowed) return allowed
  const domain = await domainOf(context, command.input.tenant)
  if ('failure' in domain) return domain
  const budget = await budgetTermsOf(context.options.budget, command)
  let facts: FactCommandV2
  try {
    const terms = prepareIntakeTerms(command, intakeBasisOf(context, allowed.ok.subject, budget))
    const guards = withIntakeTerms(input.guards, terms)
    const base = sessionCommandFacts(command, guards, context.intakeLimits)
    facts = { ...base, facts: { ...base.facts, evidence: encodeValue(allowed.ok.evidence) } }
  } catch (error) {
    return failure({
      kind: 'invalid',
      field: 'command',
      reason: error instanceof Error ? error.message : 'not JSON data',
    })
  }
  facts = await withCommitTime(context, facts)
  const expected = { operation: command.input.operation, digest: commandDigest(command) }
  const source = context.options.protectedBasis
  if (
    source === undefined ||
    command.kind !== 'change' ||
    command.input.declaration.kind !== 'permission-assignment'
  )
    return commitFacts(context, domain.ok, command.input.session, expected, facts)
  const qualification = allowed.ok.writeQualification
  if (qualification === undefined) return failure({ kind: 'denied', action: command.kind })
  return commitFacts(
    context,
    domain.ok,
    command.input.session,
    expected,
    facts,
    markRecovered,
    protectedSubmission(source, { access, command, qualification, session: facts }),
  )
}

async function lookup<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  session: string,
  operation: SessionOperationId,
  action: string,
): Promise<Outcome<Found | null, SessionFailure>> {
  const identity: SqlIdentity = {
    ...identityOf(domain, 'session.lookup', `lookup#${operation}#${randomUUID()}`),
    recall: 'never',
  }
  const result = await context.options.storage.commit({
    identity,
    ...ordinaryOf(
      context,
      sessionFacts({ intent: 'query', tenant: domain.text, session, operation }),
    ),
  })
  if (result.kind !== 'committed')
    return failure(unavailable(`the receipt lookup did not commit: ${result.kind}`))
  const entry = result.responses.find(item => item.participant === SESSION_PARTICIPANT)
  const answer = entry?.reply.kind === 'participated' ? entry.reply.response : null
  if (typeof answer !== 'object' || answer === null || !('kind' in answer))
    return failure(unavailable('the receipt lookup has no Session answer'))
  if (answer.kind === 'no-session') return failure({ kind: 'denied', action })
  return succeed(answer.kind === 'operation' ? (answer as Found) : null)
}

function leftNoRecord(receipt: ReceiptV2): boolean {
  const reply = receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)?.reply
  const said =
    reply?.kind === 'participated'
      ? reply.response
      : reply?.kind === 'conflict'
        ? reply.basis
        : null
  return (
    typeof said === 'object' &&
    said !== null &&
    !Array.isArray(said) &&
    (said as Readonly<Record<string, JsonValue>>)['recorded'] === false
  )
}

async function exclusion<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  operation: SessionOperationId,
  session: string,
): Promise<
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'attempt-rejected' }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'committed-unseen' }>
> {
  let rolledBack = false
  for (let attempt = 1; ; attempt += 1) {
    const found = await context.options.storage.query(
      identityOf(domain, operation, JSON.stringify([session, operation, attempt])),
    )
    if (found.kind === 'rolled_back') rolledBack ||= !leftNoRecord(found)
    else if (found.kind === 'unknown') return { kind: 'unknown' }
    else if (found.kind === 'committed')
      return leftNoRecord(found) ? { kind: 'unknown' } : { kind: 'committed-unseen' }
    else if (rolledBack) return { kind: 'attempt-rejected' }
    else
      return {
        kind: 'not-committed',
        exclusion: {
          owner: OWNER,
          record: `${domain.domain.transactionDomain}/${operation}`,
          revision: '1',
          digest: `sha256:${createHash('sha256').update(canonicalText(found)).digest('hex')}`,
        },
      }
  }
}

type Looked = Readonly<{ found: Found | null; rest: Rest | null }>

async function resolve<P>(
  context: Context<P>,
  access: SessionAccess<P>,
  operation: SessionOperationId,
  name: 'queryOperation' | 'queryControlOperation',
): Promise<Outcome<Looked, SessionFailure>> {
  const decided = await qualify(context, readAccessRequest(access, name))
  if ('failure' in decided) return decided
  const domain = await domainOf(context, access.tenant)
  if ('failure' in domain) return domain
  const found = await lookup(context, domain.ok, access.session, operation, name)
  if ('failure' in found) return found
  if (found.ok !== null) return succeed({ found: found.ok, rest: null })
  return succeed({
    found: null,
    rest: await exclusion(context, domain.ok, operation, access.session),
  })
}

type Unfound = ControlOperationResolution & OperationResolution

function unfound(rest: Rest, control: boolean): Outcome<Unfound, SessionFailure> {
  switch (rest.kind) {
    case 'committed-unseen':
      return failure(unavailable('a committed attempt has no original receipt'))
    case 'attempt-rejected':
      return control
        ? succeed({ kind: 'unknown' })
        : succeed({
            kind: 'attempt-rejected',
            original: 'unknown',
            reason: 'an attempt was rolled back',
          })
    case 'not-committed':
    case 'unknown':
      return succeed({ kind: 'unknown' })
  }
}

export async function queryOperation<P>(
  context: Context<P>,
  input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
): Promise<Outcome<OperationResolution, SessionFailure>> {
  const looked = await resolve(context, input, input.operation, 'queryOperation')
  if ('failure' in looked) return looked
  const { found, rest } = looked.ok
  if (found === null) return unfound(rest as Rest, false)
  if (found.form === 'control' || found.form === 'answer' || found.form === 'log')
    return failure({ kind: 'conflict', operation: input.operation })
  return succeed({ kind: 'committed', receipt: decodeValue(found.receipt) as CommitReceipt })
}

export async function queryControlOperation<P>(
  context: Context<P>,
  input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
): Promise<Outcome<ControlOperationResolution, SessionFailure>> {
  const looked = await resolve(context, input, input.operation, 'queryControlOperation')
  if ('failure' in looked) return looked
  const { found, rest } = looked.ok
  if (found === null) return unfound(rest as Rest, true)
  if (found.form === 'batch' || found.form === 'entries' || found.form === 'log')
    return failure({ kind: 'conflict', operation: input.operation })
  return succeed({ kind: 'committed', receipt: decodeValue(found.result) as never })
}
