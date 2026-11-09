// The storage commit protocol of the Agent Journal provider: the Journal provider is itself the
// committer of the first publication point (P5, split X). One Agent operation is one storage
// operation identity in the tenant's transaction domain; its attempt generation is `#<n>`. A
// generation is used only when every earlier one is a rolled back receipt, so an older attempt can
// never take effect beside a newer one. The same rules are in session-storage-sql `commit.ts`;
// this second copy is the known limitation K-6 of session-adapters SPEC.
import {
  SESSION_PARTICIPANT,
  type SessionWorkReply,
} from '@omne-harness/session-storage-sql/participants'
import type { Failure } from '@omne-harness/agent-contract'
import {
  commitRejectionNature,
  type CommitRejectReason,
  type CommitRequestV2,
  type CommittedV2,
  type DomainRef,
  type FactCommandV2,
  type JsonValue,
  type RolledBackV2,
  type SqlIdentity,
  type SqlStorage,
} from '@omne-harness/sql-contract'

export type JournalCombination = Readonly<{ combinationVersion: string; manifestDigest: string }>

/**
 * - `committed`: the receipt of the generation that committed. `recalled` when this call did not
 *   send it (a committed earlier generation, or the existing receipt of an identity conflict): the
 *   caller tells the same operation from another by the digest in the receipt.
 * - `rolled-back`: the generation this call sent was rolled back by a stopping reply.
 * - `unknown`: the outcome of generation `attempt` is not known; nothing may be assumed. The caller
 *   keeps the generation to ask `standingOf` later.
 * - `unavailable`: the storage refused before accepting, for a temporary reason; the same operation
 *   may commit later.
 * - `refused`: the storage refused before accepting, for a definite reason; the same operation
 *   gets the same refusal (sql-contract "提交拒绝原因的定性").
 */
export type JournalCommitResult =
  | Readonly<{ kind: 'committed'; receipt: CommittedV2; recalled: boolean }>
  | Readonly<{ kind: 'rolled-back'; receipt: RolledBackV2 }>
  | Readonly<{ kind: 'unknown'; diagnostic: string; attempt: number }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'refused'; reason: CommitRejectReason; diagnostic: string }>

/** The reasons the Agent contract answers `unsupported`: a missing combination or participant. */
const UNSUPPORTED: ReadonlySet<CommitRejectReason> = new Set([
  'combination_unregistered',
  'participant_not_in_combination',
])

/**
 * The Agent failure of a definite refusal (SPEC 生产提供者的实现现状, step 6): `unsupported` for a
 * missing combination or participant, `invalid` on the field `storage` otherwise.
 */
export const refusalFailure = (reason: CommitRejectReason): Failure =>
  UNSUPPORTED.has(reason) ? { kind: 'unsupported' } : { kind: 'invalid', field: 'storage', reason }

const isCount = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value)

type JsonRecord = Readonly<{ readonly [key: string]: JsonValue }>

const recordOf = (value: JsonValue | undefined): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined

/**
 * The `work` of a fresh Session reply, read field by field: the same reading as `workReplyOf` of
 * session-storage-sql `participants.ts`, which that package does not export (the second copy is
 * the known limitation K-6). It reads `digest`, `recovered` and `work` and never the `result`, so
 * a Session result this provider cannot decode (a tenant value that does not parse) cannot reach
 * it. It never throws.
 */
function freshWorkOf(response: JsonValue): SessionWorkReply | undefined {
  const reply = recordOf(response)
  if (reply === undefined || typeof reply['digest'] !== 'string') return undefined
  if (reply['recovered'] === true) return undefined
  const work = recordOf(reply['work'])
  if (work === undefined) return undefined
  const { tail, published, bytes, first, last, indexed, basis } = work
  if (![tail, published, first, last].every(isCount)) return undefined
  if (typeof bytes !== 'number' || typeof indexed !== 'boolean') return undefined
  return {
    tail: tail as string,
    published: published as string,
    bytes,
    first: first as string,
    last: last as string,
    indexed,
    ...(basis === undefined ? {} : { basis }),
  }
}

/**
 * What the Session participation of a joint commit tells the work cache (session-storage-sql
 * RT-04): only from a commit this call sent and that committed, never from a recall, a recovered
 * Session answer or a rolled back commit. Only the `work` of the reply is read, so no content of
 * its `result` can make this throw.
 */
export function jointSessionWork(outcome: JournalCommitResult): SessionWorkReply | undefined {
  if (outcome.kind !== 'committed' || outcome.recalled) return undefined
  const entry = outcome.receipt.responses.find(item => item.participant === SESSION_PARTICIPANT)
  if (entry?.reply.kind !== 'participated') return undefined
  return freshWorkOf(entry.reply.response)
}

export type JournalCommitInput = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combination: JournalCombination
  /** The storage operation of one Agent operation; the same Agent operation gives the same text. */
  operation: string
  commands: readonly FactCommandV2[]
  /** The provider's memory of the largest generation seen per operation; see `GenerationMemory`. */
  generations: GenerationMemory
}>

/**
 * The largest generation a provider has seen per storage operation, so the next write of the
 * operation starts there and not at `#1`. Every generation below it is a rolled back receipt,
 * which is final. Only an operation past `#1` is kept, and a write that commits forgets it; a
 * restarted process starts at `#1`
 * (SPEC 生产提供者的实现现状, step 6).
 */
export type GenerationMemory = Map<string, number>

const memoryKey = (domain: DomainRef, operation: string): string =>
  `${domain.scope}\0${domain.transactionDomain}\0${operation}`

const identityOf = (domain: DomainRef, operation: string, attempt: number): SqlIdentity => ({
  scope: domain.scope,
  transactionDomain: domain.transactionDomain,
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#${String(attempt)}`,
})

/**
 * Commits with the first generation that is not a rolled back receipt. There is no bound on the
 * generations: the rolled back ones of one operation add up over many temporary failures, and a
 * bound would end the operation for good after enough of them.
 */
export async function commitJournal(input: JournalCommitInput): Promise<JournalCommitResult> {
  const key = memoryKey(input.domain, input.operation)
  const result = await commitFrom(input, input.generations.get(key) ?? 1)
  if (result.outcome.kind === 'committed' || result.attempt === 1) input.generations.delete(key)
  else input.generations.set(key, result.attempt)
  return result.outcome
}

async function commitFrom(
  input: JournalCommitInput,
  first: number,
): Promise<Readonly<{ outcome: JournalCommitResult; attempt: number }>> {
  for (let attempt = first; ; attempt += 1) {
    const outcome = await commitGeneration(input, attempt)
    if (outcome !== 'rolled back') return { outcome, attempt }
  }
}

/** One generation: its answer, or `rolled back` when it is an earlier rolled back receipt. */
async function commitGeneration(
  input: JournalCommitInput,
  attempt: number,
): Promise<JournalCommitResult | 'rolled back'> {
  const identity = identityOf(input.domain, input.operation, attempt)
  const found = await input.storage.query(identity)
  if (found.kind === 'rolled_back') return 'rolled back'
  if (found.kind === 'committed') return { kind: 'committed', receipt: found, recalled: true }
  // The storage could not answer whether this generation ran. This call has sent nothing, so there
  // is no write of its own to hold: the same operation comes again, and a send of an earlier
  // process, if it took effect, is recalled by the query then (SPEC 生产提供者的实现现状, step 6).
  if (found.kind === 'unknown')
    return {
      kind: 'unavailable',
      diagnostic: `the storage could not tell whether the write ran: ${found.diagnostic ?? ''}`,
    }
  const request: CommitRequestV2 = {
    identity,
    ...input.combination,
    commands: input.commands,
  }
  const result = await input.storage.commit(request)
  switch (result.kind) {
    case 'committed':
      return { kind: 'committed', receipt: result, recalled: false }
    case 'rolled_back':
      return { kind: 'rolled-back', receipt: result }
    case 'unknown':
      return { kind: 'unknown', diagnostic: result.diagnostic ?? '', attempt }
    case 'identity_conflict':
      if (result.existing.kind === 'rolled_back') return 'rolled back'
      return { kind: 'committed', receipt: result.existing, recalled: true }
    case 'rejected_before_accept':
      return beforeAccept(result.reason, attempt)
  }
}

/**
 * A refusal before acceptance: `writer_not_current` leaves the generation unknown (SPEC step 6);
 * the others follow sql-contract "提交拒绝原因的定性".
 */
function beforeAccept(reason: CommitRejectReason, attempt: number): JournalCommitResult {
  if (reason === 'writer_not_current')
    return { kind: 'unknown', diagnostic: 'the writer is not current', attempt }
  const diagnostic = `storage rejected the commit: ${reason}`
  return commitRejectionNature(reason) === 'temporary'
    ? { kind: 'unavailable', diagnostic }
    : { kind: 'refused', reason, diagnostic }
}

/**
 * What the storage says of generation `attempt` of `operation` after a call left it unknown:
 * - `committed`: it took effect; the durable records hold its write.
 * - `not-run`: it did not and, by the storage's proof (`not_committed`) or its rollback receipt,
 *   never will: the write is excluded.
 * - `unknown`: still undecided, or the storage could not be asked.
 * The storage cannot tell a generation that was sent and dropped from one never sent, so only a
 * caller that knows it sent the generation may read `not-run` as "dropped".
 */
export type GenerationStanding = 'committed' | 'not-run' | 'unknown'

export async function standingOf(
  storage: SqlStorage,
  domain: DomainRef,
  operation: string,
  attempt: number,
): Promise<GenerationStanding> {
  try {
    const found = await storage.query(identityOf(domain, operation, attempt))
    switch (found.kind) {
      case 'committed':
        return 'committed'
      case 'rolled_back':
      case 'not_committed':
        return 'not-run'
      case 'unknown':
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}
