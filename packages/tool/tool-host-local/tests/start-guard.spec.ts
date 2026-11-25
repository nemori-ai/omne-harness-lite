import { describe, expect, it } from 'vitest'
import type { AccessVerdict } from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import { createLocalStartGuard, type StartCoordinatorAccess } from '@omne-harness/tool-host-local'
import { callId, principalA, request, tenantA, type Principal } from './coordinator-values.ts'

type Ask = Parameters<StartCoordinatorAccess<Principal>['qualify']>[0]

function scripted(answer: () => Promise<AccessVerdict>) {
  const asked: Ask[] = []
  const access: StartCoordinatorAccess<Principal> = {
    qualify: input => {
      asked.push(input)
      return answer()
    },
  }
  return { access, asked }
}

const allowed = () => Promise.resolve<AccessVerdict>({ kind: 'allowed' })

function startInput(overrides: Partial<FixedToolRequest> = {}) {
  return {
    principal: principalA,
    tenant: tenantA,
    call: callId('call-1'),
    request: request(overrides),
  }
}

describe('start guard', () => {
  it('a direct call of a qualified principal is allowed, and the question names the start', async () => {
    const { access, asked } = scripted(allowed)
    expect(await createLocalStartGuard({ access }).qualifyStart(startInput())).toEqual({
      kind: 'allowed',
    })
    expect(asked).toEqual([
      { principal: principalA, tenant: tenantA, call: callId('call-1'), action: 'start' },
    ])
  })

  it('a call a program made is qualified like a direct one: the guard asks the same access', async () => {
    const { access, asked } = scripted(allowed)
    const verdict = await createLocalStartGuard({ access }).qualifyStart(
      startInput({ invocation: { kind: 'programmatic', source: request().invocation.source } }),
    )
    expect(verdict).toEqual({ kind: 'allowed' })
    expect(asked).toEqual([
      { principal: principalA, tenant: tenantA, call: callId('call-1'), action: 'start' },
    ])
  })

  it('a denied qualification is refused', async () => {
    const { access } = scripted(() => Promise.resolve({ kind: 'denied', reason: 'revoked' }))
    expect(await createLocalStartGuard({ access }).qualifyStart(startInput())).toMatchObject({
      kind: 'refused',
    })
  })

  it('a qualification that cannot be read is unavailable, never allowed', async () => {
    const { access } = scripted(() =>
      Promise.resolve({ kind: 'unavailable', diagnostic: 'adapter down' }),
    )
    expect(await createLocalStartGuard({ access }).qualifyStart(startInput())).toEqual({
      kind: 'unavailable',
      diagnostic: 'adapter down',
    })
  })

  it('an access that throws is unavailable and its message is not reported', async () => {
    const { access } = scripted(() => Promise.reject(new Error('secret connection string')))
    const verdict = await createLocalStartGuard({ access }).qualifyStart(startInput())
    expect(verdict.kind).toBe('unavailable')
    expect(JSON.stringify(verdict)).not.toContain('secret')
  })

  it('every start asks again: a revocation and a restoration are seen at once', async () => {
    let revoked = false
    const { access, asked } = scripted(() =>
      Promise.resolve(revoked ? { kind: 'denied', reason: 'revoked' } : { kind: 'allowed' }),
    )
    const guard = createLocalStartGuard({ access })
    expect((await guard.qualifyStart(startInput())).kind).toBe('allowed')
    revoked = true
    expect((await guard.qualifyStart(startInput())).kind).toBe('refused')
    revoked = false
    expect((await guard.qualifyStart(startInput())).kind).toBe('allowed')
    expect(asked).toHaveLength(3)
  })

  it('a guard without an access is a TypeError at construction', () => {
    expect(() => createLocalStartGuard(undefined as never)).toThrow(new TypeError('input: missing'))
    expect(() => createLocalStartGuard({ access: {} } as never)).toThrow(
      new TypeError('access.qualify: missing'),
    )
  })
})
