import assert from 'node:assert/strict'
import type { RuntimeContextFixture } from './conformance.js'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, numberSchema, scope, setup } from './fixtures.js'
import { reduceStep } from '../index.js'
import type { StatefulBlockDescriptor, ContextUpdate } from '../index.js'
export const EXTENDED_OBLIGATIONS = [
  'cursor-invalidated-below-retention',
  'scope-independent-callback-at-three-points',
  'invalidate-reads-missing-and-advances',
  'step-commit-idempotent',
  'pending-updates-not-applied',
  'unauthorized-update-rejected-and-commit-invalid',
  'single-writer-per-step-rejects-second',
  'untracked-block-ends-with-execution',
  'translated-binding-gives-consumer-shape',
  'translated-block-not-readable-raw',
  'translation-throw-reads-missing',
  'unlisted-binding-refused',
  'per-request-block-outside-snapshot',
  'optional-need-reads-none',
  'child-scope-shadows-parent',
  'declaration-digest-mismatch-refused',
  'register-before-producer-then-incompatible-reads-missing',
] as const
export function extendedConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[] {
  return EXTENDED_OBLIGATIONS.map(name => ({
    name,
    clause: 'RC-02/RC-03/RC-04/RC-05/RC-07',
    async run(fixture) {
      const subject = await fixture.subject()
      if (name === 'register-before-producer-then-incompatible-reads-missing') {
        const target = scope('early')
        const applied = await subject.applyCommit({
          kind: 'registration',
          commit: { commit: 'early' },
          change: {
            kind: 'add',
            creating: true,
            scope: target,
            tenant: fixture.tenant,
            key: 'suite.value',
            basedOn: 0,
            required: true,
            parameters: 'undeclared',
            bindings: [],
          },
        })
        assert.equal(applied.kind, 'applied')
        const p = await subject.registerProducer({
          key: 'suite.value',
          producer: { producer: 'late' },
          declaration: declaration(),
          scoped: true,
        })
        assert.ok(p.kind === 'registered')
        await p.handle.publish(target, 7)
        const e = await subject.issueEligibility({
          scope: target,
          tenant: fixture.tenant,
          principal: fixture.principal,
          consumer: 'model',
          keys: ['suite.value'],
          bindings: [],
          supersedes: null,
          registrationRevision: 1,
        })
        assert.ok(e.kind === 'issued')
        const b = await subject.bind(e.eligibility.id)
        assert.ok(b.kind === 'bound')
        const read = await b.reader.snapshot()
        assert.ok(read.kind === 'success')
        assert.equal(read.value.missing.length, 1)
        return
      }
      if (name === 'scope-independent-callback-at-three-points') {
        const target = scope('independent')
        let calls = 0
        const registered = await subject.registerProducer({
          key: 'suite.value',
          producer: { producer: 'independent' },
          declaration: declaration(),
          scoped: false,
          supply: async () => ({ kind: 'value', value: ++calls }),
        })
        assert.ok(registered.kind === 'registered')
        await subject.applyCommit({
          kind: 'registration',
          commit: { commit: 'one' },
          change: {
            kind: 'add',
            creating: true,
            scope: target,
            tenant: fixture.tenant,
            key: 'suite.value',
            basedOn: 0,
            bindings: [],
            required: true,
            parameters: undefined,
          },
        })
        assert.equal(calls, 1)
        await registered.handle.invalidate()
        assert.equal(calls, 2)
        const replacement = await subject.registerProducer({
          key: 'suite.value',
          producer: { producer: 'independent' },
          declaration: declaration(),
          scoped: false,
          supply: async () => ({ kind: 'value', value: ++calls }),
        })
        assert.ok(replacement.kind === 'registered')
        assert.equal(calls, 3)
        return
      }
      if (name === 'per-request-block-outside-snapshot') {
        const target = scope('request')
        let calls = 0
        const p = await subject.registerProducer({
          key: 'suite.value',
          producer: { producer: 'request' },
          declaration: declaration({ volatility: 'per-request' }),
          scoped: true,
          supply: async () => ({ kind: 'value', value: ++calls }),
        })
        assert.ok(p.kind === 'registered')
        await subject.applyCommit({
          kind: 'registration',
          commit: { commit: 'request' },
          change: {
            kind: 'add',
            creating: true,
            scope: target,
            tenant: fixture.tenant,
            key: 'suite.value',
            basedOn: 0,
            bindings: [],
            parameters: undefined,
            required: true,
          },
        })
        const e = await subject.issueEligibility({
          scope: target,
          tenant: fixture.tenant,
          principal: fixture.principal,
          consumer: 'model',
          keys: ['suite.value'],
          bindings: [],
          registrationRevision: 1,
          supersedes: null,
        })
        assert.ok(e.kind === 'issued')
        const b = await subject.bind(e.eligibility.id)
        assert.ok(b.kind === 'bound')
        const a = await b.reader.snapshot(),
          c = await b.reader.snapshot()
        assert.ok(a.kind === 'success' && c.kind === 'success')
        assert.equal(a.value.blocks.length, 0)
        assert.equal(a.value.perRequest[0]?.kind, 'value')
        assert.equal(calls, 2)
        assert.equal(a.value.viewRevision, c.value.viewRevision)
        return
      }
      if (
        name === 'step-commit-idempotent' ||
        name === 'pending-updates-not-applied' ||
        name === 'unauthorized-update-rejected-and-commit-invalid' ||
        name === 'single-writer-per-step-rejects-second' ||
        name === 'untracked-block-ends-with-execution'
      ) {
        const target = scope('stateful'),
          key = 'suite.state'
        const d: StatefulBlockDescriptor<typeof key, unknown, unknown> = {
          kind: 'stateful',
          key,
          schema: numberSchema,
          required: true,
          consumers: ['model'],
          disclosure: 'plain',
          carriesPrevious: true,
          volatility: 'stable',
          writers: ['tool'],
          singleWriterPerStep: true,
          persistence:
            name === 'untracked-block-ends-with-execution' ? 'untracked' : 'checkpointed',
          reduce: (previous, update) => Number(previous ?? 0) + Number(update),
          updateSchema: numberSchema,
        }
        const reg = await subject.applyCommit({
          kind: 'registration',
          commit: { commit: 'stateful' },
          change: {
            kind: 'add',
            creating: true,
            scope: target,
            tenant: fixture.tenant,
            key,
            basedOn: 0,
            required: true,
            parameters: undefined,
            bindings: [],
            declaration: d,
          },
        })
        assert.equal(reg.kind, 'applied')
        const first: ContextUpdate = {
            key,
            origin: { origin: 'first' },
            writer: 'tool',
            update: 1,
          },
          second: ContextUpdate = { key, origin: { origin: 'second' }, writer: 'tool', update: 3 }
        const reduced = reduceStep({
          scope: target,
          step: { step: 'one' },
          updates: [first, second],
          descriptors: { get: () => d },
          current: () => undefined,
        })
        if (name === 'single-writer-per-step-rejects-second') {
          assert.equal(reduced.committed[0]?.value, 1)
          assert.equal(reduced.rejected[0]?.rejection.kind, 'unauthorized')
          assert.equal(
            reduced.rejected[0]?.rejection.kind === 'unauthorized'
              ? reduced.rejected[0].rejection.cause
              : undefined,
            'single-writer',
          )
          const committed = await subject.applyCommit({
            kind: 'step',
            commit: { commit: 'conflict' },
            executionEnded: false,
            stepCommit: {
              scope: target,
              step: { step: 'one' },
              committed: [{ key, value: 4, updates: [first, second] }],
              pending: [],
            },
          })
          assert.ok(committed.kind === 'invalid')
          assert.equal(committed.reason, 'rejected-update')
          return
        }
        if (name === 'pending-updates-not-applied') {
          const result = await subject.applyCommit({
            kind: 'step',
            commit: { commit: 'pending' },
            executionEnded: false,
            stepCommit: {
              scope: target,
              step: { step: 'failed' },
              committed: [],
              pending: [first],
            },
          })
          assert.equal(result.kind, 'applied')
          const e = await subject.issueEligibility({
            scope: target,
            tenant: fixture.tenant,
            principal: fixture.principal,
            consumer: 'model',
            keys: [key],
            bindings: [],
            registrationRevision: 1,
            supersedes: null,
          })
          assert.ok(e.kind === 'issued')
          const b = await subject.bind(e.eligibility.id)
          assert.ok(b.kind === 'bound')
          const read = await b.reader.snapshot()
          assert.ok(read.kind === 'success')
          assert.equal(read.value.missing.length, 1)
          return
        }
        const input = {
          kind: 'step',
          commit: { commit: 'step' },
          executionEnded: name === 'untracked-block-ends-with-execution',
          stepCommit: {
            scope: target,
            step: { step: 'one' },
            committed: [
              {
                key,
                value: 1,
                updates: [
                  name === 'unauthorized-update-rejected-and-commit-invalid'
                    ? { ...first, writer: 'model' as const }
                    : first,
                ],
              },
            ],
            pending: [],
          },
        } as const
        const result = await subject.applyCommit(input)
        if (name === 'unauthorized-update-rejected-and-commit-invalid') {
          assert.ok(result.kind === 'invalid')
          assert.equal(result.reason, 'rejected-update')
          return
        }
        assert.equal(result.kind, 'applied')
        if (name === 'step-commit-idempotent') {
          assert.deepEqual(await subject.applyCommit(input), result)
          return
        }
        const e = await subject.issueEligibility({
          scope: target,
          tenant: fixture.tenant,
          principal: fixture.principal,
          consumer: 'model',
          keys: [key],
          bindings: [],
          registrationRevision: 1,
          supersedes: null,
        })
        assert.ok(e.kind === 'issued')
        const b = await subject.bind(e.eligibility.id)
        assert.ok(b.kind === 'bound')
        const read = await b.reader.snapshot()
        assert.ok(read.kind === 'success')
        assert.equal(read.value.missing.length, 1)
        return
      }
      const s = await setup(subject, fixture.tenant, fixture.principal)
      if (name === 'cursor-invalidated-below-retention') {
        const before = await s.reader.snapshot()
        assert.ok(before.kind === 'success')
        if (fixture.retention === undefined) throw new NotApplicable('retention')
        for (let n = 0; n <= fixture.retention; n++) await s.handle.publish(s.scope, n)
        assert.deepEqual(await s.reader.changes(before.value.cursor), {
          kind: 'cursor-invalidated',
        })
        return
      }
      if (name === 'declaration-digest-mismatch-refused') {
        const r = await subject.registerProducer({
          key: 'suite.value',
          producer: { producer: 'suite' },
          declaration: declaration({ required: false }),
          scoped: true,
        })
        assert.deepEqual(r, { kind: 'rejected', reason: 'declaration-mismatch' })
        return
      }
      if (name === 'invalidate-reads-missing-and-advances') {
        await s.handle.publish(s.scope, 1)
        const before = await s.reader.snapshot()
        assert.ok(before.kind === 'success')
        await s.handle.invalidate(s.scope)
        const after = await s.reader.snapshot()
        assert.ok(after.kind === 'success')
        assert.ok(after.value.viewRevision > before.value.viewRevision)
        assert.equal(after.value.missing.length, 1)
        return
      }
      if (name === 'child-scope-shadows-parent') {
        await s.handle.publish(s.scope, 10)
        const child = scope('child', s.scope)
        await subject.applyCommit({
          kind: 'registration',
          commit: { commit: 'child' },
          change: {
            kind: 'add',
            creating: true,
            scope: child,
            tenant: fixture.tenant,
            key: 'suite.other',
            bindings: [],
            required: false,
            parameters: undefined,
            basedOn: 0,
          },
        })
        const e = await subject.issueEligibility({ ...s.material, scope: child })
        assert.ok(e.kind === 'issued')
        const b = await subject.bind(e.eligibility.id)
        assert.ok(b.kind === 'bound')
        const r = await b.reader.snapshot()
        assert.ok(r.kind === 'success')
        assert.equal(r.value.blocks[0]?.evidence.scope.ref, s.scope.ref)
        return
      }
      const translate = (value: unknown) => {
        if (name === 'translation-throw-reads-missing') throw new Error('translation refused')
        return value
      }
      const change = {
        kind: 'update',
        creating: false,
        scope: s.scope,
        tenant: fixture.tenant,
        key: 'suite.value',
        basedOn: 1,
        parameters: undefined,
        bindings: [
          {
            key: 'suite.value',
            need: {
              name: 'value',
              shape: numberSchema,
              consumer: 'model',
              purpose: 'test',
              necessity: name === 'optional-need-reads-none' ? 'optional' : 'required',
            },
            translate,
            integrator: 'tool',
          },
        ],
      } as const
      const commit = await subject.applyCommit({
        kind: 'registration',
        commit: { commit: 'translation' },
        change,
      })
      assert.equal(commit.kind, 'applied')
      const e = await subject.issueEligibility({
        ...s.material,
        keys: [],
        bindings:
          name === 'unlisted-binding-refused' ? [] : [{ key: 'suite.value', need: 'value' }],
      })
      assert.ok(e.kind === 'issued')
      const b = await subject.bind(e.eligibility.id)
      assert.ok(b.kind === 'bound')
      if (name === 'optional-need-reads-none') {
        const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
        assert.ok(r.kind === 'success')
        assert.equal(r.value[0]?.kind, 'none')
        return
      }
      await s.handle.publish(s.scope, 12)
      if (name === 'translated-block-not-readable-raw') {
        const r = await b.reader.snapshot()
        assert.ok(r.kind === 'success')
        assert.equal(r.value.blocks.length, 0)
        return
      }
      const r = await b.reader.read([{ key: 'suite.value', need: 'value' }])
      if (name === 'unlisted-binding-refused') {
        assert.deepEqual(r, { kind: 'refused', reason: 'unauthorized' })
        return
      }
      if (name === 'translation-throw-reads-missing') {
        assert.ok(r.kind === 'missing')
        assert.equal(r.items[0]?.cause, 'translation-failed')
        return
      }
      assert.ok(r.kind === 'success')
      assert.equal(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 12)
    },
  }))
}
