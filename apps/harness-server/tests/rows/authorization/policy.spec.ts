// The Session and Agent policy tables (DP-4): every row of the enumerations is present, every
// allowing cell carries a source, the two D items are default denials, and `accept` is judged by
// the branch of its RoutedInput.
import { describe, expect, it } from 'vitest'
import { SYSTEM_ACTION_MATRIX } from '@omne-harness/authorization'
import {
  AGENT_POLICY,
  DECISION_ITEMS,
  PENDING_LABEL,
  SESSION_POLICY,
  auditPolicy,
  cite,
  resolveCell,
  type PolicyCell,
  type PolicyRow,
} from '../../../src/rows/authorization/index.ts'

const COLUMNS = ['login', 'work', 'system'] as const

function cells(table: Readonly<Record<string, PolicyRow>>) {
  return Object.entries(table).flatMap(([operation, row]) =>
    COLUMNS.map(column => ({ operation, column, cell: row[column] })),
  )
}

const allows = (cell: PolicyCell) => cell.verdict === 'member' || cell.verdict === 'matrix'

describe('row coverage', () => {
  it('has the 39 Session rows and the 26 Agent rows of the baseline enumerations', () => {
    expect(Object.keys(SESSION_POLICY)).toHaveLength(39)
    expect(Object.keys(AGENT_POLICY)).toHaveLength(26)
  })

  it('has one row for each named enumeration member', () => {
    for (const name of ['history.since', 'pending', 'references', 'releasedScopes', 'accept'])
      expect(SESSION_POLICY).toHaveProperty(name)
    for (const name of ['publish', 'quiesce', 'withdraw', 'reserve', 'migrate-cancellation'])
      expect(AGENT_POLICY).toHaveProperty(name)
  })

  it('passes the audit with no findings', () => {
    const audit = auditPolicy()
    expect(audit.findings).toEqual([])
    expect(audit.session.rows).toBe(39)
    expect(audit.agent.rows).toBe(26)
  })
})

describe('sources', () => {
  it('has zero allowing cells without a source', () => {
    const audit = auditPolicy()
    expect(audit.session.allowedCellsWithoutSource).toBe(0)
    expect(audit.agent.allowedCellsWithoutSource).toBe(0)
    for (const { cell } of [...cells(SESSION_POLICY), ...cells(AGENT_POLICY)]) {
      if (!allows(cell)) continue
      expect(typeof cell.source).toBe('string')
      expect(cell.source.trim().length).toBeGreaterThan(0)
    }
  })

  it('counts 48 allowing cells in the Session table and 14 in the Agent table', () => {
    expect(auditPolicy().session.allowedCells).toBe(48)
    expect(auditPolicy().agent.allowedCells).toBe(14)
  })

  it('rejects an empty citation at construction', () => {
    expect(() => cite('')).toThrow()
    expect(() => cite('   ')).toThrow()
  })

  it('reports the cell whose source was removed', () => {
    const { source: _dropped, ...withoutSource } = AGENT_POLICY.takeover.work as Extract<
      PolicyCell,
      { verdict: 'member' }
    >
    const mutated = {
      ...AGENT_POLICY,
      takeover: { ...AGENT_POLICY.takeover, work: withoutSource as unknown as PolicyCell },
    }
    const audit = auditPolicy({ agent: mutated })
    expect(audit.agent.allowedCellsWithoutSource).toBe(1)
    expect(audit.findings.some(text => text.includes('takeover'))).toBe(true)
  })
})

describe('system column and the matrix', () => {
  it('uses matrix cells only in the system column, and member cells only for tenant principals', () => {
    for (const { column, cell } of [...cells(SESSION_POLICY), ...cells(AGENT_POLICY)]) {
      if (cell.verdict === 'matrix') expect(column).toBe('system')
      if (cell.verdict === 'member') expect(column).not.toBe('system')
    }
  })

  it('names only purposes of SYSTEM_ACTION_MATRIX, each bound to the row of the same operation', () => {
    const purposes = new Map(SYSTEM_ACTION_MATRIX.map(row => [row.purpose, row]))
    for (const [owner, table] of [
      ['session', SESSION_POLICY],
      ['agent', AGENT_POLICY],
    ] as const) {
      for (const { operation, cell } of cells(table)) {
        if (cell.verdict !== 'matrix') continue
        const row = purposes.get(cell.purpose)
        expect(row, cell.purpose).toBeDefined()
        expect(row?.operation).toEqual({ owner, name: operation })
      }
    }
  })

  it('routes publish, quiesce and withdraw of the Agent table through the three agent instance rows', () => {
    expect(AGENT_POLICY.publish.system).toMatchObject({
      verdict: 'matrix',
      purpose: 'agent-instance-publish',
    })
    expect(AGENT_POLICY.quiesce.system).toMatchObject({
      verdict: 'matrix',
      purpose: 'agent-instance-quiesce',
    })
    expect(AGENT_POLICY.withdraw.system).toMatchObject({
      verdict: 'matrix',
      purpose: 'agent-instance-withdraw',
    })
    for (const name of ['publish', 'quiesce', 'withdraw'] as const) {
      expect(AGENT_POLICY[name].work.verdict).toBe('deny')
      expect(AGENT_POLICY[name].login.verdict).toBe('deny')
    }
  })

  it('reports a matrix cell that names a purpose outside the matrix', () => {
    const mutated = {
      ...SESSION_POLICY,
      pending: {
        ...SESSION_POLICY.pending,
        system: { ...SESSION_POLICY.pending.system, purpose: 'enumerate-everything' },
      },
    }
    const audit = auditPolicy({ session: mutated as unknown as typeof SESSION_POLICY })
    expect(audit.findings.some(text => text.includes('enumerate-everything'))).toBe(true)
  })
})

describe('D items', () => {
  it('marks exactly D-1 (configureAutoArchive × login) and D-2 (setRelation × login) as pending', () => {
    const pending = [...cells(SESSION_POLICY), ...cells(AGENT_POLICY)]
      .filter(({ cell }) => cell.verdict === 'deny-pending')
      .map(({ operation, column, cell }) => ({ operation, column, cell }))
    expect(pending).toEqual([
      {
        operation: 'setRelation',
        column: 'login',
        cell: { verdict: 'deny-pending', item: 'D-2' },
      },
      {
        operation: 'configureAutoArchive',
        column: 'login',
        cell: { verdict: 'deny-pending', item: 'D-1' },
      },
    ])
    expect(auditPolicy().session.pendingCells).toEqual([
      'setRelation × login: D-2',
      'configureAutoArchive × login: D-1',
    ])
  })

  it('writes for each D item the missing product rule and the default denial', () => {
    expect(PENDING_LABEL).toBe('默认拒绝，D 项待产品裁定')
    for (const item of Object.values(DECISION_ITEMS)) {
      expect(item.missingRule.trim().length).toBeGreaterThan(0)
      expect(item.defaultVerdict).toBe('denied')
      expect(item.label).toBe(PENDING_LABEL)
      expect(SESSION_POLICY[item.operation][item.column]).toEqual({
        verdict: 'deny-pending',
        item: item.id,
      })
    }
  })

  it('reports a pending cell whose item points at another cell', () => {
    const mutated = {
      ...SESSION_POLICY,
      interrupt: { ...SESSION_POLICY.interrupt, login: { verdict: 'deny-pending', item: 'D-1' } },
    }
    const audit = auditPolicy({ session: mutated as unknown as typeof SESSION_POLICY })
    expect(audit.findings.some(text => text.includes('interrupt'))).toBe(true)
  })
})

describe('accept is judged by the RoutedInput branch (DP4-C14)', () => {
  it('lets the login principal send ordinary and card-decision input, not business input', () => {
    const cell = SESSION_POLICY.accept.login
    expect(resolveCell(cell, { routed: 'ordinary' }).verdict).toBe('member')
    expect(resolveCell(cell, { routed: 'card-decision' }).verdict).toBe('member')
    expect(resolveCell(cell, { routed: 'business' }).verdict).toBe('deny')
  })

  it('lets the session work principal deliver business input only', () => {
    const cell = SESSION_POLICY.accept.work
    expect(resolveCell(cell, { routed: 'business' }).verdict).toBe('member')
    expect(resolveCell(cell, { routed: 'ordinary' }).verdict).toBe('deny')
    expect(resolveCell(cell, { routed: 'card-decision' }).verdict).toBe('deny')
  })

  it('denies a branched cell when the request carries no branch', () => {
    expect(resolveCell(SESSION_POLICY.accept.work, {}).verdict).toBe('deny')
    expect(resolveCell(SESSION_POLICY.accept.login, {}).verdict).toBe('deny')
  })

  it('denies accept to any system principal', () => {
    expect(SESSION_POLICY.accept.system.verdict).toBe('deny')
  })
})

describe('receive is judged by the fact kind', () => {
  it('routes only scope-release facts of a system principal through the matrix', () => {
    const cell = SESSION_POLICY.receive.system
    expect(resolveCell(cell, { fact: 'scope-release' })).toMatchObject({
      verdict: 'matrix',
      purpose: 'scope-release-receive',
    })
    expect(resolveCell(cell, { fact: 'agent-exit' }).verdict).toBe('deny')
    expect(resolveCell(cell, {}).verdict).toBe('deny')
  })

  it('keeps an unbranched cell as it is', () => {
    expect(resolveCell(SESSION_POLICY.startRun.work, {})).toEqual(SESSION_POLICY.startRun.work)
    expect(resolveCell(SESSION_POLICY.startRun.login, { routed: 'ordinary' })).toEqual(
      SESSION_POLICY.startRun.login,
    )
  })
})

describe('shape of the tables', () => {
  it('is frozen: a row or a cell cannot be changed at runtime', () => {
    expect(Object.isFrozen(SESSION_POLICY)).toBe(true)
    expect(Object.isFrozen(AGENT_POLICY)).toBe(true)
    expect(Object.isFrozen(SESSION_POLICY.accept)).toBe(true)
    expect(Object.isFrozen(SESSION_POLICY.accept.login)).toBe(true)
    expect(Object.isFrozen(AGENT_POLICY.publish.system)).toBe(true)
  })

  it('denies with a written basis: no deny cell has an empty basis', () => {
    for (const { cell } of [...cells(SESSION_POLICY), ...cells(AGENT_POLICY)]) {
      if (cell.verdict !== 'deny') continue
      expect(cell.basis.trim().length).toBeGreaterThan(0)
    }
  })
})
