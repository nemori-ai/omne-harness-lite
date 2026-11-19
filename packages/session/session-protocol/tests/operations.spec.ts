import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'

const table = {
  'create-session': { identity: 'acting-tenant', effect: 'commit', limit: 'small' },
  'query-create-session': { identity: 'login', effect: 'read', limit: 'small' },
  'send-input': { identity: 'login', effect: 'commit', limit: 'input' },
  'interrupt-input': { identity: 'login', effect: 'commit', limit: 'input' },
  'query-send-input': { identity: 'login', effect: 'read', limit: 'small' },
  'read-history': { identity: 'login', effect: 'read', limit: 'small' },
  'read-waiting': { identity: 'login', effect: 'read', limit: 'small' },
  'read-pending': { identity: 'login', effect: 'read', limit: 'small' },
  'read-waiting-calls': { identity: 'login', effect: 'read', limit: 'small' },
  'read-input-fate': { identity: 'login', effect: 'read', limit: 'small' },
  'search-history': { identity: 'login', effect: 'read', limit: 'small' },
  'list-sessions': { identity: 'login', effect: 'read', limit: 'small' },
  'list-archived-sessions': { identity: 'login', effect: 'read', limit: 'small' },
  'archive-session': { identity: 'login', effect: 'commit', limit: 'small' },
  'unarchive-session': { identity: 'login', effect: 'commit', limit: 'small' },
  'cancel-run': { identity: 'login', effect: 'commit', limit: 'small' },
  'stop-call': { identity: 'login', effect: 'commit', limit: 'small' },
  'retry-run': { identity: 'login', effect: 'commit', limit: 'small' },
  'background-call': { identity: 'login', effect: 'commit', limit: 'small' },
  'list-background-calls': { identity: 'login', effect: 'read', limit: 'small' },
  'select-model': { identity: 'login', effect: 'commit', limit: 'small' },
  'read-model-selection': { identity: 'login', effect: 'read', limit: 'small' },
  'select-workspace': { identity: 'login', effect: 'commit', limit: 'small' },
  'read-permission-mode': { identity: 'login', effect: 'read', limit: 'small' },
  'change-permission-mode': { identity: 'login', effect: 'commit', limit: 'small' },
} as const

const outcomes = {
  'create-session': ['limited', 'invalid', 'conflict', 'unknown'],
  'query-create-session': ['unknown'],
  'send-input': ['limited', 'invalid', 'archived', 'frozen', 'conflict', 'unknown'],
  'interrupt-input': ['limited', 'invalid', 'archived', 'frozen', 'conflict', 'unknown'],
  'query-send-input': ['not-committed', 'unknown'],
  'read-history': ['invalid'],
  'read-waiting': ['invalid'],
  'read-pending': ['invalid'],
  'read-waiting-calls': ['invalid'],
  'read-input-fate': ['invalid'],
  'search-history': ['invalid', 'limited'],
  'list-sessions': ['invalid'],
  'list-archived-sessions': ['invalid'],
  'archive-session': ['invalid', 'conflict', 'unknown'],
  'unarchive-session': ['invalid', 'conflict', 'unknown'],
  'cancel-run': ['invalid', 'conflict', 'not-found', 'unknown'],
  'stop-call': ['invalid', 'conflict', 'not-found', 'unknown', 'unsupported'],
  'retry-run': ['invalid', 'archived', 'frozen', 'not-found', 'no-change', 'conflict', 'unknown'],
  'background-call': ['invalid', 'conflict', 'unknown'],
  'list-background-calls': ['invalid'],
  'select-model': ['invalid', 'archived', 'frozen', 'conflict', 'not-found', 'unknown'],
  'read-model-selection': ['invalid'],
  'select-workspace': ['invalid', 'archived', 'frozen', 'conflict', 'not-found', 'unknown'],
  'read-permission-mode': ['invalid'],
  'change-permission-mode': ['invalid', 'no-change', 'conflict', 'unknown'],
} as const
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']

const operations = sessionProtocol.operations

describe('session/v1', () => {
  it('is session major 1 with exactly the twenty-five operations and one observation', () => {
    expect(sessionProtocol.name).toBe('session')
    expect(sessionProtocol.major).toBe(1)
    expect(Object.keys(operations).sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(sessionProtocol.observations)).toEqual(['observe-session'])
  })

  it.each(Object.entries(table))(
    '%s has the identity, effect and limit of the table',
    (name, row) => {
      const operation = operations[name as keyof typeof table]
      expect({
        identity: operation.identity,
        effect: operation.effect,
        limit: operation.limit,
      }).toEqual(row)
      expect(operation.countsAsAccess).toBe(true)
      expect('carriesCredential' in operation).toBe(false)
    },
  )

  it.each(Object.entries(outcomes))('%s answers the old outcomes', (name, own) => {
    const operation = operations[name as keyof typeof outcomes]
    expect(Object.keys(operation.outcomes).sort()).toEqual([...always, ...own].sort())
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied', 'unknown'])
      if (fixed in operation.outcomes)
        expect(operation.outcomes[fixed as keyof typeof operation.outcomes]).toBe(true)
  })

  it('no session operation can answer stage-not-provided', () => {
    for (const operation of Object.values(operations))
      expect('stage-not-provided' in operation.outcomes).toBe(false)
  })
})

describe('list-sessions', () => {
  it('is a login read of the small limit, and `invalid` is its only own outcome', () => {
    const operation = operations['list-sessions']
    expect(operation.identity).toBe('login')
    expect(operation.effect).toBe('read')
    expect(operation.limit).toBe('small')
    expect(Object.keys(operation.outcomes).filter(name => !always.includes(name))).toEqual([
      'invalid',
    ])
  })
})

describe('the query operations', () => {
  it('the two queries are reads that still answer unknown', () => {
    for (const name of ['query-create-session', 'query-send-input'] as const) {
      expect(operations[name].effect).toBe('read')
      expect(operations[name].outcomes.unknown).toBe(true)
    }
  })

  it('only the two inputs take the input limit', () => {
    const input = Object.entries(operations).filter(([, operation]) => operation.limit === 'input')
    expect(input.map(([name]) => name).sort()).toEqual(['interrupt-input', 'send-input'])
  })

  it('only create-session needs an acting tenant', () => {
    const acting = Object.entries(operations).filter(
      ([, operation]) => operation.identity === 'acting-tenant',
    )
    expect(acting.map(([name]) => name)).toEqual(['create-session'])
  })
})
