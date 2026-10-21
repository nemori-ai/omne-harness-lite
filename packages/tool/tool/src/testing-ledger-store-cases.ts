import assert from 'node:assert/strict'
import { recordKey, type LedgerDomain } from './ledger-store.ts'
import type { LedgerStoreCase, StoreCaseDependencies } from './testing-ledger-store-types.ts'
import {
  batch,
  callId,
  complete,
  hostRecord,
  revision,
  snapshot,
  storeDomain,
} from './testing-ledger-values.ts'

export function storeCases(deps: StoreCaseDependencies): readonly LedgerStoreCase[] {
  const domain = storeDomain(deps)
  const first = hostRecord('first', { nested: [1, { text: 'original' }] })
  const second = hostRecord('second', { number: 2 })
  const replacement = hostRecord('first', { replaced: true })
  return [
    {
      name: 'store.snapshot',
      clause: 'G1',
      run: async ({ store }) => {
        snapshot(await store.read(domain), '0', [], 'new domain must be empty at revision 0')
        assert.deepEqual(
          await store.commit(batch(domain, [first, second])),
          { kind: 'committed' },
          'batch must commit',
        )
        snapshot(
          await store.read(domain),
          '1',
          [first, second],
          'read must include the complete committed batch',
        )
        assert.deepEqual(
          await store.commit({
            ...batch(domain, [replacement], '1', '2'),
            writes: [
              { kind: 'put', record: replacement },
              { kind: 'delete', key: recordKey(second) },
            ],
          }),
          { kind: 'committed' },
        )
        snapshot(
          await store.read(domain),
          '2',
          [replacement],
          'replacement and deletion must be visible together',
        )
      },
    },
    {
      name: 'store.ordered-writes',
      clause: 'G1',
      run: async ({ store }) => {
        await store.commit({
          ...batch(domain, []),
          writes: [
            { kind: 'put', record: first },
            { kind: 'delete', key: recordKey(first) },
            { kind: 'put', record: replacement },
          ],
        })
        snapshot(
          await store.read(domain),
          '1',
          [replacement],
          'same-key writes must retain input order',
        )
        await store.commit(batch(domain, [], '1', '7'))
        snapshot(
          await store.read(domain),
          '7',
          [replacement],
          'empty writes must set the supplied revision',
        )
        await store.commit({
          ...batch(domain, [], '7', '9'),
          writes: [{ kind: 'delete', key: 'host:absent' }],
        })
        snapshot(
          await store.read(domain),
          '9',
          [replacement],
          'absent deletion must advance revision',
        )
      },
    },
    {
      name: 'store.cas',
      clause: 'G1',
      run: async ({ store }) => {
        const input = batch(domain, [first, second])
        assert.deepEqual(await store.commit(input), { kind: 'committed' })
        const before = await complete(store, domain)
        assert.deepEqual(
          await store.commit(input),
          { kind: 'conflict', current: revision('1') },
          'replayed CAS must conflict with current revision',
        )
        assert.deepEqual(
          await store.commit(batch(domain, [replacement])),
          { kind: 'conflict', current: revision('1') },
          'stale CAS must conflict with current revision',
        )
        assert.deepEqual(
          await store.read(domain),
          before,
          'conflict must leave the entire snapshot unchanged',
        )
      },
    },
    {
      name: 'store.concurrent-cas',
      clause: 'G1',
      run: async ({ store }) => {
        const left = [first, second]
        const right = [replacement, hostRecord('right', { winner: 'right' })]
        const answers = await Promise.all([
          store.commit(batch(domain, left)),
          store.commit(batch(domain, right)),
        ])
        assert.equal(
          answers.filter(answer => answer.kind === 'committed').length,
          1,
          'concurrent CAS must have exactly one winner',
        )
        assert.deepEqual(
          answers.find(answer => answer.kind !== 'committed'),
          { kind: 'conflict', current: revision('1') },
          'concurrent loser must report current revision',
        )
        snapshot(
          await store.read(domain),
          '1',
          answers[0]?.kind === 'committed' ? left : right,
          'only the complete winner batch may be visible',
        )
      },
    },
    {
      name: 'store.partitions',
      clause: 'G1',
      run: async ({ store }) => {
        const tenants = [
          domain.tenant,
          deps.tenant(`org_${'2'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
          deps.tenant(`org_${'0'.repeat(26)}`, `acc_${'3'.repeat(26)}`),
        ]
        const domains: LedgerDomain[] = tenants.flatMap(tenant => [
          { kind: 'call', tenant, call: callId('shared') },
          { kind: 'call', tenant, call: callId('other') },
          { kind: 'queue', tenant, key: 'shared' },
          { kind: 'queue', tenant, key: 'other' },
          { kind: 'host', tenant, key: 'shared' },
          { kind: 'host', tenant, key: 'other' },
        ])
        for (const [index, target] of domains.entries()) {
          snapshot(
            await store.read(target),
            '0',
            [],
            'domain identities must not share records or revision',
          )
          assert.deepEqual(
            await store.commit(batch(target, [hostRecord('same', { index })])),
            { kind: 'committed' },
            'each partition must accept its own initial CAS',
          )
        }
        for (const [index, target] of domains.entries())
          snapshot(
            await store.read(target),
            '1',
            [hostRecord('same', { index })],
            'domain identities must retain independent complete snapshots',
          )
      },
    },
    {
      name: 'store.input-copy',
      clause: 'G1',
      run: async ({ store }) => {
        const value = { nested: { text: 'original' }, list: [1] }
        await store.commit(batch(domain, [hostRecord('copy', value)]))
        value.nested.text = 'changed'
        value.list.push(2)
        snapshot(
          await store.read(domain),
          '1',
          [hostRecord('copy', { nested: { text: 'original' }, list: [1] })],
          'committed values must not alias caller input',
        )
      },
    },
    {
      name: 'store.output-copy',
      clause: 'G1',
      run: async ({ store }) => {
        await store.commit(batch(domain, [first, second]))
        const read = await complete(store, domain)
        for (const record of read.records)
          if (
            record.kind === 'host' &&
            typeof record.host.value === 'object' &&
            record.host.value !== null
          )
            Reflect.set(record.host.value, 'nested', ['changed'])
        snapshot(
          await store.read(domain),
          '1',
          [first, second],
          'read values must not alias stored records',
        )
      },
    },
  ]
}
