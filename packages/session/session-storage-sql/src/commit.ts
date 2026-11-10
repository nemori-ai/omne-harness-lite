// The write path (SQL r2 section 17): `commit`, `commitEntries` and the original-receipt lookup go
// through the storage commit, the `session` participant. The response evidence of a rollback keeps
// the original failure basis, so no failure is recomputed outside the transaction.
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
import {
  SESSION_PARTICIPANT,
  decodeSessionReply,
  sessionCommandFacts,
  type SessionWorkReply,
} from './participants.ts'
import { foldCommitted } from './work-cache.ts'
import {
  domainOf,
  failure,
  qualify,
  unavailable,
  type Context,
  type TenantDomainRef,
} from './context.ts'

/**
 * What a committed answer must match: the operation identity and the digest of its input. Another
 * digest under the same identity is another operation (SL07).
 */
export type Expected = Readonly<{ operation: SessionOperationId; digest: string }>
type Found = Readonly<{
  kind: 'operation'
  form: string
  receipt: JsonValue
  result: JsonValue
  /** The access evidence stored with the record; null when its commit carried none. */
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

const requestOf = <P>(
  context: Context<P>,
  identity: SqlIdentity,
  command: FactCommandV2,
): CommitRequestV2 => ({
  identity,
  ...context.options.combination,
  commands: [command],
})

const sessionFacts = (facts: Readonly<Record<string, JsonValue>>): FactCommandV2 => ({
  participant: SESSION_PARTICIPANT,
  facts,
})

/** A recalled result says so: the receipt inside it, or the receipt it is, carries `recovered`. */
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

/** How a recalled result says it is a recall. */
export type Recall = (value: unknown) => unknown

/** Takes the work of a fresh committed reply (SPEC RT-04): never one of a recall. */
type OnWork = (work: SessionWorkReply) => void

function fromCommitted(
  receipt: ReceiptV2,
  expected: Expected,
  recall: boolean,
  mark: Recall = markRecovered,
  onWork?: OnWork,
): Outcome<unknown, SessionFailure> {
  const entry = receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
  if (entry?.reply.kind !== 'participated')
    return failure(unavailable('a committed receipt without a response'))
  const answer = decodeSessionReply(entry.reply)
  if (answer.kind !== 'participated') return failure(unavailable('an undecodable session reply'))
  if (answer.digest !== expected.digest)
    return failure({ kind: 'conflict', operation: expected.operation })
  if (recall || answer.recovered) return succeed(mark(answer.result))
  if (answer.work !== undefined) onWork?.(answer.work)
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
      // The participant reports only temporary failures; a definite one is a conflict. Every other
      // category is decided by the provider from the input and the committed data, so the same
      // operation fails the same way (W1 step 9, sql-contract §7.6).
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
  onWork: OnWork,
): Outcome<unknown, SessionFailure> | 'next-attempt' {
  switch (result.kind) {
    case 'committed':
      return fromCommitted(result, expected, false, mark, onWork)
    case 'rolled_back':
      return fromRolledBack(result)
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

/** The process memory of one storage operation's generations: tenant, domain and operation. */
const generationKey = (domain: TenantDomainRef, operation: string): string =>
  JSON.stringify([domain.text, domain.domain.transactionDomain, operation])

/**
 * Notes what generation `attempt` of `key` turned out to be (SPEC W1 attempts, step 3). A rolled
 * back generation stays rolled back, so the next search starts after it; a committed operation is
 * forgotten. An unknown generation is asked again.
 */
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

/**
 * Commits the participant facts of one operation of `session` in the tenant domain. The attempt
 * generation is chosen by the storage receipts: a generation is used only when every earlier one is
 * a rolled back receipt, so an older attempt can never take effect beside a newer one (SPEC W1).
 * `mark` says of a recalled result that it is a recall; the default fits a batch or control result.
 * A fresh committed batch is folded into the work cache before the answer returns (SPEC RT-04); a
 * fold that cannot be made registers nothing and never changes the answer.
 */
export async function commitFacts<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  session: string,
  expected: Expected,
  command: FactCommandV2,
  mark: Recall = markRecovered,
): Promise<Outcome<unknown, SessionFailure>> {
  // Known limitation: the storage identity is `<SessionOperationId>#<generation>` in the tenant
  // domain, so one identity is one operation per tenant, not per session. An identity reused in
  // another session answers `conflict` and writes nothing (the safe side); the SL07 domain
  // (tenant, session, identity) relies on OP-00 never reusing an identity across sessions.
  const { operation } = expected
  const { storage } = context.options
  const { generations } = context
  const key = generationKey(domain, operation)
  // No bound: every refusal of the participant, `changed` included, rolls back and uses up a
  // generation, and the caller comes again with the same operation (SPEC W1 attempts).
  for (let attempt = (generations.get(key) ?? 0) + 1; ; attempt += 1) {
    const identity = identityOf(domain, operation, `${operation}#${attempt}`)
    const found = await storage.query(identity)
    saw(generations, key, attempt, found.kind)
    if (found.kind === 'rolled_back') continue
    if (found.kind === 'committed') return fromCommitted(found, expected, true, mark)
    if (found.kind === 'unknown') return failure({ kind: 'commit-unknown', operation })
    let work: SessionWorkReply | undefined
    const result = await storage.commit(requestOf(context, identity, command))
    if (result.kind === 'committed' || result.kind === 'rolled_back')
      saw(generations, key, attempt, result.kind)
    else if (result.kind === 'identity_conflict')
      saw(generations, key, attempt, result.existing.kind)
    const settled = fromResult(result, expected, mark, fresh => {
      work = fresh
    })
    if (work !== undefined)
      await foldCommitted(
        {
          storage,
          domain: domain.domain,
          tenant: domain.text,
          session,
          ...(context.options.workCache === undefined ? {} : { bounds: context.options.workCache }),
        },
        work,
      )
    if (settled !== 'next-attempt') return settled
  }
}

/** Commits one command under the explicit access of this call. */
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
  const decided = await qualify(context, mutationAccessRequest(access, command))
  if ('failure' in decided) return decided
  // A Tool target is refused before any identity, session or storage lookup (SPEC XC-INTERRUPT).
  if (command.kind === 'stopCall' && command.input.producer.kind === 'tool')
    return failure({ kind: 'unsupported' })
  const domain = await domainOf(context, command.input.tenant)
  if ('failure' in domain) return domain
  let facts: FactCommandV2
  try {
    // The allowed decision goes into the facts, so the participant writes it with the operation
    // record in the same transaction (session-contract SPEC「当前操作的访问裁定」).
    const base = sessionCommandFacts(command, input.guards)
    facts = { ...base, facts: { ...base.facts, evidence: encodeValue(decided.ok) } }
  } catch (error) {
    return failure({
      kind: 'invalid',
      field: 'command',
      reason: error instanceof Error ? error.message : 'not JSON data',
    })
  }
  return commitFacts(
    context,
    domain.ok,
    command.input.session,
    { operation: command.input.operation, digest: commandDigest(command) },
    facts,
  )
}

/**
 * The write-path lookup of the original receipt, in the transaction domain that owns it. The
 * lookup writes nothing and nobody recalls it, so it keeps no receipt of its own (sql-contract §3.1).
 */
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
  const result = await context.options.storage.commit(
    requestOf(
      context,
      identity,
      sessionFacts({ intent: 'query', tenant: domain.text, session, operation }),
    ),
  )
  if (result.kind !== 'committed')
    return failure(unavailable(`the receipt lookup did not commit: ${result.kind}`))
  const answer = result.responses[0].reply.response as { kind: string }
  if (answer.kind === 'no-session') return failure({ kind: 'denied', action })
  return succeed(answer.kind === 'operation' ? (answer as Found) : null)
}

/**
 * True when the attempt left no record of its own identity and says so: a log commit that recalled
 * the interpretation of another operation (committed), or that the pure layer refused (rolled
 * back). Such an identity stays unknown, as in the memory pair, and is not a rejected attempt.
 */
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

/** An original that has no receipt: ask the storage about every attempt generation (SPEC R7). */
async function exclusion<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  operation: SessionOperationId,
): Promise<
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'attempt-rejected' }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'committed-unseen' }>
> {
  let rolledBack = false
  // From `#1` and without a bound: generation 1 tells not-committed from attempt-rejected, and the
  // rolled back generations are finite, so the search always stops (SPEC R7).
  for (let attempt = 1; ; attempt += 1) {
    const found = await context.options.storage.query(
      identityOf(domain, operation, `${operation}#${attempt}`),
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
  return succeed({ found: null, rest: await exclusion(context, domain.ok, operation) })
}

type Unfound = ControlOperationResolution & OperationResolution

/**
 * R7: the entry that tells a participating operation from a Session operation is missing, so a
 * clean generation 1 never proves the operation was not committed (a participating operation
 * never uses this storage identity). It answers `unknown`. Only a rolled back later generation
 * is `attempt-rejected`, and that answer is for `queryOperation` only.
 */
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
  // A control identity is not a batch identity (SL07). An entries record has a batch receipt. A
  // log record has neither: a caller of unknown outcome retries `commitLog` with the same identity.
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
