import { describe, expect, it } from 'vitest'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import {
  INPUT_NOT_PENDING,
  SESSION_ORDINARY_BASIS,
  sessionOnlyRollbackExplained,
} from './cp3-rollbacks.ts'
import type { SeenCommit } from './world.ts'

const EXECUTION = 'run_1/execution'

const reply = (failure: Record<string, unknown>) => ({
  participant: 'session',
  protocol: '1',
  reply: { kind: 'conflict', basis: { failure, recorded: false } },
})

const rolledBack = (
  failure: Record<string, unknown>,
  log: SeenCommit['log'] = { execution: EXECUTION, sequence: '1' },
  participants: readonly string[] = ['session'],
): SeenCommit => ({
  participants,
  result: { kind: 'rolled_back', responses: [reply(failure)] } as unknown as CommitResultV2,
  log,
})

const rolledBackWithBasis = (
  failure: Record<string, unknown>,
  basisReply: Record<string, unknown> = { kind: 'participated', response: null },
): SeenCommit => ({
  participants: ['session', SESSION_ORDINARY_BASIS],
  result: {
    kind: 'rolled_back',
    responses: [
      { participant: SESSION_ORDINARY_BASIS, protocol: '1', reply: basisReply },
      reply(failure),
    ],
  } as unknown as CommitResultV2,
  log: { execution: EXECUTION, sequence: '1' },
})

const committed = (log: SeenCommit['log']): SeenCommit => ({
  participants: ['session'],
  result: { kind: 'committed' } as unknown as CommitResultV2,
  log,
})

const changed = { kind: 'changed', revision: '4' }
const nothingRead = (): string | null => '0'

describe('CP3: a rolled-back Session-only commit is explained only in the two R2-D152 ways', () => {
  it('accepts a rollback whose input another path took', () => {
    const commits = [
      rolledBack({ kind: 'invalid', field: 'fact.input', reason: INPUT_NOT_PENDING }),
    ]
    expect(sessionOnlyRollbackExplained(commits, 0, nothingRead)).toBe(true)
  })

  it('accepts changed when a later commitLog of the same execution and sequence committed', () => {
    const commits = [rolledBack(changed), committed({ execution: EXECUTION, sequence: '1' })]
    expect(sessionOnlyRollbackExplained(commits, 0, nothingRead)).toBe(true)
  })

  it('accepts changed when the saved progress of the execution reached the sequence', () => {
    const commits = [rolledBack(changed, { execution: EXECUTION, sequence: '2' })]
    expect(sessionOnlyRollbackExplained(commits, 0, () => '2')).toBe(true)
  })

  it('negative control: changed with no later commit and progress below the sequence is red', () => {
    const commits = [
      rolledBack(changed, { execution: EXECUTION, sequence: '2' }),
      committed({ execution: EXECUTION, sequence: '3' }),
      committed({ execution: 'run_2/execution', sequence: '2' }),
    ]
    expect(sessionOnlyRollbackExplained(commits, 0, () => '1')).toBe(false)
    expect(sessionOnlyRollbackExplained(commits, 0, () => null)).toBe(false)
    expect(
      sessionOnlyRollbackExplained(
        [committed({ execution: EXECUTION, sequence: '2' }), ...commits],
        1,
        () => '1',
      ),
    ).toBe(false)
  })

  it('an unavailable rollback is explained once its event committed later; without that it stays red (#1216 E1a)', () => {
    const unavailable = rolledBack({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: `history.executions.${EXECUTION}: required original material is missing`,
    })
    const commits = [unavailable, committed({ execution: EXECUTION, sequence: '1' })]
    expect(sessionOnlyRollbackExplained(commits, 0, nothingRead)).toBe(true)
    expect(sessionOnlyRollbackExplained([unavailable], 0, () => '1')).toBe(true)
    expect(sessionOnlyRollbackExplained([unavailable], 0, () => '0')).toBe(false)
  })

  it('judges the Session reply when the ordinary basis took part beside it', () => {
    const later = committed({ execution: EXECUTION, sequence: '1' })
    expect(
      sessionOnlyRollbackExplained([rolledBackWithBasis(changed), later], 0, nothingRead),
    ).toBe(true)
    expect(
      sessionOnlyRollbackExplained(
        [rolledBackWithBasis({ kind: 'invalid', field: 'fact.input', reason: INPUT_NOT_PENDING })],
        0,
        nothingRead,
      ),
    ).toBe(true)
    const unavailable = rolledBackWithBasis({
      kind: 'unavailable',
      owner: 'session-history',
      diagnostic: `history.prefix.${EXECUTION}.committedConsequences: required original material is missing`,
    })
    expect(sessionOnlyRollbackExplained([unavailable, later], 0, () => '1')).toBe(true)
    expect(sessionOnlyRollbackExplained([unavailable], 0, () => '0')).toBe(false)
    const refused = rolledBackWithBasis(changed, {
      kind: 'unsupported',
      basis: { reason: 'not an ordinary Session command' },
    })
    expect(sessionOnlyRollbackExplained([refused, later], 0, () => '1')).toBe(false)
  })

  it('a rollback with another participant, a commit that did not roll back, or no log is red', () => {
    const withRecords = rolledBack(changed, { execution: EXECUTION, sequence: '1' }, [
      'execution-record',
      'session',
    ])
    expect(
      sessionOnlyRollbackExplained(
        [withRecords, committed({ execution: EXECUTION, sequence: '1' })],
        0,
        () => '1',
      ),
    ).toBe(false)
    expect(
      sessionOnlyRollbackExplained(
        [committed({ execution: EXECUTION, sequence: '1' })],
        0,
        () => '1',
      ),
    ).toBe(false)
    expect(sessionOnlyRollbackExplained([rolledBack(changed, null)], 0, () => '9')).toBe(false)
  })
})
