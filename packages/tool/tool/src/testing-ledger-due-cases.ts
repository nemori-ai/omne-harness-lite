// The due index cases of the ledger store suite: `schedule` and `unschedule` land with their
// commit or not at all, `due` reads by tenant and instant, and a lost answer (the crash point of a
// caller between the commit and its reply) leaves the index as committed.
import assert from 'node:assert/strict'
import { decodeToolInstant, type ToolInstant } from '@omne-harness/tool-contract/provider'
import type { LedgerDomain, LedgerWrite, ToolLedgerStore } from './ledger-store.ts'
import type { LedgerStoreCase, StoreCaseDependencies } from './testing-ledger-store-types.ts'
import {
  batch,
  callId,
  hostRecord,
  revision,
  storeDomain,
  success,
} from './testing-ledger-values.ts'

const T0 = Date.parse('2026-11-09T00:00:00.000Z')
const at = (seconds: number): ToolInstant =>
  success(decodeToolInstant(new Date(T0 + seconds * 1_000).toISOString()))

const schedule = (key: string, dueAt: ToolInstant): LedgerWrite => ({
  kind: 'schedule',
  key,
  dueAt,
})
const unschedule = (key: string): LedgerWrite => ({ kind: 'unschedule', key })

async function entries(store: ToolLedgerStore, domain: LedgerDomain, now: ToolInstant, limit = 10) {
  const read = await store.due(domain.tenant, now, limit)
  assert.equal(read.kind, 'complete', 'due must answer the index')
  assert.ok(read.kind === 'complete')
  return read.entries
}

export function dueCases(deps: StoreCaseDependencies): readonly LedgerStoreCase[] {
  const domain = storeDomain(deps)
  const call: LedgerDomain = { kind: 'call', tenant: domain.tenant, call: callId('call-due') }
  const record = hostRecord('body', { opened: true })
  return [
    {
      name: 'due.schedule-lands-with-commit',
      clause: 'G1',
      run: async ({ store }) => {
        assert.deepEqual(
          await store.commit({
            ...batch(domain, [record]),
            writes: [
              { kind: 'put', record },
              schedule('body:late', at(20)),
              schedule('body:early', at(10)),
            ],
          }),
          { kind: 'committed' },
        )
        assert.deepEqual(
          await entries(store, domain, at(9)),
          [],
          'nothing is due before its instant',
        )
        assert.deepEqual(await entries(store, domain, at(10)), [
          { domain, key: 'body:early', dueAt: at(10) },
        ])
        assert.deepEqual(await entries(store, domain, at(30)), [
          { domain, key: 'body:early', dueAt: at(10) },
          { domain, key: 'body:late', dueAt: at(20) },
        ])
        assert.deepEqual(await entries(store, domain, at(30), 1), [
          { domain, key: 'body:early', dueAt: at(10) },
        ])
      },
    },
    {
      name: 'due.conflict-schedules-nothing',
      clause: 'G1',
      run: async ({ store }) => {
        await store.commit(batch(domain, [record]))
        assert.deepEqual(
          await store.commit({ ...batch(domain, []), writes: [schedule('body:x', at(1))] }),
          { kind: 'conflict', current: revision('1') },
        )
        assert.deepEqual(await entries(store, domain, at(100)), [])
      },
    },
    {
      name: 'due.reschedule-replaces-and-unschedule-removes',
      clause: 'G1',
      run: async ({ store }) => {
        await store.commit({ ...batch(domain, []), writes: [schedule('body:x', at(10))] })
        await store.commit({
          ...batch(domain, [], '1', '2'),
          writes: [schedule('body:x', at(5))],
        })
        assert.deepEqual(await entries(store, domain, at(100)), [
          { domain, key: 'body:x', dueAt: at(5) },
        ])
        assert.deepEqual(
          await store.commit({
            ...batch(domain, [], '2', '3'),
            writes: [unschedule('body:x'), unschedule('body:never-scheduled')],
          }),
          { kind: 'committed' },
        )
        assert.deepEqual(await entries(store, domain, at(100)), [])
      },
    },
    {
      name: 'due.keys-are-per-domain-and-per-tenant',
      clause: 'G1',
      run: async ({ store }) => {
        await store.commit({ ...batch(domain, []), writes: [schedule('body:x', at(1))] })
        await store.commit({ ...batch(call, []), writes: [schedule('body:x', at(2))] })
        assert.deepEqual(await entries(store, domain, at(100)), [
          { domain, key: 'body:x', dueAt: at(1) },
          { domain: call, key: 'body:x', dueAt: at(2) },
        ])
        const other = {
          ...domain,
          tenant: deps.tenant(`org_${'2'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
        }
        assert.deepEqual(await entries(store, other, at(100)), [], 'another tenant sees nothing')
        await store.commit({ ...batch(call, [], '1', '2'), writes: [unschedule('body:x')] })
        assert.deepEqual(await entries(store, domain, at(100)), [
          { domain, key: 'body:x', dueAt: at(1) },
        ])
      },
    },
    {
      name: 'due.lost-answer-leaves-index-committed',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const arm = controls.unknownApplied ?? deps.missing('unknownApplied')
        await arm()
        const answer = await store.commit({
          ...batch(domain, [record]),
          writes: [{ kind: 'put', record }, schedule('body:x', at(1))],
        })
        assert.equal(answer.kind, 'unknown')
        assert.deepEqual(await entries(store, domain, at(1)), [
          { domain, key: 'body:x', dueAt: at(1) },
        ])
      },
    },
  ]
}
