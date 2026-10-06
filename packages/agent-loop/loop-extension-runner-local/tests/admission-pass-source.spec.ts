import { expect, test, vi } from 'vitest'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { passKeys } from '@omne-harness-lite/loop-extension-runner'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import {
  OFFICIAL_ADMISSION_NAME,
  type AdmissionInput,
  type AuthorizationContext,
} from '@omne-harness-lite/tool-admission'
import { createAdmissionPassSource } from '../src/admission-pass-source.ts'
import { createRunnerImplementationRegistry } from '../src/implementation-registry.ts'

const scope: SessionScope = {
  tenant: unwrap(parseTenantId({ organization: 'personal-member', account: 'member' })),
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
}
function fixture() {
  const access = Object.freeze({}) as SessionAccess
  const otherAccess = Object.freeze({}) as SessionAccess
  const identity: AccessIdentity = {
    binding: 'binding',
    principal: 'member',
    principalKind: 'human',
    scope,
    consumer: 'coordinator',
    contextKeys: [],
  }
  let allowed = true,
    hostActive = true,
    ownerActive = true
  const authorize = vi.fn<SessionAccessOperations['authorize']>(
    async (candidate, target, operation) =>
      allowed &&
      (candidate === access || candidate === otherAccess) &&
      operation === 'run.advance' &&
      target.session === scope.session &&
      tenantIdEquals(target.tenant, scope.tenant)
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' },
  )
  const source = createAdmissionPassSource({ access: { authorize }, isActive: () => ownerActive })
  const registry = createRunnerImplementationRegistry()
  const withdraw = registry.registerAdmission(async () => ({
    kind: 'failed',
    reason: 'unavailable',
  }))
  const contribution = registry.captureAdmission()
  if ('absent' in contribution) throw new Error('Missing test contribution')
  const call = judgeContentBlock({
    kind: 'tool_call',
    id: 'block',
    callId: 'call',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    tool: 'echo',
    arguments: { n: 1 },
  })
  if (
    !('ok' in call) ||
    call.ok.kind !== 'tool_call' ||
    call.ok.complete !== true ||
    call.ok.unparseable === true
  )
    throw new Error('Invalid test call')
  const input: AdmissionInput = {
    call: call.ok,
    definition: { name: 'echo' },
    grants: Object.freeze({}) as AuthorizationContext,
    runMode: 'auto_permission',
    effectivePermission: { value: 'auto', from: 'tenant' },
    tenantAutoWritable: true,
  }
  const keys = passKeys({
    position: 'before_action',
    anchor: 'anchor',
    extension: OFFICIAL_ADMISSION_NAME,
    occurrence: { kind: 'final' },
  })
  if ('invalidInput' in keys || !keys.final) throw new Error('Invalid test key')
  const fixed = {
    access,
    scope: { ...scope },
    inputs: [input] as [AdmissionInput, ...AdmissionInput[]],
    finalKeys: [keys.final] as [string, ...string[]],
    hostIsActive: () => hostActive,
    contribution,
  }
  const round = source.open(fixed)
  return {
    access,
    otherAccess,
    source,
    registry,
    authorize,
    round,
    withdraw,
    fixed,
    revoke() {
      allowed = false
    },
    stopHost() {
      hostActive = false
    },
    stopOwner() {
      ownerActive = false
    },
  }
}

test('only the original live access and scope can read a captured real contribution generation', async () => {
  const h = fixture()
  const result = await h.source.source.read(h.access, scope, h.round.pass)
  expect(result.kind).toBe('found')
  if (result.kind !== 'found') throw new Error('Expected captured pass')
  expect(result.record.inputs[0].grants).toBe(h.fixed.inputs[0].grants)
  expect(result.record.inputs).toEqual(h.fixed.inputs)
  expect(result.record.finalKeys).toEqual(h.fixed.finalKeys)
  expect(result.record.isActive()).toBe(true)
  expect(h.authorize).toHaveBeenCalledWith(h.access, scope, 'run.advance')
  expect(await h.source.source.read(h.otherAccess, scope, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await h.source.source.read({ ...h.access }, scope, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  const foreign = { ...scope, session: unwrap(parseOpaqueIdentifier('other', 'SessionRef')) }
  expect(await h.source.source.read(h.access, foreign, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  h.round.close()
  expect(result.record.isActive()).toBe(false)
  expect(await h.source.source.read(h.access, scope, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'passUnavailable',
  })
})

test('unreadable identities cannot distinguish a real pass from a guessed pass', async () => {
  const h = fixture()
  h.revoke()
  for (const pass of [h.round.pass, 'guessed-pass'])
    expect(await h.source.source.read(h.access, scope, pass)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  expect(h.authorize).toHaveBeenCalledTimes(2)
})

test('a valid caller cannot manufacture a pass, and the published surface has no writer', async () => {
  const h = fixture()
  expect(Object.keys(h.source.source)).toEqual(['read'])
  expect(await h.source.source.read(h.access, scope, 'guessed-pass')).toEqual({
    kind: 'rejected',
    reason: 'passUnavailable',
  })
})

for (const invalidation of ['host', 'contribution', 'owner', 'round', 'source'] as const)
  test(`${invalidation} invalidation revokes already returned records`, async () => {
    const h = fixture()
    const found = await h.source.source.read(h.access, scope, h.round.pass)
    if (found.kind !== 'found') throw new Error('Expected captured pass')
    switch (invalidation) {
      case 'host':
        h.stopHost()
        break
      case 'contribution':
        h.withdraw()
        h.registry.registerAdmission(async () => ({ kind: 'failed', reason: 'unavailable' }))
        break
      case 'owner':
        h.stopOwner()
        break
      case 'round':
        h.round.close()
        break
      case 'source':
        h.source.closeAdmission()
        break
    }
    expect(found.record.isActive()).toBe(false)
    expect(await h.source.source.read(h.access, scope, h.round.pass)).toEqual({
      kind: 'rejected',
      reason:
        invalidation === 'owner' || invalidation === 'source' ? 'unavailable' : 'passUnavailable',
    })
  })

test('the source captures all data while preserving the opaque grants object', async () => {
  const h = fixture()
  h.fixed.scope.session = unwrap(parseOpaqueIdentifier('changed', 'SessionRef'))
  h.fixed.inputs[0] = { ...h.fixed.inputs[0], runMode: 'never' }
  h.fixed.finalKeys[0] = 'changed'
  const found = await h.source.source.read(h.access, scope, h.round.pass)
  if (found.kind !== 'found') throw new Error('Expected captured pass')
  expect(found.record.inputs[0].runMode).toBe('auto_permission')
  expect(found.record.finalKeys[0]).not.toBe('changed')
  expect(Object.isFrozen(found.record.inputs[0].call)).toBe(true)
})

test('scope is owned before authorization yields', async () => {
  const h = fixture(),
    gate = Promise.withResolvers<void>()
  const original = h.authorize.getMockImplementation()!
  h.authorize.mockImplementation(async (...args) => {
    await gate.promise
    return original(...args)
  })
  const target = { ...scope }
  const read = h.source.source.read(h.access, target, h.round.pass)
  target.session = unwrap(parseOpaqueIdentifier('changed', 'SessionRef'))
  gate.resolve()
  expect((await read).kind).toBe('found')
})

test('close rejects fresh reads and waits for the actual authority promise', async () => {
  const h = fixture(),
    gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  const original = h.authorize.getMockImplementation()!
  h.authorize.mockImplementation(async (...args) => {
    entered.resolve()
    await gate.promise
    return original(...args)
  })
  const read = h.source.source.read(h.access, scope, h.round.pass)
  await entered.promise
  h.source.closeAdmission()
  let drained = false
  const drain = h.source.drain().then(() => {
    drained = true
  })
  await Promise.resolve()
  expect(drained).toBe(false)
  expect(await h.source.source.read(h.access, scope, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(() => h.source.open(h.fixed)).toThrow()
  gate.resolve()
  expect(await read).toEqual({ kind: 'rejected', reason: 'unavailable' })
  await drain
  expect(drained).toBe(true)
})

test('withdrawing a contribution while authority waits cannot return its old record', async () => {
  const h = fixture(),
    gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  const original = h.authorize.getMockImplementation()!
  h.authorize.mockImplementation(async (...args) => {
    entered.resolve()
    await gate.promise
    return original(...args)
  })
  const read = h.source.source.read(h.access, scope, h.round.pass)
  await entered.promise
  h.withdraw()
  gate.resolve()
  expect(await read).toEqual({ kind: 'rejected', reason: 'passUnavailable' })
})

test('invalid scope data never executes accessors or reaches authority', async () => {
  const h = fixture(),
    get = vi.fn(() => scope.session)
  const invalid = {
    tenant: scope.tenant,
    get session() {
      return get()
    },
  } as SessionScope
  expect(await h.source.source.read(h.access, invalid, h.round.pass)).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(get).not.toHaveBeenCalled()
  expect(h.authorize).not.toHaveBeenCalled()
})

test('authority IO failure is unavailable, not absence', async () => {
  const h = fixture()
  h.authorize.mockRejectedValueOnce(new Error('authority IO failed'))
  expect(await h.source.source.read(h.access, scope, 'guessed-pass')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
})
