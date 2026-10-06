import { expect, test, vi } from 'vitest'
import { judgeContentBlock, LosslessNumber } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { passKeys } from '@omne-harness-lite/loop-extension-runner'
import type {
  AccessIdentity,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import type {
  AdmissionInput,
  AdmissionPassRecord,
  AuthorizationContext,
  ToolAdmissionPassSourceOperations,
} from '@omne-harness-lite/tool-admission'
import { createPassBindings } from '../src/pass-bindings.ts'
import type { AdmissionJudgmentDependencies } from '../src/judgment.ts'
import { decodeRunnerAdmissionToken as decodeFormalToken } from '@omne-harness-lite/loop-extension-runner'
import { OFFICIAL_ADMISSION_NAME as officialAdmissionName } from '@omne-harness-lite/tool-admission'

const tenant = parseTenantId({ organization: 'personal-member', account: 'member' })
const session = parseOpaqueIdentifier('session', 'SessionRef')
if (!('ok' in tenant) || !('ok' in session)) throw new Error('invalid test scope')
const scope: SessionScope = { tenant: tenant.ok, session: session.ok }
const unavailable = { kind: 'failed', reason: 'unavailable' }
function input(id = 'call', permission: 'auto' | 'ask' = 'auto'): AdmissionInput {
  const call = judgeContentBlock({
    kind: 'tool_call',
    id: `block-${id}`,
    callId: id,
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
    throw new Error('invalid test call')
  return {
    call: call.ok,
    definition: { name: 'echo' },
    grants: Object.freeze({}) as AuthorizationContext,
    effectivePermission: { value: permission, from: 'tenant' },
    tenantAutoWritable: true,
    runMode: 'auto_permission',
  }
}
function fixture(items: readonly [AdmissionInput, ...AdmissionInput[]] = [input()]) {
  const access = Object.freeze({}) as SessionAccess
  const identity: AccessIdentity = {
    binding: 'binding',
    principal: 'member',
    principalKind: 'human',
    scope,
    consumer: 'coordinator',
    contextKeys: [],
  }
  let authorized = true,
    live = true
  const authority: SessionAccessOperations = {
    authorize: vi.fn<SessionAccessOperations['authorize']>(async (candidate, target, operation) =>
      authorized &&
      candidate === access &&
      target.session === scope.session &&
      tenantIdEquals(target.tenant, scope.tenant) &&
      operation === 'run.advance'
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' },
    ),
  }
  const finalKeys = items.map(item => {
    const keys = passKeys({
      position: 'before_action',
      anchor: `anchor/${item.call.callId}`,
      extension: officialAdmissionName,
      occurrence: { kind: 'final' },
    })
    if ('invalidInput' in keys || !keys.final) throw new Error('invalid key fixture')
    return keys.final
  }) as [string, ...string[]]
  const record: AdmissionPassRecord = Object.freeze({
    inputs: items,
    finalKeys: Object.freeze(finalKeys),
    isActive: () => live,
  })
  const source: ToolAdmissionPassSourceOperations = {
    read: vi.fn<ToolAdmissionPassSourceOperations['read']>(async (_access, _scope, pass) =>
      pass === 'real-pass' && live
        ? { kind: 'found', record }
        : { kind: 'rejected', reason: 'passUnavailable' },
    ),
  }
  const evaluate = vi.fn<NonNullable<AdmissionJudgmentDependencies['evaluate']>>(
    async () => 'allow',
  )
  const owner = createPassBindings({ access: authority, source, judgment: { evaluate } })
  return {
    access,
    record,
    authority,
    source,
    owner,
    evaluate,
    revoke() {
      authorized = false
    },
    withdraw() {
      live = false
    },
  }
}
async function bound(f: ReturnType<typeof fixture>) {
  const result = await f.owner.forPass(f.access, scope, 'real-pass')
  if (result.kind !== 'bound') throw new Error('binding fixture failed')
  return result.judgment
}

test('bound decisions contain formal locators for the captured ordered candidates', async () => {
  const f = fixture([input('a'), input('b')]),
    judgment = await bound(f)
  const result = await judgment.admit(f.record.inputs)
  if (result.kind !== 'decisions') throw new Error('expected decisions')
  expect(result.results).toHaveLength(2)
  for (const [index, item] of result.results.entries()) {
    if (item.kind !== 'allow') throw new Error('expected allow')
    expect(decodeFormalToken(item.token)).toMatchObject({
      callId: f.record.inputs[index]!.call.callId,
      finalKey: f.record.finalKeys[index],
    })
  }
  expect(f.authority.authorize).toHaveBeenCalledTimes(4)
  expect(f.source.read).toHaveBeenCalledTimes(1)
  await f.owner.close()
})

test('authorization precedes pass existence; copied credentials and another scope cannot read it', async () => {
  const f = fixture()
  for (const [access, target] of [
    [{ ...f.access }, scope],
    [f.access, { ...scope, session: 'other' }],
  ] as const) {
    expect(
      await f.owner.forPass(access as SessionAccess, target as SessionScope, 'real-pass'),
    ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  }
  expect(f.source.read).not.toHaveBeenCalled()
  expect(await f.owner.forPass(f.access, scope, 'invented')).toEqual({
    kind: 'rejected',
    reason: 'passUnavailable',
  })
  f.revoke()
  expect(await f.owner.forPass(f.access, scope, 'invented')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  await f.owner.close()
})

test.each(['grants', 'arguments', 'definition', 'permission', 'mode', 'parent', 'answer'] as const)(
  'a binding refuses substituted %s',
  async field => {
    const f = fixture(),
      judgment = await bound(f),
      original = f.record.inputs[0]
    const changed = {
      ...original,
      ...(field === 'grants' ? { grants: {} } : {}),
      ...(field === 'arguments' ? { call: { ...original.call, arguments: { n: 2 } } } : {}),
      ...(field === 'definition'
        ? { definition: { name: 'other' }, call: { ...original.call, tool: 'other' } }
        : {}),
      ...(field === 'permission'
        ? { effectivePermission: { value: 'forbid', from: 'tenant' } }
        : {}),
      ...(field === 'mode' ? { runMode: 'never' } : {}),
      ...(field === 'parent' ? { parent: { permission: 'auto', runMode: 'auto_permission' } } : {}),
      ...(field === 'answer' ? { answer: 'deny' } : {}),
    } as AdmissionInput
    expect(await judgment.admit([changed])).toEqual({ kind: 'failed', reason: 'invalidInput' })
    expect(f.evaluate).not.toHaveBeenCalled()
    await f.owner.close()
  },
)

test('order and membership are fixed; equal lossless numeric values remain equal', async () => {
  const f = fixture([input('a'), input('b')]),
    judgment = await bound(f)
  expect(await judgment.admit([f.record.inputs[1]!, f.record.inputs[0]])).toEqual({
    kind: 'failed',
    reason: 'invalidInput',
  })
  expect(await judgment.admit([f.record.inputs[0]])).toEqual({
    kind: 'failed',
    reason: 'invalidInput',
  })
  const first = f.record.inputs[0]
  expect(
    await judgment.admit([
      { ...first, call: { ...first.call, arguments: { n: new LosslessNumber('1.0') } } },
      f.record.inputs[1]!,
    ]),
  ).toMatchObject({ kind: 'decisions' })
  await f.owner.close()
})

test.each(['revocation', 'withdrawal'] as const)(
  'no allow escapes %s during evaluation',
  async reason => {
    const f = fixture([input('call', 'ask')]),
      judgment = await bound(f)
    const gate = Promise.withResolvers<'allow'>(),
      entered = Promise.withResolvers<void>()
    f.evaluate.mockImplementation(async () => {
      entered.resolve()
      return gate.promise
    })
    const work = judgment.admit(f.record.inputs)
    await entered.promise
    if (reason === 'revocation') f.revoke()
    else f.withdraw()
    gate.resolve('allow')
    expect(await work).toEqual(unavailable)
    expect(await judgment.admit(f.record.inputs)).toEqual(unavailable)
    await f.owner.close()
  },
)

test('closing invalidates bindings and waits for actual evaluation completion', async () => {
  const f = fixture([input('call', 'ask')]),
    judgment = await bound(f)
  const gate = Promise.withResolvers<'allow'>(),
    entered = Promise.withResolvers<void>()
  f.evaluate.mockImplementation(async () => {
    entered.resolve()
    return gate.promise
  })
  const work = judgment.admit(f.record.inputs)
  await entered.promise
  let drained = false
  const closing = f.owner.close().then(() => {
    drained = true
  })
  await Promise.resolve()
  expect(drained).toBe(false)
  expect(await judgment.admit(f.record.inputs)).toEqual(unavailable)
  expect(await f.owner.forPass(f.access, scope, 'real-pass')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  gate.resolve('allow')
  expect(await work).toEqual(unavailable)
  await closing
  expect(drained).toBe(true)
})

test('revocation during source read defeats the old authorized answer', async () => {
  const f = fixture(),
    gate = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  vi.mocked(f.source.read).mockImplementation(async () => {
    entered.resolve()
    await gate.promise
    return { kind: 'found', record: f.record }
  })
  const work = f.owner.forPass(f.access, scope, 'real-pass')
  await entered.promise
  f.revoke()
  gate.resolve()
  expect(await work).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  await f.owner.close()
})

test('source exceptions and malformed records are unavailable, not absence or authorization', async () => {
  const f = fixture()
  vi.mocked(f.source.read).mockRejectedValueOnce(new Error('source failed'))
  expect(await f.owner.forPass(f.access, scope, 'real-pass')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  vi.mocked(f.source.read).mockResolvedValueOnce({
    kind: 'found',
    record: { ...f.record, finalKeys: ['invalid'] },
  })
  expect(await f.owner.forPass(f.access, scope, 'real-pass')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  await f.owner.close()
})

test('accessor batches and inputs cannot execute during binding judgment', async () => {
  const f = fixture(),
    judgment = await bound(f),
    getter = vi.fn(() => f.record.inputs[0])
  const batch = Object.defineProperty([], '0', { enumerable: true, get: getter })
  expect(await judgment.admit(batch as unknown as [AdmissionInput])).toEqual({
    kind: 'failed',
    reason: 'invalidInput',
  })
  const accessor = Object.defineProperty({ ...f.record.inputs[0] }, 'grants', {
    enumerable: true,
    get: getter,
  })
  expect(await judgment.admit([accessor])).toEqual({ kind: 'failed', reason: 'invalidInput' })
  expect(getter).not.toHaveBeenCalled()
  await f.owner.close()
})

test('a genuine fixed parent restriction preserves the algorithm failure instead of becoming a source failure', async () => {
  const child: AdmissionInput = {
    ...input(),
    parent: { permission: 'forbid', runMode: 'auto_permission' },
  }
  const f = fixture([child]),
    judgment = await bound(f)
  expect(await judgment.admit([child])).toEqual({ kind: 'failed', reason: 'parentNarrower' })
  expect(f.evaluate).not.toHaveBeenCalled()
  await f.owner.close()
})

test.each(['deny', 'undecidable'] as const)(
  'bound %s decisions do not acquire an allow token',
  async decision => {
    const f = fixture([input('call', 'ask')]),
      judgment = await bound(f)
    f.evaluate.mockResolvedValue(decision)
    const result = await judgment.admit(f.record.inputs)
    expect(result).toMatchObject({
      kind: 'decisions',
      results: [{ kind: decision === 'deny' ? 'deny' : 'ask' }],
    })
    if (result.kind !== 'decisions') throw new Error('expected decision')
    expect(result.results[0]).not.toHaveProperty('token')
    await f.owner.close()
  },
)

test('scope is owned before authorization can suspend', async () => {
  const f = fixture(),
    mutable = { ...scope, tenant: { ...scope.tenant } }
  const work = f.owner.forPass(f.access, mutable, 'real-pass')
  mutable.session = 'other' as SessionScope['session']
  mutable.tenant.account = 'other' as SessionScope['tenant']['account']
  expect(await work).toMatchObject({ kind: 'bound' })
  expect(f.source.read).toHaveBeenCalledWith(f.access, scope, 'real-pass')
  await f.owner.close()
})
