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
import type {
  CommitRequestV2,
  CommitResultV2,
  JsonValue,
  ReceiptV2,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import { canonicalText, decodeValue, encodeValue } from './codec.ts'
import { OWNER } from './cursor.ts'
import {
  domainOf,
  failure,
  qualify,
  unavailable,
  type Context,
  type TenantDomainRef,
} from './context.ts'

const PARTICIPANT = 'session'

type Answer = Readonly<{ result: JsonValue; recovered: boolean; digest: string }>
/**
 * What a committed answer must match: the operation identity and the digest of its input. Another
 * digest under the same identity is another operation (SL07).
 */
export type Expected = Readonly<{ operation: SessionOperationId; digest: string }>
type Found = Readonly<{ kind: 'operation'; form: string; receipt: JsonValue; result: JsonValue }>
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
  facts: Readonly<Record<string, JsonValue>>,
): CommitRequestV2 => ({
  identity,
  ...context.options.combination,
  commands: [{ participant: PARTICIPANT, facts }],
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

function fromCommitted(
  receipt: ReceiptV2,
  expected: Expected,
  recall: boolean,
): Outcome<unknown, SessionFailure> {
  const reply = receipt.responses[0]?.reply
  if (reply?.kind !== 'participated')
    return failure(unavailable('a committed receipt without a response'))
  const answer = reply.response as Answer
  if (answer.digest !== expected.digest)
    return failure({ kind: 'conflict', operation: expected.operation })
  const value = decodeValue(answer.result)
  return succeed(recall || answer.recovered ? markRecovered(value) : value)
}

function fromRolledBack(receipt: ReceiptV2): Outcome<never, SessionFailure> {
  const stop = receipt.responses[receipt.responses.length - 1]?.reply
  if (stop?.kind === 'conflict')
    return failure(decodeValue((stop.basis as { failure: JsonValue }).failure) as SessionFailure)
  if (stop?.kind === 'unsupported')
    return failure({
      kind: 'invalid',
      field: 'command',
      reason: 'the participant does not support the facts',
    })
  if (stop?.kind === 'failed')
    return failure(unavailable(`participant failed (${stop.category}): ${stop.diagnostic}`))
  return failure(unavailable('a rolled back receipt without a stopping response'))
}

function fromResult(
  result: CommitResultV2,
  expected: Expected,
): Outcome<unknown, SessionFailure> | 'next-attempt' {
  switch (result.kind) {
    case 'committed':
      return fromCommitted(result, expected, false)
    case 'rolled_back':
      return fromRolledBack(result)
    case 'unknown':
      return failure({ kind: 'commit-unknown', operation: expected.operation })
    case 'identity_conflict':
      return result.existing.kind === 'rolled_back'
        ? 'next-attempt'
        : fromCommitted(result.existing, expected, true)
    case 'rejected_before_accept':
      return result.reason === 'writer_not_current'
        ? failure({ kind: 'commit-unknown', operation: expected.operation })
        : failure(unavailable(`storage rejected the commit: ${result.reason}`))
  }
}

/**
 * Commits the participant facts of one operation in the tenant domain. The attempt generation is
 * chosen by the storage receipts: a generation is used only when every earlier one is a rolled
 * back receipt, so an older attempt can never take effect beside a newer one (SPEC W1).
 */
export async function commitFacts<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  expected: Expected,
  facts: Readonly<Record<string, JsonValue>>,
): Promise<Outcome<unknown, SessionFailure>> {
  // Known limitation: the storage identity is `<SessionOperationId>#<generation>` in the tenant
  // domain, so one identity is one operation per tenant, not per session. An identity reused in
  // another session answers `conflict` and writes nothing (the safe side); the SL07 domain
  // (tenant, session, identity) relies on OP-00 never reusing an identity across sessions.
  const { operation } = expected
  const { storage } = context.options
  for (let attempt = 1; attempt <= context.attemptLimit; attempt += 1) {
    const identity = identityOf(domain, operation, `${operation}#${attempt}`)
    const found = await storage.query(identity)
    if (found.kind === 'rolled_back') continue
    if (found.kind === 'committed') return fromCommitted(found, expected, true)
    if (found.kind === 'unknown') return failure({ kind: 'commit-unknown', operation })
    const settled = fromResult(await storage.commit(requestOf(context, identity, facts)), expected)
    if (settled !== 'next-attempt') return settled
  }
  return failure(unavailable('every attempt generation of the operation was rolled back'))
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
  let facts: Record<string, JsonValue>
  try {
    facts = {
      intent: 'command',
      command: encodeValue(command),
      guards: encodeValue(input.guards),
    }
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
    { operation: command.input.operation, digest: commandDigest(command) },
    facts,
  )
}

/** The write-path lookup of the original receipt, in the transaction domain that owns it. */
async function lookup<P>(
  context: Context<P>,
  domain: TenantDomainRef,
  session: string,
  operation: SessionOperationId,
  action: string,
): Promise<Outcome<Found | null, SessionFailure>> {
  const identity = identityOf(domain, 'session.lookup', `lookup#${operation}#${randomUUID()}`)
  const result = await context.options.storage.commit(
    requestOf(context, identity, { intent: 'query', tenant: domain.text, session, operation }),
  )
  if (result.kind !== 'committed')
    return failure(unavailable(`the receipt lookup did not commit: ${result.kind}`))
  const answer = result.responses[0].reply.response as { kind: string }
  if (answer.kind === 'no-session') return failure({ kind: 'denied', action })
  return succeed(answer.kind === 'operation' ? (answer as Found) : null)
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
  for (let attempt = 1; attempt <= context.attemptLimit; attempt += 1) {
    const found = await context.options.storage.query(
      identityOf(domain, operation, `${operation}#${attempt}`),
    )
    if (found.kind === 'rolled_back') rolledBack = true
    else if (found.kind === 'unknown') return { kind: 'unknown' }
    else if (found.kind === 'committed') return { kind: 'committed-unseen' }
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
  return { kind: 'attempt-rejected' }
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
  // A control identity is not a batch identity (SL07). An entries record has a batch receipt.
  if (found.form === 'control' || found.form === 'answer')
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
  if (found.form === 'batch' || found.form === 'entries')
    return failure({ kind: 'conflict', operation: input.operation })
  return succeed({ kind: 'committed', receipt: decodeValue(found.result) as never })
}
