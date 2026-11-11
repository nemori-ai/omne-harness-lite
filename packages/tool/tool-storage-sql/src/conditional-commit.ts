import type { ContentBlock } from '@omne-harness/content-block'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import type { LedgerCommit, LedgerCommitInput } from '@omne-harness/tool'
import { NotJsonError } from './json.ts'
import { addressOf, ledgerAnswer, notJson, unavailable, writesOf } from './ledger-wire.ts'
import type { CommitAnswer } from './ledger-wire.ts'
import type { SqlToolStorageOptions } from './options.ts'
import { requestOf, resolveTenant } from './tenant.ts'
import type { LedgerFacts, LedgerWriteFact } from './worker/facts.ts'
import { PARTICIPANT } from './worker/schema.ts'

export type SqlToolConditionalCommitInput<B extends ContentBlock> = Readonly<{
  condition: Readonly<Record<string, unknown>>
  ledger: LedgerCommitInput<B>
}>

export type SqlToolConditionalCommitResult = LedgerCommit | Readonly<{ kind: 'condition-failed' }>

export type SqlToolConditionalCommit<B extends ContentBlock> = Readonly<{
  commit(input: SqlToolConditionalCommitInput<B>): Promise<SqlToolConditionalCommitResult>
}>

/**
 * The SQL form of a condition: commands of other participants, and the registered combination
 * that holds those participants together with the Tool participant.
 */
export type SqlToolCondition = Readonly<{
  combinationVersion: string
  manifestDigest: string
  commands: readonly FactCommandV2[]
}>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isCommand(value: unknown): value is FactCommandV2 {
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

function answerOf(answer: CommitAnswer): SqlToolConditionalCommitResult {
  if (answer.kind === 'rolled_back') {
    const stop = answer.responses.at(-1)
    if (stop !== undefined && stop.participant !== PARTICIPANT) return { kind: 'condition-failed' }
  }
  return ledgerAnswer(answer)
}

/**
 * The condition commands run before the ledger write in one SQL transaction. When a condition
 * participant stops the operation, nothing took effect and the answer is `condition-failed`.
 * A condition never names the Tool participant: it cannot write the ledger.
 */
export function createSqlToolConditionalCommit<B extends ContentBlock = ContentBlock>(
  options: SqlToolStorageOptions,
): SqlToolConditionalCommit<B> {
  return {
    commit: async input => {
      const condition = conditionOf(input.condition)
      if (condition === null)
        return { kind: 'rejected', reason: 'start condition: not SQL commands' }
      const resolved = await resolveTenant(options, input.ledger.domain.tenant)
      if (resolved.kind !== 'ready') return unavailable(resolved.diagnostic)
      let writes: readonly LedgerWriteFact[]
      try {
        writes = writesOf(input.ledger)
      } catch (error) {
        if (error instanceof NotJsonError) return notJson(error)
        throw error
      }
      const facts: LedgerFacts = {
        ...addressOf(resolved.at.tenant, input.ledger.domain),
        intent: 'ledger',
        expected: input.ledger.expected,
        revision: input.ledger.revision,
        writes,
      }
      const ledger = requestOf(options, resolved.at, facts)
      return answerOf(
        await options.storage.commit({
          ...ledger,
          combinationVersion: condition.combinationVersion,
          manifestDigest: condition.manifestDigest,
          commands: [...condition.commands, ...ledger.commands],
        }),
      )
    },
  }
}
