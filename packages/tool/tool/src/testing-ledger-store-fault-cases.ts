import assert from 'node:assert/strict'
import { recordKey } from './ledger-store.ts'
import type { LedgerStoreCase, StoreCaseDependencies } from './testing-ledger-store-types.ts'
import {
  batch,
  complete,
  hostRecord,
  required,
  snapshot,
  storeDomain,
} from './testing-ledger-values.ts'

export function storeFaultCases(deps: StoreCaseDependencies): readonly LedgerStoreCase[] {
  const domain = storeDomain(deps)
  const first = hostRecord('first', { nested: [1] })
  const second = hostRecord('second', { nested: [2] })
  const records = [first, second]
  return [
    {
      name: 'store.read-unavailable',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const arm = required(controls.readUnavailable, 'readUnavailable', deps)
        await arm()
        assert.equal(
          (await store.read(domain)).kind,
          'unavailable',
          'armed read must answer unavailable',
        )
        snapshot(await store.read(domain), '0', [], 'read failure must not change the domain')
      },
    },
    {
      name: 'store.commit-unavailable',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const arm = required(controls.commitUnavailable, 'commitUnavailable', deps)
        await store.commit(batch(domain, records))
        const before = await complete(store, domain)
        await arm()
        assert.equal(
          (await store.commit(batch(domain, [hostRecord('third', 3)], '1', '2'))).kind,
          'unavailable',
          'armed commit must answer unavailable',
        )
        assert.deepEqual(
          await complete(store, domain),
          before,
          'unavailable commit must attempt no writes',
        )
      },
    },
    ...(['unknownApplied', 'unknownDropped', 'throwApplied'] as const).map(
      handle =>
        ({
          name: `store.${handle}`,
          clause: 'G1',
          run: async ({ store, controls }) => {
            const arm = required(controls[handle], handle, deps)
            await arm()
            if (handle === 'throwApplied') {
              let thrown = false
              try {
                await store.commit(batch(domain, records))
              } catch {
                thrown = true
              }
              assert.ok(thrown, 'armed applied commit must throw')
            } else
              assert.equal(
                (await store.commit(batch(domain, records))).kind,
                'unknown',
                'armed commit must answer unknown',
              )
            snapshot(
              await store.read(domain),
              handle === 'unknownDropped' ? '0' : '1',
              handle === 'unknownDropped' ? [] : records,
              'fault must preserve the declared complete applied or dropped outcome',
            )
          },
        }) satisfies LedgerStoreCase,
    ),
    {
      name: 'store.delayed-land',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const delayed = required(controls.delayed, 'delayed', deps)
        await delayed.arm()
        assert.equal(
          (await store.commit(batch(domain, records))).kind,
          'unknown',
          'held commit must answer unknown',
        )
        snapshot(await store.read(domain), '0', [], 'held commit must remain invisible before land')
        await delayed.land()
        snapshot(
          await store.read(domain),
          '1',
          records,
          'uncontested delayed commit must land completely',
        )
      },
    },
    {
      name: 'store.delayed-fence',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const delayed = required(controls.delayed, 'delayed', deps)
        await delayed.arm()
        assert.equal(
          (await store.commit(batch(domain, records))).kind,
          'unknown',
          'held commit must answer unknown',
        )
        assert.deepEqual(await store.commit(batch(domain, [], '0', '1')), { kind: 'committed' })
        const fenced = await complete(store, domain)
        await delayed.land()
        assert.deepEqual(
          await complete(store, domain),
          fenced,
          'delayed commit must recheck expected after a fence',
        )
      },
    },
    {
      name: 'store.rejected-copy',
      clause: 'G1',
      run: async ({ store, controls }) => {
        const probe = required(controls.rejectedHostValue, 'rejectedHostValue', deps)
        const bad = probe()
        await store.commit(batch(domain, records))
        const before = await complete(store, domain)
        const good = hostRecord('third', { nested: [3] })
        const writes = [
          { kind: 'delete', key: recordKey(first) },
          { kind: 'put', record: good },
        ] as const
        let rejected = false
        try {
          const answer = await store.commit({
            ...batch(domain, [], '1', '2'),
            writes: [...writes, { kind: 'put', record: hostRecord('bad', bad) }],
          })
          rejected = answer.kind === 'unknown' || answer.kind === 'unavailable'
        } catch {
          rejected = true
        }
        assert.ok(rejected, 'provider must reject its declared unencodable host value')
        assert.deepEqual(
          await complete(store, domain),
          before,
          'rejected batch must preserve every record and the revision',
        )
        assert.deepEqual(
          await store.commit({ ...batch(domain, [], '1', '2'), writes }),
          { kind: 'committed' },
          'legal batch must remain accepted after rejection',
        )
        snapshot(
          await store.read(domain),
          '2',
          [second, good],
          'legal control batch must apply deletion and put together',
        )
      },
    },
  ]
}
