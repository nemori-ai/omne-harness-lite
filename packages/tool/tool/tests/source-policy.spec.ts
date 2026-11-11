import { expect, it } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  admission,
  configurationOf,
  fixedRequestForNamedSourceGuard,
  guards,
  request,
  testSettlementPorts,
  type Block,
  type Principal,
} from './runtime-values.ts'

it('reports a truthful source policy denial as denied without committing admission', async () => {
  const store = createMemoryToolLedgerStore()
  const ledger = createToolLedger<Principal, Block>(
    store,
    { ...guards(), sources: { verify: async () => ({ kind: 'denied', reason: 'target-rule' }) } },
    createMemoryToolClock(),
    configurationOf({}),
    testSettlementPorts(),
  )
  expect(
    await ledger.admissions.admit(
      admission('target', 'admit-target', fixedRequestForNamedSourceGuard(request())),
    ),
  ).toEqual({ failure: { kind: 'denied', action: 'admit' } })
  expect(store.commits).toBe(0)
})
