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
 * - `unknown`: the outcome of a generation is not known; nothing may be assumed.
 * - `unavailable`: the storage refused before accepting, or every generation was rolled back.
 */
export type JournalCommitResult =
  | Readonly<{ kind: 'committed'; receipt: CommittedV2; recalled: boolean }>
  | Readonly<{ kind: 'rolled-back'; receipt: RolledBackV2 }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
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
    if (found.kind === 'unknown') return { kind: 'unknown', diagnostic: found.diagnostic ?? '' }
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
        return { kind: 'unknown', diagnostic: result.diagnostic ?? '' }
      case 'identity_conflict':
        if (result.existing.kind === 'rolled_back') continue
        return { kind: 'committed', receipt: result.existing, recalled: true }
      case 'rejected_before_accept':
        return result.reason === 'writer_not_current'
          ? { kind: 'unknown', diagnostic: 'the writer is not current' }
          : { kind: 'unavailable', diagnostic: `storage rejected the commit: ${result.reason}` }
    }
  }
  return { kind: 'unavailable', diagnostic: 'every attempt generation was rolled back' }
}
