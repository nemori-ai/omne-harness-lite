import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionCommand,
} from '@omne-harness/session-contract'
import {
  createScriptedSessionAccessCheck,
  evidence,
  memoryAccess,
  operationId,
} from '@omne-harness/session-contract/testing'

const access = memoryAccess({ identity: 'caller' })
const read = {
  access,
  operation: 'history.next',
  target: { kind: 'session', session: access.session },
} satisfies SessionAccessRequest<typeof access.principal>

describe('the explicit access check double', () => {
  it('consumes one answer per call and never reuses an allowed answer', async () => {
    const allowed: SessionAccessDecision = { kind: 'allowed', evidence: evidence('access') }
    const unavailable: SessionAccessDecision = { kind: 'unavailable', diagnostic: 'source down' }
    const check = createScriptedSessionAccessCheck<typeof access.principal>([
      allowed,
      { kind: 'denied' },
      unavailable,
    ])
    expectTypeOf(check).toExtend<SessionAccessCheck<typeof access.principal>>()
    expect(check.durability).toBe('none')
    await expect(check.check(read)).resolves.toEqual(allowed)
    await expect(check.check(read)).resolves.toEqual({ kind: 'denied' })
    await expect(check.check(read)).resolves.toEqual(unavailable)
    await expect(check.check(read)).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the access check script is exhausted',
    })
    expect(check.controls.asked()).toEqual([read, read, read, read])
    expect(check.controls.asked()[0]?.access.principal).toBe(access.principal)
  })

  it('records source exceptions and continues with the next explicit answer', async () => {
    const error = new Error('source failed')
    const check = createScriptedSessionAccessCheck<typeof access.principal>([
      { kind: 'throw', error },
      { kind: 'denied' },
    ])
    await expect(check.check(read)).rejects.toBe(error)
    await expect(check.check(read)).resolves.toEqual({ kind: 'denied' })
    expect(check.controls.asked()).toEqual([read, read])
  })

  it('records the original command and the system directory without inventing a tenant', async () => {
    const command = {
      kind: 'change',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId('change'),
        declaration: { kind: 'permission-mode', value: 'never', authorization: evidence('change') },
      },
    } satisfies SessionCommand
    const change = {
      access,
      operation: 'change',
      target: { kind: 'session', session: access.session, command },
    } satisfies SessionAccessRequest<typeof access.principal>
    const system = {
      access: { principal: access.principal, scope: 'system' },
      operation: 'releasedScopes',
      target: { kind: 'released-scopes' },
    } satisfies SessionAccessRequest<typeof access.principal>
    const check = createScriptedSessionAccessCheck<typeof access.principal>([
      { kind: 'denied' },
      { kind: 'unavailable', diagnostic: 'no system authorization' },
    ])
    await check.check(change)
    await check.check(system)
    expect(check.controls.asked()).toEqual([change, system])
    expect(check.controls.asked()[0]?.target).toBe(change.target)
    expect(check.controls.asked()[1]?.access).not.toHaveProperty('tenant')
  })

  it('requires explicit answers and keeps the caller from replacing the remaining queue', async () => {
    const answers: SessionAccessDecision[] = [{ kind: 'denied' }]
    const check = createScriptedSessionAccessCheck<typeof access.principal>(answers)
    answers[0] = { kind: 'allowed', evidence: evidence('replacement') }
    await expect(check.check(read)).resolves.toEqual({ kind: 'denied' })
    const empty = createScriptedSessionAccessCheck<typeof access.principal>([])
    await expect(empty.check(read)).resolves.toMatchObject({ kind: 'unavailable' })
    expect(empty.controls.asked()).not.toBe(empty.controls.asked())
  })

  it('keeps operation, command and access scope correlated in the public type', () => {
    type Request = SessionAccessRequest<typeof access.principal>
    type Change = Extract<Request, { operation: 'change' }>
    expectTypeOf<Change['target']['command']['kind']>().toEqualTypeOf<'change'>()
    expectTypeOf<Extract<Request, { operation: 'releasedScopes' }>['access']>().toEqualTypeOf<
      Readonly<{ principal: typeof access.principal; scope: 'system' }>
    >()
    expectTypeOf<
      Extract<Request, { operation: 'pending' }>['target']['kind']
    >().toEqualTypeOf<'tenant'>()
    expectTypeOf<{
      operation: 'freeze'
      target: Change['target']
      access: typeof access
    }>().not.toExtend<Request>()
  })
})
