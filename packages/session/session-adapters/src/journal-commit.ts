import type { Failure } from '@omne-harness/agent-contract'
import {
  commitRejectionNature,
  type CommitRejectReason,
  type CommitRejectedV2,
  type CommitRequestV2,
  type CommittedV2,
  type DomainRef,
  type FactCommandV2,
  type RolledBackV2,
  type SqlIdentity,
  type SqlStorage,
} from '@omne-harness/sql-contract'

export type JournalCombination = Readonly<{ combinationVersion: string; manifestDigest: string }>

export type JournalCommitResult =
  | Readonly<{ kind: 'committed'; receipt: CommittedV2; recalled: boolean }>
  | Readonly<{ kind: 'rolled-back'; receipt: RolledBackV2 }>
  | Readonly<{ kind: 'unknown'; diagnostic: string; attempt: number }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'refused'; reason: CommitRejectReason; said: string; diagnostic: string }>

const UNSUPPORTED: ReadonlySet<CommitRejectReason> = new Set([
  'combination_unregistered',
  'participant_not_in_combination',
])

type Refused = Extract<JournalCommitResult, { kind: 'refused' }>

// The reason the Agent reads is what the storage said: for a limit it names which one and by how much.
export const refusalFailure = ({ reason, said }: Pick<Refused, 'reason' | 'said'>): Failure =>
  UNSUPPORTED.has(reason)
    ? { kind: 'unsupported' }
    : { kind: 'invalid', field: 'storage', reason: said }

export type JournalRecall = SqlIdentity['recall']

export type JournalCommitInput = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  combination: JournalCombination
  operation: string
  recall: JournalRecall
  commands: readonly FactCommandV2[]
  generations: GenerationMemory
  singleAttempt?: true
}>

export type GenerationMemory = Map<string, number>

const memoryKey = (domain: DomainRef, operation: string): string =>
  [
    domain.scope.kind === 'tenant' ? `tenant:${domain.scope.tenant}` : 'system',
    domain.transactionDomain,
    operation,
  ].join('\0')

const identityOf = (
  domain: DomainRef,
  operation: string,
  attempt: number,
  recall: JournalRecall,
): SqlIdentity => ({
  scope: domain.scope,
  transactionDomain: domain.transactionDomain,
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#${String(attempt)}`,
  ...(recall === undefined ? {} : { recall }),
})

export async function commitJournal(input: JournalCommitInput): Promise<JournalCommitResult> {
  const key = memoryKey(input.domain, input.operation)
  const result = await commitFrom(
    input,
    input.singleAttempt ? 1 : (input.generations.get(key) ?? 1),
  )
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

async function commitGeneration(
  input: JournalCommitInput,
  attempt: number,
): Promise<JournalCommitResult | 'rolled back'> {
  const request: CommitRequestV2 = {
    identity: identityOf(input.domain, input.operation, attempt, input.recall),
    ...input.combination,
    commands: input.commands,
  }
  const result = await input.storage.commit(request)
  switch (result.kind) {
    case 'committed': {
      const { recalled, ...receipt } = result
      return { kind: 'committed', receipt, recalled }
    }
    case 'rolled_back': {
      const { recalled, ...receipt } = result
      return recalled && !input.singleAttempt ? 'rolled back' : { kind: 'rolled-back', receipt }
    }
    case 'unknown':
      return { kind: 'unknown', diagnostic: result.diagnostic ?? '', attempt }
    case 'identity_conflict':
      if (result.existing.kind === 'rolled_back')
        return input.singleAttempt
          ? { kind: 'rolled-back', receipt: result.existing }
          : 'rolled back'
      return { kind: 'committed', receipt: result.existing, recalled: true }
    case 'rejected_before_accept':
      return beforeAccept(result, attempt)
  }
}

function beforeAccept(
  { reason, diagnostic: words }: Pick<CommitRejectedV2, 'reason' | 'diagnostic'>,
  attempt: number,
): JournalCommitResult {
  const said = words ?? reason
  if (reason === 'writer_not_current')
    return { kind: 'unknown', diagnostic: 'the writer is not current', attempt }
  const diagnostic = `storage rejected the commit: ${said}`
  return commitRejectionNature(reason) === 'temporary'
    ? { kind: 'unavailable', diagnostic }
    : { kind: 'refused', reason, said, diagnostic }
}

// not-run does not prove the generation was sent and dropped: the storage cannot tell that from never sent. Only a caller that knows it sent it may read it so.
export type GenerationStanding = 'committed' | 'not-run' | 'settled' | 'unknown'

export async function standingOf(
  storage: SqlStorage,
  domain: DomainRef,
  operation: string,
  attempt: number,
  recall: JournalRecall,
): Promise<GenerationStanding> {
  try {
    const found = await storage.query(identityOf(domain, operation, attempt, recall))
    switch (found.kind) {
      case 'committed':
        return 'committed'
      case 'rolled_back':
      case 'not_committed':
        return 'not-run'
      case 'settled':
        return 'settled'
      case 'unknown':
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}
