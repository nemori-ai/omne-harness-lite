import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createMemoryRuntimeContext,
  runtimeContextConformance,
} from '@omne-harness/runtime-context-contract/testing'
import type { RuntimeContextFixture } from '@omne-harness/runtime-context-contract/testing'
const tenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
const other = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!tenant.ok || !other.ok) throw new Error('Invalid fixture')
const tenantId = tenant.value,
  otherTenantId = other.value
// Return one deliberately malformed closed-result reply, after all prior setup replies remain real.
// The reference run locates the final observable operation of each public behavioral case.

function corruptReply(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    return { kind: 'refused', reason: 'closed' }
  switch (value.kind) {
    case 'invalid':
      return { kind: 'applied', registrationRevision: 999, viewRevision: 999 }
    case 'applied':
      return { kind: 'invalid', reason: 'out-of-order', current: 999 }
    case 'registered':
      return { kind: 'rejected', reason: 'closed' }
    case 'rejected':
      return {
        kind: 'registered',
        handle: {
          key: 'suite.value',
          producer: { producer: 'bad' },
          generation: 99,
          publish: async () => ({ kind: 'rejected', reason: 'closed' }),
          invalidate: async () => ({ kind: 'rejected', reason: 'closed' }),
          dispose: async () => {},
        },
      }
    case 'refused':
      return {
        kind: 'refused',
        reason:
          'reason' in value && value.reason === 'no-registration'
            ? 'unauthorized'
            : 'no-registration',
      }
    case 'cursor-invalidated':
      return { kind: 'unknown', cause: 'source-unknown' }
    case 'success': {
      if (!('value' in value)) return { kind: 'unknown', cause: 'source-unknown' }
      const contents = value.value
      if (Array.isArray(contents))
        return {
          ...value,
          value: contents.map((item: unknown) =>
            typeof item === 'object' && item !== null
              ? { ...item, kind: 'value', value: 99 }
              : item,
          ),
        }
      if (
        typeof contents === 'object' &&
        contents !== null &&
        'blocks' in contents &&
        'missing' in contents
      ) {
        const missing = Array.isArray(contents.missing) ? contents.missing : []
        return {
          ...value,
          value: {
            ...contents,
            missing: missing.length ? [] : [{ key: 'suite.value', cause: 'no-value', revision: 0 }],
            blocks: [
              {
                key: 'suite.value',
                revision: 1,
                state: { kind: 'value', value: 99 },
                volatility: 'stable',
                evidence: {
                  key: 'suite.value',
                  revision: 1,
                  scope: 'scope' in contents ? contents.scope : undefined,
                  generation: 1,
                },
              },
            ],
            perRequest: [],
            viewRevision: -1,
          },
        }
      }
      return { kind: 'unknown', cause: 'source-unknown' }
    }
    default:
      return { kind: 'refused', reason: 'closed' }
  }
}

function observe<T extends object>(object: T, record: { count: number; mutate?: number }): T {
  return new Proxy(object, {
    get(target, key, receiver) {
      const member = Reflect.get(target, key, receiver)
      if (
        typeof member === 'function' &&
        [
          'registerProducer',
          'prepareRegistration',
          'applyCommit',
          'issueEligibility',
          'revokeEligibility',
          'bind',
          'publish',
          'invalidate',
          'dispose',
          'snapshot',
          'changes',
          'read',
          'end',
        ].includes(String(key))
      )
        return async (...args: unknown[]) => {
          const ordinal = ++record.count
          const result: unknown = await Reflect.apply(member, target, args)
          if (ordinal === record.mutate) return corruptReply(result)
          return typeof result === 'object' && result !== null ? observe(result, record) : result
        }
      return typeof member === 'object' && member !== null ? observe(member, record) : member
    },
  })
}
for (const test of runtimeContextConformance<string>()) {
  it(`rejects a bad final reply: ${test.name}`, async () => {
    const reference = { count: 0 }
    const closers = new WeakMap<object, () => Promise<void>>()
    function fixture(record: { count: number; mutate?: number }): RuntimeContextFixture<string> {
      return {
        tenant: tenantId,
        otherTenant: otherTenantId,
        principal: 'negative',
        retention: 64,
        async subject() {
          const memory = createMemoryRuntimeContext<string>()
          const subject = observe(memory, record)
          closers.set(subject, () => memory.close())
          return subject
        },
        async close(subject) {
          await closers.get(subject)?.()
        },
      }
    }
    await test.run(fixture(reference))
    expect(reference.count).toBeGreaterThan(0)
    await expect(test.run(fixture({ count: 0, mutate: reference.count }))).rejects.toThrow()
  })
}
