import { describe, expect, it, vi } from 'vitest'
import { sessionStorageMaterials } from '../src/materials.ts'
import { sessionAuthorizationGuardFacts } from '../src/permission-current.ts'
import guard from '../src/worker/authorization-guard.ts'

const source = { owner: 'hitl', record: 'answer-1', revision: '1', digest: 'a' }
const consumer = { owner: '@omne-harness/agent', work: 'exe-1', position: 'act-1' }
const once = sessionAuthorizationGuardFacts({
  tenant: 't',
  session: 's',
  grant: { kind: 'once', consumer, source },
}).facts
const forSession = sessionAuthorizationGuardFacts({
  tenant: 't',
  session: 's',
  grant: { kind: 'session', capabilityId: 'tool.Files', enforcementKey: 'tool.write', source },
}).facts

// One table answers the row the guard asks by key; every other read finds nothing.
function port(table: 'sl_authorization_once' | 'sl_authorization_session', held: unknown) {
  const execute = vi.fn((sql: string) =>
    sql.includes(table) && held !== undefined
      ? held === 'once'
        ? { columns: ['target', 'arguments', 'source'], rows: [['t', 'a', JSON.stringify(source)]] }
        : { columns: ['basis', 'source'], rows: [['b', JSON.stringify(held)]] }
      : { columns: [], rows: [] },
  )
  return { execute, requireFact: vi.fn(), provideFact: vi.fn() }
}

it('publishes a read-only guard over the authorization context', () => {
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 1048576 })
  expect(
    materials.participants.find(item => item.participant === 'session-authorization-guard'),
  ).toMatchObject({
    protocol: '1',
    ownedTables: [],
    readTables: ['sl_authorization_head', 'sl_authorization_once', 'sl_authorization_session'],
    requiresFacts: [],
    providesFacts: [],
    grouping: 'singleton',
  })
})

describe('the authorization a start was released on, at its acceptance', () => {
  it('lets the commit through while the once authorization is still in force with its source', () => {
    expect(guard.execute(once, port('sl_authorization_once', 'once') as never)).toEqual({
      kind: 'participated',
      response: null,
    })
  })

  it('lets the commit through while the session authorization of the gate keeps its source', () => {
    expect(guard.execute(forSession, port('sl_authorization_session', source) as never)).toEqual({
      kind: 'participated',
      response: null,
    })
  })

  it.each([
    [
      'the once authorization left the current state',
      once,
      port('sl_authorization_once', undefined),
    ],
    [
      'the session authorization was revoked',
      forSession,
      port('sl_authorization_session', undefined),
    ],
    [
      'the session authorization was given again by another answer',
      forSession,
      port('sl_authorization_session', { ...source, record: 'answer-2' }),
    ],
  ])('refuses the commit when %s', (_label, facts, at) => {
    expect(guard.execute(facts, at as never)).toEqual({
      kind: 'conflict',
      basis: { reason: 'session-authorization-changed' },
    })
  })

  it.each([
    {},
    { request: {} },
    { request: { tenant: 't', session: 's', grant: { kind: 'guess' } } },
  ])('rejects malformed input without querying', facts => {
    const at = port('sl_authorization_once', 'once')
    expect(guard.execute(facts, at as never)).toMatchObject({ kind: 'unsupported' })
    expect(at.execute).not.toHaveBeenCalled()
  })
})
