import { describe, expect, it } from 'vitest'
import { TELEMETRY_LIMITS, encodeCarrier, validateBinding, type Binding } from '../src/index.ts'
import { aTenantScope, theSystemScope } from './scopes.ts'

const instance = { owner: 'apps/harness-server', ref: 'process-1' }
const carrier = encodeCarrier({
  traceId: '0af7651916cd43dd8448eb211c80319c',
  spanId: 'b7ad6b7169203331',
  sampled: true,
})

function binding(patch: Record<string, unknown> = {}): Binding {
  return { scope: aTenantScope(), component: 'session', instance, ...patch } as Binding
}

function refs(count: number): { owner: string; ref: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    owner: 'packages/agent/agent',
    ref: `r${index}`,
  }))
}

describe('validateBinding', () => {
  it('accepts a minted tenant scope and a minted system scope', () => {
    expect(validateBinding(binding())).toEqual({ kind: 'ok' })
    expect(validateBinding(binding({ scope: theSystemScope(), component: 'cordis' }))).toEqual({
      kind: 'ok',
    })
  })

  it('accepts every optional member at its limit', () => {
    const full = binding({
      work: { owner: 'packages/session/session', ref: 'w'.repeat(TELEMETRY_LIMITS.refMaxBytes) },
      attempt: { owner: 'packages/agent/agent', ref: 'attempt-1' },
      call: { owner: 'packages/model/model', ref: 'call-1' },
      adopted: refs(TELEMETRY_LIMITS.maxAdopted),
      links: Array.from({ length: TELEMETRY_LIMITS.maxLinks }, () => carrier),
      component: 'c'.repeat(TELEMETRY_LIMITS.componentMaxLength),
    })

    expect(validateBinding(full)).toEqual({ kind: 'ok' })
  })

  it.each([
    [
      'a scope with the right shape that legal-identity did not mint',
      { scope: { kind: 'system' } },
      'scope',
    ],
    ['a copy of a minted scope', { scope: { ...aTenantScope() } }, 'scope'],
    ['a missing scope', { scope: undefined }, 'scope'],
    ['an empty component', { component: '' }, 'component'],
    [
      'a component over the length limit',
      { component: 'c'.repeat(TELEMETRY_LIMITS.componentMaxLength + 1) },
      'component',
    ],
    ['a component with whitespace', { component: 'server entry' }, 'component'],
    ['a missing instance', { instance: undefined }, 'owned-ref'],
    [
      'an instance reference over the byte limit',
      { instance: { owner: 'x', ref: 'r'.repeat(TELEMETRY_LIMITS.refMaxBytes + 1) } },
      'owned-ref',
    ],
    [
      'an instance reference with whitespace',
      { instance: { owner: 'x', ref: 'Bearer x' } },
      'owned-ref',
    ],
    [
      'an owned reference with an extra member',
      { work: { owner: 'x', ref: 'y', note: 'free text' } },
      'owned-ref',
    ],
    ['an owned reference without an owner', { call: { ref: 'y' } }, 'owned-ref'],
    [
      'an owner over the length limit',
      { attempt: { owner: 'o'.repeat(TELEMETRY_LIMITS.ownerMaxLength + 1), ref: 'y' } },
      'owned-ref',
    ],
    ['too many adopted references', { adopted: refs(TELEMETRY_LIMITS.maxAdopted + 1) }, 'adopted'],
    ['an adopted list that is not an array', { adopted: refs(1)[0] }, 'adopted'],
    ['an invalid adopted reference', { adopted: [{ owner: 'x', ref: '' }] }, 'adopted'],
    [
      'too many links',
      { links: Array.from({ length: TELEMETRY_LIMITS.maxLinks + 1 }, () => carrier) },
      'links',
    ],
    ['a link that is not a carrier', { links: ['00-zz-zz-01'] }, 'links'],
    ['an undeclared member', { tenant: 'acme' }, 'undeclared-key'],
  ])('rejects %s', (_, patch, reason) => {
    expect(validateBinding(binding(patch))).toEqual({ kind: 'invalid', reason })
  })

  it.each([
    ['null', null],
    ['a string', 'tenant'],
    ['an array', []],
  ])('rejects a binding that is %s', (_, value) => {
    expect(validateBinding(value as never)).toEqual({ kind: 'invalid', reason: 'not-object' })
  })

  it('rejects an optional member behind a getter instead of reading it as absent', () => {
    let called = false
    const withAccessor = binding()
    Object.defineProperty(withAccessor, 'work', {
      enumerable: true,
      get() {
        called = true
        return undefined
      },
    })

    expect(validateBinding(withAccessor)).toEqual({ kind: 'invalid', reason: 'malformed' })
    expect(called).toBe(false)
  })

  it('answers malformed instead of throwing when a member throws', () => {
    const hostile = new Proxy(binding(), {
      getOwnPropertyDescriptor() {
        throw new Error('trap')
      },
    })

    expect(validateBinding(hostile)).toEqual({ kind: 'invalid', reason: 'malformed' })
  })
})
