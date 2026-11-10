import { expect, it, vi } from 'vitest'
import { sessionStorageMaterials } from '../src/materials.ts'
import {
  executionCurrentGuardFacts,
  SESSION_EXECUTION_CURRENT_FACT,
  SESSION_EXECUTION_GUARD,
} from '../src/participants.ts'
import guard from '../src/worker/execution-current-guard.ts'

it('declares only the original execution head as a read table and provides the exact current fact', () => {
  const material = sessionStorageMaterials({ readOutputLimitBytes: 1048576 }).participants.find(
    value => value.participant === SESSION_EXECUTION_GUARD,
  )
  expect(material).toMatchObject({
    ownedTables: [],
    readTables: ['er_execution'],
    requiresFacts: [],
    providesFacts: [SESSION_EXECUTION_CURRENT_FACT],
    grouping: 'singleton',
  })
  const request = { tenant: 'tenant', session: 'session', execution: 'execution', revision: '1' }
  const execute = vi.fn(() => ({
    columns: ['revision'],
    rows: [[1n]],
    changes: 0n,
    lastInsertRowid: null,
  }))
  const provideFact = vi.fn()
  expect(
    guard.execute(executionCurrentGuardFacts(request).facts, {
      execute,
      provideFact,
      requireFact: () => null,
    }),
  ).toEqual({ kind: 'participated', response: request })
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    'SELECT revision FROM er_execution WHERE tenant = ? AND execution = ? AND session = ? LIMIT 1',
    ['tenant', 'execution', 'session'],
  )
  expect(provideFact).toHaveBeenCalledExactlyOnceWith(SESSION_EXECUTION_CURRENT_FACT, request)
})

it.each([
  {},
  { request: {} },
  { request: { tenant: 't', session: 's', execution: 'e', revision: '-1' } },
])('rejects malformed input before reading or providing facts', facts => {
  const execute = vi.fn(() => {
    throw new Error('must not query')
  })
  const provideFact = vi.fn()
  expect(guard.execute(facts, { execute, provideFact, requireFact: () => null })).toHaveProperty(
    'kind',
    'unsupported',
  )
  expect(execute).not.toHaveBeenCalled()
  expect(provideFact).not.toHaveBeenCalled()
})
