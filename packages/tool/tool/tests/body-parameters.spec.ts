// The deployment parameters of body custody (BodyLifecycle model constants W, Eps, G, D): the
// assembly gives them, startup refuses a set under which a late write could land after a sweep,
// and a declaration whose retention lies inside that window is refused when it is accepted.
import { expect, it } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  adoption,
  configuration,
  functionDefinition,
  guards,
  harness,
  principalA,
  request,
  tenantA,
  testSettlementPorts,
} from './runtime-values.ts'

const W = 4
const EPS = 1
const LATE_WRITE_WINDOW = W + 2 * EPS

function ledgerWith(offloading: Partial<ReturnType<typeof configuration>['offloading']>) {
  const store = createMemoryToolLedgerStore()
  return () =>
    createToolLedger(
      store,
      guards(),
      createMemoryToolClock(),
      configuration({ offloading: { ...configuration().offloading, ...offloading } }),
      { ...testSettlementPorts(store), content: null },
    )
}

function retainedFor(maxRetentionMs: number) {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  return request({
    availability: {
      kind: 'available',
      definition: {
        ...definition,
        returns: {
          ...definition.returns,
          offloading: {
            inline: { kind: 'system' },
            retention: { kind: 'bounded', maxRetentionMs },
          },
        },
      },
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
  })
}

it('refuses to start when the orphan grace G does not exceed W + 2ε', () => {
  const base = { permitMs: W, clockSkewMs: EPS, maxRetentionMs: 86_400_000 }
  expect(ledgerWith({ ...base, orphanGraceMs: LATE_WRITE_WINDOW })).toThrow(
    'configuration.offloading.orphanGraceMs: not-above-late-write-window',
  )
  expect(ledgerWith({ ...base, orphanGraceMs: LATE_WRITE_WINDOW + 1 })).not.toThrow()
})

it('refuses to start when the system retention bound does not exceed W + 2ε', () => {
  const base = { permitMs: W, clockSkewMs: EPS, orphanGraceMs: 1_000 }
  expect(ledgerWith({ ...base, maxRetentionMs: LATE_WRITE_WINDOW })).toThrow(
    'configuration.offloading.maxRetentionMs: not-above-late-write-window',
  )
  expect(ledgerWith({ ...base, maxRetentionMs: LATE_WRITE_WINDOW + 1 })).not.toThrow()
})

it('rejects at admission a declaration whose retention lies within W + 2ε', async () => {
  const offloading = {
    ...configuration().offloading,
    permitMs: W,
    clockSkewMs: EPS,
    orphanGraceMs: 1_000,
  }
  const assembly = harness({ offloading })
  const before = assembly.store.commits
  expect(
    await assembly.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: retainedFor(LATE_WRITE_WINDOW),
    }),
  ).toEqual({
    kind: 'rejected',
    failure: {
      kind: 'invalid',
      field: 'request.returns.offloading',
      reason: 'retention-within-late-write-window',
    },
  })
  expect(assembly.store.commits).toBe(before)
  expect(
    (
      await assembly.runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: retainedFor(LATE_WRITE_WINDOW + 1),
      })
    ).kind,
  ).toBe('accepted')
})
