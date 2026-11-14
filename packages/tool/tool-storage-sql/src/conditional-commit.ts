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

const CONDITION_FAILED = 'tool-storage-sql: the condition of the commit did not hold'

function answerOf(answer: CommitAnswer): LedgerCommit {
  if (answer.kind === 'rolled_back') {
    const stop = answer.responses.at(-1)
    if (stop !== undefined && stop.participant !== PARTICIPANT)
      return { kind: 'rejected', reason: CONDITION_FAILED }
  }
  return ledgerAnswer(answer)
}

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
