import { expect, it } from 'vitest'
import { combinationManifest } from '@omne-harness/sql-contract'
import {
  hitlSqlMaterials,
  independentWaitSqlMaterials,
  independentControlCommands,
  IndependentCommandSchema,
} from '@omne-harness/human-intervention-local'

it('has one WaitOwner writer for receipts, checkpoint and exact pending, with mandatory predecessors', () => {
  const hitl = hitlSqlMaterials()
  const wait = independentWaitSqlMaterials()
  const catalog = {
    catalogProtocol: 'sql-catalog/1' as const,
    participants: [...hitl.participants, ...wait.participants],
    migrations: [...hitl.migrations, ...wait.migrations],
    readHandlers: [...hitl.readHandlers, ...wait.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const names = [
    'hitl.terminal',
    'hitl.wait-plan',
    'hitl.local-plan',
    'hitl.independent-state',
    'hitl.requests',
  ]
  const writer = catalog.participants.find(item => item.participant === 'hitl.independent-state')
  expect(writer?.ownedTables).toEqual(
    expect.arrayContaining(['hi_wait_receipts_v2', 'hi_wait_controls_v2', 'hi_wait_pending_v2']),
  )
  expect(
    catalog.participants.filter(item => item.ownedTables.includes('hi_wait_pending_v2')),
  ).toHaveLength(1)
  expect(combinationManifest({ catalog, participants: names }).kind).toBe('manifest')
  for (const name of names.slice(0, 4)) {
    expect(
      combinationManifest({ catalog, participants: names.filter(item => item !== name) }).kind,
    ).not.toBe('manifest')
  }
})

it('constructs the full recovery chain without an HITL writer', () => {
  const input = IndependentCommandSchema.parse({
    kind: 'bind',
    command: {
      protocol: 'hitl/1',
      operation: { tenantRef: 'tenant', actorRef: 'owner', operationId: 'bind' },
      waitRef: { owner: 'independent', waitId: 'wait', incarnation: 'one', destination: 'inbox' },
      expectedGeneration: '0',
      instanceId: 'receiver',
      implementationRef: 'v1',
    },
  })
  expect(independentControlCommands(input).map(item => item.participant)).toEqual([
    'hitl.terminal',
    'hitl.wait-plan',
    'hitl.local-plan',
    'hitl.independent-state',
  ])
})

it('coordinates recovery without reading HITL or any SQL state', async () => {
  const { default: joint } = await import('../src/joint-plan.ts')
  const { WaitPlanSchema } = await import('../src/wait-schema.ts')
  const { json } = await import('../src/encoding.ts')
  const { WAIT_BASIS_FACT, PLAN_FACT } = await import('../src/request-schema.ts')
  const binding = {
    operationRef: { tenantRef: 'tenant', actorRef: 'owner', operationId: 'prepare' },
    inputDigest: 'a'.repeat(64),
  }
  const wait = WaitPlanSchema.parse({
    kind: 'wait-operation',
    binding,
    waitRef: { owner: 'independent', waitId: 'wait', incarnation: 'one', destination: 'inbox' },
    delta: { kind: 'none' },
    response: { kind: 'prepared', preparationRef: 'preparation' },
  })
  let provided = false
  expect(
    joint.execute(
      { binding },
      {
        execute() {
          throw new Error('Recovery coordination must not read SQL')
        },
        requireFact(key) {
          return key.key === WAIT_BASIS_FACT.key ? json(wait) : { kind: 'consume', binding }
        },
        provideFact(key) {
          expect(key).toEqual(PLAN_FACT)
          provided = true
        },
      },
    ).kind,
  ).toBe('participated')
  expect(provided).toBe(true)
})
