import { describe, expect, it, vi } from 'vitest'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {
  createPlanReuseScopes,
  type PlanScopeBinding,
  type PlanReuseScopes,
} from '../src/plan-reuse-scopes.ts'
import type {PlannedSemantics} from '@omne-harness-lite/model-request-runtime'
import { policy } from './invoke-policy-fixture.ts'

function binding(tenant = 'one', session = 'session', generation: object = {}): PlanScopeBinding {
  return {
    tenant: unwrap(parseTenantId({ organization: 'scope-org', account: tenant })),
    session: unwrap(parseOpaqueIdentifier(session, 'SessionRef')),
    generation,
  }
}
function setup(maxScopes: number, clearReuseScope: (scope: object) => void) {
  const input = {
    maxScopes,
    transport: { clearReuseScope, acquire: () => ({ unavailable: true as const }) },
    policy: policy(),
  }
  return { input, owner: createPlanReuseScopes<PlannedSemantics, never>(input) }
}
function acquire(owner: PlanReuseScopes, identity: PlanScopeBinding) {
  const result = owner.acquire(identity)
  if ('unavailable' in result) throw new Error('scope unavailable')
  return result.lease
}

describe('D109 finite trusted scope owner SC1/4/5/6/9', () => {
  it('isolates tenant/session/generation and evicts only idle least-recently-used scopes', () => {
    const cache = new Map<object, string>()
    const clear = vi.fn((scope: object) => {
      cache.delete(scope)
    })
    const { owner } = setup(2, clear)
    const firstIdentity = binding()
    const first = acquire(owner, firstIdentity)
    const second = acquire(owner, binding('two'))
    if (!first.reuseScope || !second.reuseScope) throw new Error('scopes missing')
    cache.set(first.reuseScope, 'first')
    cache.set(second.reuseScope, 'second')
    expect(first.reuseScope).not.toBe(second.reuseScope)
    const full = acquire(owner, binding('three'))
    expect(full.reuseScope).toBeUndefined()
    expect(clear).not.toHaveBeenCalled()
    second.release()
    const third = acquire(owner, binding('three'))
    expect(clear).toHaveBeenCalledExactlyOnceWith(second.reuseScope)
    expect(cache.has(first.reuseScope)).toBe(true)
    expect(cache.has(second.reuseScope)).toBe(false)
    first.release()
    third.release()
    const same = acquire(owner, firstIdentity)
    expect(same.reuseScope).toBe(first.reuseScope)
    same.release()
    const changed = acquire(owner, { ...firstIdentity, generation: {} })
    expect(changed.reuseScope).not.toBe(first.reuseScope)
    changed.release()
    expect(owner.close()).toEqual({ released: true })
    expect(cache.size).toBe(0)
    expect(owner.close()).toEqual({ released: true })
  })

  it('failed cleanup retains its slot, refuses that preparation, then retries at close', () => {
    let fail = true
    const clear = vi.fn(() => {
      if (fail) throw new Error('private error')
    })
    const { owner } = setup(1, clear)
    const first = acquire(owner, binding())
    first.release()
    expect(owner.acquire(binding('two'))).toEqual({ unavailable: true })
    expect(acquire(owner, binding('three')).reuseScope).toBeUndefined()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(owner.close()).toEqual({ unavailable: true })
    fail = false
    expect(owner.close()).toEqual({ released: true })
    expect(clear).toHaveBeenCalledTimes(3)
  })

  it('close attempts other scopes after a failure and never clears an active scope', () => {
    let failed: object | undefined
    const clear = vi.fn((scope: object) => {
      if (scope === failed) throw new Error('failed')
    })
    const { owner } = setup(2, clear)
    const first = acquire(owner, binding())
    const second = acquire(owner, binding('two'))
    failed = first.reuseScope
    first.release()
    expect(owner.close()).toEqual({ unavailable: true })
    expect(clear).toHaveBeenCalledTimes(1)
    second.release()
    expect(owner.close()).toEqual({ unavailable: true })
    expect(clear).toHaveBeenCalledTimes(3)
    failed = undefined
    expect(owner.close()).toEqual({ released: true })
    expect(clear).toHaveBeenCalledTimes(4)
  })

  it.each(['resolve', 'reject'] as const)(
    'owns delayed async clear %s, does not retry pending, and requires fresh synchronous evidence',
    async ending => {
      let finish: () => void = () => {}
      const pending = new Promise<void>((resolve, reject) => {
        finish = ending === 'resolve' ? resolve : () => reject(new Error('private rejection'))
      })
      let correct = false
      const clear = vi.fn(() => (correct ? undefined : pending))
      const { owner } = setup(1, clear)
      const first = acquire(owner, binding())
      first.release()
      expect(owner.close()).toEqual({ unavailable: true })
      expect(owner.close()).toEqual({ unavailable: true })
      expect(clear).toHaveBeenCalledTimes(1)
      finish()
      await pending.catch(() => undefined)
      await Promise.resolve()
      correct = true
      expect(owner.close()).toEqual({ released: true })
      expect(clear).toHaveBeenCalledTimes(2)
    },
  )

  it('non-undefined returns and throwing then getters are failed synchronous protocols', () => {
    let mode: 'value' | 'getter' | 'correct' = 'value'
    const clear = vi.fn(() =>
      mode === 'correct'
        ? undefined
        : mode === 'value'
          ? 7
          : {
              get then() {
                throw new Error('private getter')
              },
            },
    )
    const { owner } = setup(1, clear)
    acquire(owner, binding()).release()
    expect(owner.close()).toEqual({ unavailable: true })
    mode = 'getter'
    expect(owner.close()).toEqual({ unavailable: true })
    mode = 'correct'
    expect(owner.close()).toEqual({ released: true })
  })

  it('requires explicit finite policy and cleanup capability before any provider call', () => {
    const clear = vi.fn()
    expect(() => setup(0, clear)).toThrow(TypeError)
    expect(() => setup(Infinity, clear)).toThrow(TypeError)
    expect(() => setup(1.5, clear)).toThrow(TypeError)
    const { input } = setup(1, clear)
    Reflect.deleteProperty(input.transport, 'clearReuseScope')
    expect(() => createPlanReuseScopes(input)).toThrow(TypeError)
    expect(clear).not.toHaveBeenCalled()
  })
})
