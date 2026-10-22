import assert from 'node:assert/strict'
import { extendedConformance, EXTENDED_OBLIGATIONS } from './extended-conformance.js'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RuntimeContextOperations } from '../index.js'
import { NotApplicable, type ConformanceCase } from './case.js'
import { declaration, setup, scope } from './fixtures.js'
export type RuntimeContextFixture<P = unknown> = Readonly<{
  subject(): Promise<RuntimeContextOperations<P>>
  tenant: TenantId
  otherTenant: TenantId
  principal: P
  /** Retained change count of the fresh subject; required only for the retention case. */
  retention?: number
  close?(subject: RuntimeContextOperations<P>): Promise<void>
}>
const CORE_OBLIGATIONS = [
  'scope-isolated-publication',
  'cross-tenant-refused',
  'missing-required-block',
  'publication-shape',
  'old-generation-publication',
  'producer-identity',
  'withdrawn-producer-missing',
  'registration-replay',
  'registration-order',
  'registration-conflict',
  'scope-tenant-fixed',
  'required-removal-refused',
  'required-after-creation-refused',
  'eligibility-revoked',
  'eligibility-superseded',
  'cursor-reader-bound',
  'cursor-generation-invalidated',
  'optional-block-none',
  'consumer-filter',
  'reader-ended',
  'closed-instance-refuses',
] as const
export const RUNTIME_CONTEXT_OBLIGATIONS = [...CORE_OBLIGATIONS, ...EXTENDED_OBLIGATIONS] as const
export type RuntimeContextObligation = (typeof RUNTIME_CONTEXT_OBLIGATIONS)[number]
export function runtimeContextConformance<P>(): readonly ConformanceCase<
  RuntimeContextFixture<P>
>[] {
  return [
    ...CORE_OBLIGATIONS.map(name => ({
      name,
      clause: name.includes('registration')
        ? 'RC-02'
        : name.includes('producer') || name.includes('generation')
          ? 'RC-07'
          : 'RC-03/RC-04',
      async run(fixture: RuntimeContextFixture<P>) {
        const subject = await fixture.subject(),
          s = await setup(
            subject,
            fixture.tenant,
            fixture.principal,
            name === 'optional-block-none' ? declaration({ required: false }) : declaration(),
          )
        if (name === 'missing-required-block') {
          const r = await s.reader.snapshot()
          assert.ok(r.kind === 'success')
          assert.equal(r.value.missing[0]?.key, 'suite.value')
          return
        }
        if (name === 'optional-block-none') {
          const r = await s.reader.snapshot()
          assert.ok(r.kind === 'success')
          assert.equal(r.value.blocks[0]?.state.kind, 'none')
          assert.equal(r.value.missing.length, 0)
          return
        }
        if (name === 'publication-shape') {
          await s.handle.publish(s.scope, 1)
          assert.equal((await s.handle.publish(s.scope, 'bad')).kind, 'rejected')
          const r = await s.reader.read([{ key: 'suite.value', need: 'value' }])
          assert.ok(r.kind === 'success')
          assert.deepEqual(r.value[0]?.kind === 'value' ? r.value[0].value : undefined, 1)
          return
        }
        if (name === 'eligibility-revoked') {
          await subject.revokeEligibility(s.eligibility.id)
          assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'unauthorized' })
          return
        }
        if (name === 'eligibility-superseded') {
          const before = await s.reader.snapshot()
          assert.ok(before.kind === 'success')
          await subject.issueEligibility({ ...s.material, supersedes: s.eligibility.id, keys: [] })
          assert.deepEqual(await s.reader.changes(before.value.cursor), {
            kind: 'cursor-invalidated',
          })
          const after = await s.reader.snapshot()
          assert.ok(after.kind === 'success')
          assert.equal(after.value.blocks.length, 0)
          return
        }
        if (name === 'cursor-reader-bound') {
          const snap = await s.reader.snapshot()
          assert.ok(snap.kind === 'success')
          const other = await subject.bind(s.eligibility.id)
          assert.ok(other.kind === 'bound')
          assert.deepEqual(await other.reader.changes(snap.value.cursor), {
            kind: 'cursor-invalidated',
          })
          return
        }
        if (name === 'reader-ended') {
          await s.reader.end()
          assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
          return
        }
        if (name === 'closed-instance-refuses') {
          if (!fixture.close) throw new NotApplicable('close')
          await fixture.close(subject)
          assert.deepEqual(await s.reader.snapshot(), { kind: 'refused', reason: 'closed' })
          assert.deepEqual(await subject.bind(s.eligibility.id), {
            kind: 'refused',
            reason: 'closed',
          })
          return
        }
        if (name === 'cross-tenant-refused') {
          const e = await subject.issueEligibility({ ...s.material, tenant: fixture.otherTenant })
          if (e.kind === 'issued') {
            const b = await subject.bind(e.eligibility.id)
            if (b.kind === 'bound')
              assert.deepEqual(await b.reader.snapshot(), {
                kind: 'refused',
                reason: 'unauthorized',
              })
          }
          return
        }
        if (name === 'consumer-filter') {
          const e = await subject.issueEligibility({ ...s.material, consumer: 'extension' })
          assert.deepEqual(e, { kind: 'refused', reason: 'unauthorized' })
          return
        }
        if (name === 'producer-identity') {
          const p = await subject.registerProducer({
            key: 'suite.value',
            producer: { producer: 'other' },
            declaration: declaration(),
            scoped: true,
          })
          assert.deepEqual(p, { kind: 'rejected', reason: 'other-producer' })
          return
        }
        if (name === 'withdrawn-producer-missing') {
          await s.handle.publish(s.scope, 4)
          await s.handle.dispose()
          const r = await s.reader.snapshot()
          assert.ok(r.kind === 'success')
          assert.equal(r.value.missing.length, 1)
          return
        }
        if (name === 'old-generation-publication' || name === 'cursor-generation-invalidated') {
          const before = await s.reader.snapshot()
          assert.ok(before.kind === 'success')
          const p = await subject.registerProducer({
            key: 'suite.value',
            producer: { producer: 'suite' },
            declaration: declaration(),
            scoped: true,
          })
          assert.ok(p.kind === 'registered')
          assert.ok(p.handle.generation > s.handle.generation)
          if (name === 'cursor-generation-invalidated')
            assert.deepEqual(await s.reader.changes(before.value.cursor), {
              kind: 'cursor-invalidated',
            })
          else {
            await p.handle.publish(s.scope, 2)
            assert.equal((await s.handle.publish(s.scope, 1)).kind, 'rejected')
            await s.handle.dispose()
            const r = await s.reader.snapshot()
            assert.ok(r.kind === 'success')
            assert.equal(
              r.value.blocks[0]?.state.kind === 'value' ? r.value.blocks[0].state.value : undefined,
              2,
            )
          }
          return
        }
        if (name === 'scope-isolated-publication') {
          const other = scope('other')
          await subject.applyCommit({
            kind: 'registration',
            commit: { commit: 'other' },
            change: {
              kind: 'add',
              creating: true,
              scope: other,
              tenant: fixture.tenant,
              key: 'suite.value',
              basedOn: 0,
              required: false,
              bindings: [],
              parameters: undefined,
            },
          })
          await s.handle.publish(other, 42)
          const r = await s.reader.snapshot()
          assert.ok(r.kind === 'success')
          assert.equal(r.value.missing.length, 1)
          return
        }
        const change = {
          kind: 'add',
          creating: true,
          scope: s.scope,
          tenant: fixture.tenant,
          key: 'suite.value',
          basedOn: 0,
          required: true,
          parameters: undefined,
          bindings: [
            {
              key: 'suite.value',
              need: {
                name: 'value',
                shape: declaration().schema,
                consumer: 'model',
                purpose: 'conformance',
                necessity: 'required',
              },
            },
          ],
        } as const
        if (name === 'registration-replay') {
          const r = await subject.applyCommit({
            kind: 'registration',
            commit: { commit: 'registration' },
            change,
          })
          assert.equal(r.kind, 'applied')
          return
        }
        if (name === 'registration-conflict') {
          const r = await subject.applyCommit({
            kind: 'registration',
            commit: { commit: 'registration' },
            change: { ...change, parameters: 'different' },
          })
          assert.ok(r.kind === 'invalid')
          assert.equal(r.reason, 'commit-conflict')
          return
        }
        if (name === 'registration-order') {
          const r = await subject.applyCommit({
            kind: 'registration',
            commit: { commit: 'later' },
            change,
          })
          assert.ok(r.kind === 'invalid')
          assert.equal(r.reason, 'out-of-order')
          return
        }
        if (name === 'scope-tenant-fixed') {
          const r = await subject.prepareRegistration({
            ...change,
            kind: 'update',
            creating: false,
            basedOn: 1,
            tenant: fixture.otherTenant,
          })
          assert.equal(r.kind, 'rejected')
          return
        }
        if (name === 'required-removal-refused') {
          const r = await subject.prepareRegistration({
            kind: 'remove',
            creating: false,
            scope: s.scope,
            tenant: fixture.tenant,
            key: 'suite.value',
            basedOn: 1,
          })
          assert.equal(r.kind, 'rejected')
          return
        }
        if (name === 'required-after-creation-refused') {
          const r = await subject.prepareRegistration({
            ...change,
            key: 'suite.another',
            creating: false,
            basedOn: 1,
            bindings: [],
          })
          assert.equal(r.kind, 'rejected')
          return
        }
        const exhaustive: never = name
        throw new Error(String(exhaustive))
      },
    })),
    ...extendedConformance<P>(),
  ]
}
