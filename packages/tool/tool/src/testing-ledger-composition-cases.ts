import assert from 'node:assert/strict'
import { mintEvidence } from './evidence.ts'
import type { LedgerStoreCase } from './testing-ledger-store-types.ts'
import { ledgerAssembly, type LedgerAssemblyDependencies } from './testing-ledger-assembly.ts'
import {
  callId,
  complete,
  operationId,
  required,
  revision,
  success,
} from './testing-ledger-values.ts'

export function compositionCases(deps: LedgerAssemblyDependencies): readonly LedgerStoreCase[] {
  return [
    {
      name: 'ledger.idempotency',
      clause: 'P01',
      run: async fixture => {
        const f = await ledgerAssembly(fixture, deps)
        const first = success(
          await f.ledger.admissions.admit(f.input),
          'first admission must succeed',
        )
        const before = await complete(fixture.store, f.domain)
        const counts = f.counts()
        const again = success(
          await f.ledger.admissions.admit(f.input),
          'same-input retry must recall admission',
        )
        assert.equal(first.recovered, false, 'first admission must be new')
        assert.equal(again.recovered, true, 'retry must be recovered')
        assert.deepEqual(
          again.state,
          first.state,
          'retry must preserve original business state and evidence',
        )
        assert.equal(
          f.counts().commits,
          counts.commits,
          'business retry must not create another commit',
        )
        assert.deepEqual(
          await fixture.store.read(f.domain),
          before,
          'business retry must preserve receipt and complete snapshot',
        )
        assert.equal(
          before.records.filter(record => record.kind === 'operation').length,
          1,
          'admission must store exactly one operation receipt',
        )
      },
    },
    {
      name: 'ledger.input-conflict',
      clause: 'P01',
      run: async fixture => {
        const f = await ledgerAssembly(fixture, deps)
        success(await f.ledger.admissions.admit(f.input))
        const before = await complete(fixture.store, f.domain)
        const answer = await f.ledger.admissions.admit(f.changedInput())
        assert.ok('failure' in answer, 'different-input retry must fail')
        assert.equal(
          answer.failure.kind,
          'conflict',
          'same-operation different-input retry must be a business conflict',
        )
        assert.deepEqual(
          await fixture.store.read(f.domain),
          before,
          'business conflict must not change records or revision',
        )
      },
    },
    {
      name: 'ledger.state-revision',
      clause: 'P01',
      run: async fixture => {
        const f = await ledgerAssembly(fixture, deps)
        const admitted = success(await f.ledger.admissions.admit(f.input))
        const before = await complete(fixture.store, f.domain)
        const stale = await f.plan(revision('0'), operationId('stale-plan'))
        assert.ok('failure' in stale, 'wrong state expected must fail')
        assert.equal(
          stale.failure.kind,
          'stale-revision',
          'wrong state expected must return stale-revision',
        )
        if (stale.failure.kind === 'stale-revision')
          assert.equal(
            stale.failure.current,
            admitted.state.revision,
            'stale-revision must report current business revision',
          )
        assert.deepEqual(
          await fixture.store.read(f.domain),
          before,
          'stale command must not mutate records',
        )
        assert.deepEqual(
          success(await f.query(operationId('absent'))),
          { kind: 'not-committed' },
          'absent operation must be fenced',
        )
        const fenced = await complete(fixture.store, f.domain)
        assert.notEqual(
          fenced.revision,
          admitted.state.revision,
          'fence must advance domain revision without changing state revision',
        )
        const planned = success(
          await f.plan(admitted.state.revision),
          'valid state expected must succeed after domain revision advances',
        )
        assert.equal(
          planned.purpose,
          'initial',
          'planPreparation must return the actual preparation',
        )
        assert.equal(planned.call, f.access.call, 'preparation must belong to the original call')
      },
    },
    ...(['unknownApplied', 'throwApplied'] as const).map(
      handle =>
        ({
          name: `ledger.${handle}`,
          clause: 'P01',
          run: async fixture => {
            const arm = required(fixture.controls[handle], handle, deps)
            const f = await ledgerAssembly(fixture, deps)
            await arm()
            const answer = await f.ledger.admissions.admit(f.input)
            assert.ok('failure' in answer, 'uncertain admission must not report success')
            assert.equal(
              answer.failure.kind,
              'commit-unknown',
              'uncertain admission must retain the original operation',
            )
            if (answer.failure.kind === 'commit-unknown')
              assert.equal(
                answer.failure.operation,
                f.input.operation,
                'unknown must identify original operation',
              )
            const saved = await complete(fixture.store, f.domain)
            const operation = saved.records.find(record => record.kind === 'operation')
            assert.ok(
              operation?.kind === 'operation',
              'applied admission must preserve the full operation receipt',
            )
            assert.equal(
              operation.operation.receipt.kind,
              'admit',
              'operation must retain the named admission result',
            )
            const resolved = success(await f.query(), 'original operation query must succeed')
            assert.deepEqual(
              resolved,
              {
                kind: 'committed',
                revision: operation.operation.revision,
                receipt: mintEvidence(
                  'operation',
                  { tenant: f.access.tenant, call: f.access.call, operation: f.input.operation },
                  operation.operation.revision,
                  operation.operation.receipt,
                ),
              },
              'query must recognize the original committed receipt and evidence',
            )
            const recovered = success(await f.ledger.admissions.admit(f.input))
            assert.equal(
              recovered.recovered,
              true,
              'applied unknown retry must recall original admission',
            )
            if (operation.operation.receipt.kind === 'admit')
              assert.deepEqual(
                recovered.state,
                operation.operation.receipt.state,
                'recovered state must be the original named result',
              )
          },
        }) satisfies LedgerStoreCase,
    ),
    {
      name: 'ledger.unknownDropped',
      clause: 'P01',
      run: async fixture => {
        const arm = required(fixture.controls.unknownDropped, 'unknownDropped', deps)
        const f = await ledgerAssembly(fixture, deps)
        await arm()
        const answer = await f.ledger.admissions.admit(f.input)
        assert.ok(
          'failure' in answer && answer.failure.kind === 'commit-unknown',
          'dropped unknown admission must answer commit-unknown',
        )
        const before = f.counts().commits
        assert.deepEqual(
          success(await f.query()),
          { kind: 'not-committed' },
          'dropped original operation must be reliably excluded',
        )
        assert.equal(
          f.counts().commits,
          before + 1,
          'negative query must commit an exclusion fence',
        )
        const saved = await complete(fixture.store, f.domain)
        assert.equal(
          saved.records.filter(
            record =>
              record.kind === 'exclusion' && record.exclusion.operation === f.input.operation,
          ).length,
          1,
          'reliable negative must preserve the original operation fence',
        )
        assert.equal(
          saved.records.filter(record => record.kind === 'operation').length,
          0,
          'dropped admission must not create an operation',
        )
      },
    },
    {
      name: 'ledger.delayed-fresh-retry',
      clause: 'P01',
      run: async fixture => {
        const delayed = required(fixture.controls.delayed, 'delayed', deps)
        const f = await ledgerAssembly(fixture, deps)
        await delayed.arm()
        const answer = await f.ledger.admissions.admit(f.input)
        assert.ok(
          'failure' in answer && answer.failure.kind === 'commit-unknown',
          'held admission must answer commit-unknown',
        )
        assert.deepEqual(
          success(await f.query()),
          { kind: 'not-committed' },
          'fence must reliably exclude the held original operation',
        )
        const before = await complete(fixture.store, f.domain)
        await delayed.land()
        assert.deepEqual(
          await fixture.store.read(f.domain),
          before,
          'late old commit must not cross a successful fence',
        )
        const retry = success(
          await f.ledger.admissions.admit(f.input),
          'fresh retry with the same identity must be accepted after the fence',
        )
        assert.equal(retry.recovered, false, 'fenced old attempt must not become an admission')
        const after = await complete(fixture.store, f.domain)
        assert.equal(
          after.records.filter(record => record.kind === 'operation').length,
          1,
          'fresh retry must commit exactly one original operation',
        )
        assert.equal(
          after.records.filter(
            record =>
              record.kind === 'exclusion' && record.exclusion.operation === f.input.operation,
          ).length,
          0,
          'fresh retry must remove its old exclusion',
        )
        assert.equal(
          success(await f.query()).kind,
          'committed',
          'fresh retry must be recognized by original operation',
        )
      },
    },
    ...(['unknownDropped', 'commitUnavailable'] as const).map(
      handle =>
        ({
          name: `ledger.fence-${handle}`,
          clause: 'P01',
          run: async fixture => {
            const arm = required(fixture.controls[handle], handle, deps)
            const f = await ledgerAssembly(fixture, deps)
            await arm()
            const answer = await f.query()
            if (handle === 'unknownDropped')
              assert.deepEqual(
                success(answer),
                { kind: 'unknown' },
                'unknown fence cannot justify a negative answer',
              )
            else {
              assert.ok('failure' in answer, 'unavailable fence must fail the query')
              assert.equal(
                answer.failure.kind,
                'unavailable',
                'unavailable fence cannot justify a negative answer',
              )
            }
            const saved = await complete(fixture.store, f.domain)
            assert.equal(saved.records.length, 0, 'unapplied fence must not fabricate records')
            assert.equal(saved.revision, revision('0'), 'unapplied fence must not advance revision')
          },
        }) satisfies LedgerStoreCase,
    ),
    {
      name: 'ledger.qualification',
      clause: 'P01',
      run: async fixture => {
        const f = await ledgerAssembly(fixture, deps)
        success(await f.ledger.admissions.admit(f.input))
        assert.equal(
          success(await f.query()).kind,
          'committed',
          'owner must be able to read the original operation',
        )
        const before = await complete(fixture.store, f.domain)
        const counts = f.counts()
        const denied = async (answer: Awaited<ReturnType<typeof f.query>>) => {
          assert.deepEqual(
            answer,
            { failure: { kind: 'denied', action: 'query-operation' } },
            'foreign or revoked subject must receive only denied',
          )
          assert.deepEqual(f.counts(), counts, 'denied access must perform zero store IO')
        }
        await denied(
          await f.ledger.reads.operation({
            ...f.access,
            operation: f.input.operation,
            principal: f.other,
          }),
        )
        await denied(
          await f.ledger.reads.operation({
            ...f.access,
            operation: f.input.operation,
            principal: f.other,
            call: callId('never-admitted'),
          }),
        )
        f.revoke()
        await denied(await f.query())
        const write = await f.ledger.admissions.admit(f.input)
        assert.deepEqual(
          write,
          { failure: { kind: 'denied', action: 'admit' } },
          'revoked subject must be denied before writes',
        )
        assert.deepEqual(f.counts(), counts, 'denied write must perform zero store IO')
        assert.deepEqual(
          await fixture.store.read(f.domain),
          before,
          'denied read and write must preserve the snapshot',
        )
      },
    },
  ]
}
