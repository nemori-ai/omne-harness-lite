// The storage commit protocol of the Agent Journal provider: the Journal provider is itself the
// committer of the first publication point (P5, split X). One Agent operation is one storage
// operation identity in the tenant's transaction domain; its attempt generation is `#<n>`. A
// generation is used only when every earlier one is a rolled back receipt, so an older attempt can
// never take effect beside a newer one. The same rules are in session-storage-sql `commit.ts`;
// this second copy is the known limitation K-6 of session-adapters SPEC.
import type {
  CommitRequestV2,
  CommittedV2,
  DomainRef,
  FactCommandV2,
  RolledBackV2,
  SqlIdentity,
  SqlStorage,
} from '@omne-harness/sql-contract'

export type JournalCombination = Readonly<{ combinationVersion: string; manifestDigest: string }>

/**
 * - `committed`: the receipt of the generation that committed. `recalled` when this call did not
 *   send it (a committed earlier generation, or the existing receipt of an identity conflict): the
 *   caller tells the same operation from another by the digest in the receipt.
 * - `rolled-back`: the generation this call sent was rolled back by a stopping reply.
 * - `unknown`: the outcome of generation `attempt` is not known; nothing may be assumed. The caller
 *   keeps the generation to ask `standingOf` later.
 * - `unavailable`: the storage refused before accepting, or every generation was rolled back.
 */
export type JournalCommitResult =
  | Readonly<{ kind: 'committed'; receipt: CommittedV2; recalled: boolean }>
  | Readonly<{ kind: 'rolled-back'; receipt: RolledBackV2 }>
  | Readonly<{ kind: 'unknown'; diagnostic: string; attempt: number }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type JournalCommitInput = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combination: JournalCombination
  /** The storage operation of one Agent operation; the same Agent operation gives the same text. */
  operation: string
  commands: readonly FactCommandV2[]
  attemptLimit?: number
}>

/**
 * The number of attempt generations one operation may use. A fixed policy of this provider, not a
 * configuration: a storage that rolled back eight generations of one operation is not one a retry
 * helps (session-adapters SPEC, "生产提供者的实现现状" step 6). `attemptLimit` is for tests.
 */
const ATTEMPTS = 8

const identityOf = (domain: DomainRef, operation: string, attempt: number): SqlIdentity => ({
  scope: domain.scope,
  transactionDomain: domain.transactionDomain,
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#${String(attempt)}`,
})

export async function commitJournal(input: JournalCommitInput): Promise<JournalCommitResult> {
  const limit = input.attemptLimit ?? ATTEMPTS
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const identity = identityOf(input.domain, input.operation, attempt)
    const found = await input.storage.query(identity)
    if (found.kind === 'rolled_back') continue
    if (found.kind === 'committed') return { kind: 'committed', receipt: found, recalled: true }
    if (found.kind === 'unknown')
      return { kind: 'unknown', diagnostic: found.diagnostic ?? '', attempt }
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
        if (result.existing.kind === 'rolled_back') continue
        return { kind: 'committed', receipt: result.existing, recalled: true }
      case 'rejected_before_accept':
        return result.reason === 'writer_not_current'
          ? { kind: 'unknown', diagnostic: 'the writer is not current', attempt }
          : { kind: 'unavailable', diagnostic: `storage rejected the commit: ${result.reason}` }
    }
  }
  return { kind: 'unavailable', diagnostic: 'every attempt generation was rolled back' }
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
