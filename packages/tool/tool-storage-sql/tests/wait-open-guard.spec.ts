import { describe, expect, it } from 'vitest'
import { packText, type SqlValue } from '@omne-harness/sql-contract/worker'
import guard from '../src/worker/wait-open-guard.ts'
import { TOOL_WAIT_OPEN_FACT, toolWaitOpenGuardFacts } from '../src/index.ts'

const request = { tenant: 't1', call: 'call-1', wait: 'w-1' }

// A port over one stored wait record, or none; it keeps what it was asked and the facts it was given.
function portOf(phase: string | undefined) {
  const asked: (readonly SqlValue[])[] = []
  const sql: string[] = []
  const facts: unknown[] = []
  return {
    asked,
    sql,
    facts,
    port: {
      execute(statement: string, params: readonly SqlValue[]) {
        asked.push(params)
        sql.push(statement)
        const record =
          phase === 'no-record'
            ? { kind: 'wait', wait: {} }
            : { kind: 'wait', wait: { record: { intent: {}, phase } } }
        return {
          columns: ['record'],
          rows: phase === undefined ? [] : [[packText(JSON.stringify(record))]],
        }
      },
      provideFact(fact: unknown, value: unknown) {
        facts.push([fact, value])
      },
    },
  }
}

const run = (phase: string | undefined, given = toolWaitOpenGuardFacts(request).facts) => {
  const world = portOf(phase)
  const answer = guard.execute(given as never, world.port as never)
  return { answer, ...world }
}

describe('the guard that a wait of a call is still open (HS-29, C109)', () => {
  it.each(['opening', 'open'])('a wait %s holds: the commit goes on and knows it', phase => {
    const world = run(phase)
    const { answer, asked, facts } = world
    expect(answer).toEqual({ kind: 'participated', response: request })
    expect(asked).toEqual([['t1', 'call', 'call-1', 'wait:w-1']])
    expect(world.sql).toEqual([
      'SELECT record FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ? LIMIT 1',
    ])
    expect(facts).toEqual([[TOOL_WAIT_OPEN_FACT, request]])
  })

  it.each([
    ['closed', 'closed', 'wait-closed'],
    ['without its record', 'no-record', 'wait-closed'],
    ['gone', undefined, 'wait-absent'],
  ])('a wait that is %s stops the commit', (_label, phase, reason) => {
    const { answer, facts } = run(phase)
    expect(answer).toEqual({ kind: 'conflict', basis: { reason } })
    expect(facts).toEqual([])
  })

  it('facts that do not name a tenant, a call and a wait are not this guard’s', () => {
    expect(run('open', { request: { tenant: 't1', call: 'call-1' } }).answer).toEqual({
      kind: 'unsupported',
      basis: { reason: 'wait-open-input' },
    })
    expect(run('open', {}).answer).toMatchObject({ kind: 'unsupported' })
    for (const request of [
      null,
      'words',
      { tenant: 1, call: 'call-1', wait: 'w-1' },
      { tenant: 't1', call: 2, wait: 'w-1' },
      { tenant: 't1', call: 'call-1', wait: 3 },
    ])
      expect(run('open', { request }).answer, JSON.stringify(request)).toMatchObject({
        kind: 'unsupported',
      })
  })
})
