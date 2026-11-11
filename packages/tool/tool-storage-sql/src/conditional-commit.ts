// The ledger commit that takes effect only together with a condition: commands of other
// participants that run before the ledger write in the same SQL transaction (TS-12).
import type { LedgerCommit, LedgerCommitInput } from '@omne-harness/tool'
import { ledgerAnswer, type CommitAnswer } from './ledger-wire.ts'
import { conditionalLedgerCommit, type LedgerCommitCondition } from './ledger-store.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { PARTICIPANT } from './worker/schema.ts'

export type SqlToolConditionalCommitInput = Readonly<{
  condition: Readonly<Record<string, unknown>>
  ledger: LedgerCommitInput
}>

export type SqlToolConditionalCommitResult = LedgerCommit | Readonly<{ kind: 'condition-failed' }>

export type SqlToolConditionalCommit = Readonly<{
  commit(input: SqlToolConditionalCommitInput): Promise<SqlToolConditionalCommitResult>
}>

/** The SQL form of a condition. */
export type SqlToolCondition = LedgerCommitCondition

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isCommand(value: unknown): value is SqlToolCondition['commands'][number] {
  return (
    isRecord(value) &&
    typeof value['participant'] === 'string' &&
    value['participant'] !== PARTICIPANT &&
    isRecord(value['facts'])
  )
}

function conditionOf(value: Readonly<Record<string, unknown>>): SqlToolCondition | null {
  const { combinationVersion, manifestDigest, commands } = value
  return typeof combinationVersion === 'string' &&
    typeof manifestDigest === 'string' &&
    Array.isArray(commands) &&
    commands.length > 0 &&
    commands.every(isCommand)
    ? { combinationVersion, manifestDigest, commands }
    : null
}

/** What the store answers inside this module when a condition participant stopped the commit. */
const CONDITION_FAILED = 'tool-storage-sql: the condition of the commit did not hold'

/** A stop of another participant than the Tool participant is the condition: nothing took effect. */
function answerOf(answer: CommitAnswer): LedgerCommit {
  if (answer.kind === 'rolled_back') {
    const stop = answer.responses.at(-1)
    if (stop !== undefined && stop.participant !== PARTICIPANT)
      return { kind: 'rejected', reason: CONDITION_FAILED }
  }
  return ledgerAnswer(answer)
}

/**
 * The condition commands run before the ledger write in one SQL transaction. When a condition
 * participant stops the operation, nothing took effect and the answer is `condition-failed`.
 * A condition never names the Tool participant: it cannot write the ledger. The commit goes
 * through the keeper of the database, as every ledger commit of the process does (TS-16).
 */
export function createSqlToolConditionalCommit(
  options: SqlToolStorageOptions,
): SqlToolConditionalCommit {
  return {
    commit: async input => {
      const condition = conditionOf(input.condition)
      if (condition === null)
        return { kind: 'rejected', reason: 'start condition: not SQL commands' }
      const answer = await conditionalLedgerCommit(options, condition, answerOf)(input.ledger)
      return answer.kind === 'rejected' && answer.reason === CONDITION_FAILED
        ? { kind: 'condition-failed' }
        : answer
    },
  }
}
