import { expect, it, vi } from 'vitest'
import { sessionStorageMaterials } from '../src/materials.ts'
import guard from '../src/worker/permission-current-guard.ts'

it('publishes a read-only Session current-permission participant for capture combinations', () => {
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 1048576 })
  expect(
    materials.participants.find(item => item.participant === 'session-permission-guard'),
  ).toMatchObject({
    protocol: '1',
    ownedTables: [],
    readTables: ['sl_permission_head', 'sl_permission_assignment'],
    requiresFacts: [],
    providesFacts: [{ key: 'session.permission-current', protocol: '1' }],
    grouping: 'singleton',
  })
})

it.each([{}, { request: {} }, { request: { revision: '-1' } }])(
  'rejects malformed guard input without querying or publishing a fact',
  facts => {
    const execute = vi.fn(() => {
      throw new Error('must not query')
    })
    const requireFact = vi.fn(() => null)
    const provideFact = vi.fn()
    expect(guard.execute(facts, { execute, requireFact, provideFact })).toMatchObject({
      kind: 'unsupported',
    })
    expect(execute).not.toHaveBeenCalled()
    expect(provideFact).not.toHaveBeenCalled()
  },
)
