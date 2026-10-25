import { expect, it } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import type { TestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import type {
  NeedBinding,
  ConsumerClass,
  ContextBlockKey,
  RuntimeContextOperations,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { declaration, numberSchema, scope, setup, openScope } from '../src/testing/fixtures.js'
function tenant(account: string) {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_00000000000000000000000000', account }),
  )
  if (!parsed.ok) throw new Error('Invalid fixture tenant')
  return parsed.value
}
const owner = tenant('acc_00000000000000000000000000')
const other = tenant('acc_00000000000000000000000001')
function fresh() {
  const ports = createTestAuthorityPorts<string>()
  return { ports, memory: createMemoryRuntimeContext<string>(ports) }
}
const need = {
  name: 'value',
  shape: numberSchema,
  consumer: 'model',
  purpose: 'coverage risk',
  necessity: 'required',
} as const

it('refuses invalid bindings without a producer declaration and does not commit rejected preparation', async () => {
  const { memory, ports } = fresh()
  await openScope(memory, ports, 'principal', scope('undeclared'), owner)
  const base = {
    kind: 'add',
    scope: scope('undeclared'),
    tenant: owner,
    key: 'suite.value',
    basedOn: 0,
    creating: true,
    parameters: undefined,
    required: true,
  } as const
  const cases: readonly NeedBinding[] = [
    { key: 'suite.value', need: { ...need, name: '' } },
    { key: 'suite.other', need },
    {
      key: 'suite.value',
      need,
      translate: value => value,
      integrator: 'outsider' as ConsumerClass,
    },
  ]
  for (const [index, binding] of cases.entries()) {
    const change = { ...base, bindings: [binding] }
    expect(await memory.prepareRegistration('principal', change)).toMatchObject({
      kind: 'rejected',
      rejections: [{ path: ['bindings', 0], reason: 'key' }],
    })
    expect(
      await memory.applyCommit('principal', {
        kind: 'registration',
        commit: { commit: 'invalid-' + index },
        change,
      }),
    ).toMatchObject({ kind: 'invalid', reason: 'registration', current: 0 })
  }
  // A lawful declaration-independent registration still succeeds at revision zero.
  expect(
    await memory.applyCommit('principal', {
      kind: 'registration',
      commit: { commit: 'valid' },
      change: { ...base, bindings: [{ key: 'suite.value', need }] },
    }),
  ).toMatchObject({ kind: 'applied', registrationRevision: 1 })
})
async function add(
  memory: RuntimeContextOperations<string>,
  ports: TestAuthorityPorts<string>,
  target: ScopeRef,
  tenantId = owner,
  key: ContextBlockKey = 'suite.value',
) {
  await openScope(memory, ports, 'principal', target, tenantId)
  expect(
    await memory.applyCommit('principal', {
      kind: 'registration',
      commit: { commit: target.ref },
      change: {
        kind: 'add',
        scope: target,
        tenant: tenantId,
        key,
        basedOn: 0,
        creating: true,
        bindings: key === 'suite.value' ? [{ key, need }] : [],
        parameters: undefined,
        required: true,
      },
    }),
  ).toMatchObject({ kind: 'applied' })
}
async function reader(memory: RuntimeContextOperations<string>, target: ScopeRef) {
  const issued = await memory.issueEligibility('principal', {
    supersedes: null,
    scope: target,
    tenant: owner,
    principal: 'principal',
    consumer: 'model',
    keys: ['suite.value'],
    bindings: [],
    registrationRevision: 1,
  })
  if (issued.kind !== 'issued') throw new Error('Eligibility refused')
  const bound = await memory.bind(issued.eligibility.id)
  if (bound.kind !== 'bound') throw new Error('Reader refused')
  return bound.reader
}
it('inherits the parent value and its evidence when the child registration has no local value', async () => {
  const { memory, ports } = fresh()
  const parent = await setup(
    memory,
    ports,
    owner,
    'principal',
    declaration(),
    scope('inherit-parent'),
  )
  await parent.handle.publish({ scope: parent.scope, tenant: owner, value: 73 })
  const child = scope('inherit-child', parent.scope)
  await add(memory, ports, child)
  const bound = await reader(memory, child)
  expect(await bound.read([{ key: 'suite.value', need: 'value' }])).toMatchObject({
    kind: 'success',
    value: [{ kind: 'value', value: 73, evidence: { scope: parent.scope } }],
  })
  expect(await bound.snapshot()).toMatchObject({
    kind: 'success',
    value: {
      blocks: [{ state: { kind: 'value', value: 73 }, evidence: { scope: parent.scope } }],
      missing: [],
    },
  })
})
it('stops value fallback when the parent has no registration for the requested block', async () => {
  const { memory, ports } = fresh()
  const producer = await memory.registerProducer('principal', {
    key: 'suite.value',
    tenant: owner,
    producer: { producer: 'fixture' },
    declaration: declaration(),
    scoped: true,
  })
  if (producer.kind !== 'registered') throw new Error('Producer refused')
  const parent = scope('unregistered-parent')
  await add(memory, ports, parent, owner, 'suite.other')
  // Publishing does not grant registration or make an unregistered block inheritable.
  await producer.handle.publish({ scope: parent, tenant: owner, value: 91 })
  const child = scope('registered-child', parent)
  await add(memory, ports, child)
  const bound = await reader(memory, child)
  expect(await bound.read([{ key: 'suite.value', need: 'value' }])).toMatchObject({
    kind: 'missing',
    items: [{ key: 'suite.value', cause: 'no-value' }],
  })
  expect(await bound.snapshot()).toMatchObject({
    kind: 'success',
    value: { blocks: [], missing: [{ key: 'suite.value', cause: 'no-value' }] },
  })
})
it('does not inherit a registered parent value owned by another tenant', async () => {
  const { memory, ports } = fresh()
  const parent = await setup(
    memory,
    ports,
    other,
    'other-principal',
    declaration(),
    scope('foreign-parent'),
  )
  await parent.handle.publish({ scope: parent.scope, tenant: other, value: 99 })
  const child = scope('local-child', parent.scope)
  await add(memory, ports, child)
  const bound = await reader(memory, child)
  expect(await bound.read([{ key: 'suite.value', need: 'value' }])).toMatchObject({
    kind: 'missing',
    items: [{ cause: 'no-value' }],
  })
  expect(await bound.snapshot()).toMatchObject({
    kind: 'success',
    value: { blocks: [], missing: [{ cause: 'no-value' }] },
  })
})
it('refuses changes from a previously valid cursor after eligibility revocation', async () => {
  const { memory, ports } = fresh()
  const s = await setup(memory, ports, owner, 'principal')
  await s.handle.publish({ scope: s.scope, tenant: owner, value: 1 })
  const snapshot = await s.reader.snapshot()
  if (snapshot.kind !== 'success') throw new Error('Snapshot refused')
  expect(await memory.revokeEligibility('principal', s.eligibility.id)).toEqual({ kind: 'revoked' })
  expect(await s.reader.changes(snapshot.value.cursor)).toEqual({
    kind: 'refused',
    reason: 'unauthorized',
  })
})

it('validates the entire unknown scope parent chain and reports the offending location', () => {
  const input = { ref: 'leaf', parent: { ref: 'middle', parent: { ref: 'root' } } }
  expect(decodeScopeRef(input)).toEqual({ ok: input })
  for (const [parent, failure] of [
    [42, { path: ['parent'], reason: 'type' }],
    [{}, { path: ['parent', 'ref'], reason: 'missing-key' }],
    [{ ref: 42 }, { path: ['parent', 'ref'], reason: 'type' }],
    [{ ref: '  ' }, { path: ['parent', 'ref'], reason: 'empty' }],
    [
      { ref: 'root', extension: true },
      { path: ['parent', 'extension'], reason: 'unknown-key' },
    ],
  ] as const) {
    expect(decodeScopeRef({ ref: 'leaf', parent })).toEqual({ failure })
  }
  expect(decodeScopeRef({ ref: 'leaf', extension: true })).toEqual({
    failure: { path: ['extension'], reason: 'unknown-key' },
  })
  const first: { ref: string; parent?: unknown } = { ref: 'first' }
  const second = { ref: 'second', parent: first }
  first.parent = second
  expect(decodeScopeRef(first)).toEqual({
    failure: { path: ['parent', 'parent'], reason: 'parent' },
  })
  const self: { ref: string; parent?: unknown } = { ref: 'self' }
  self.parent = self
  expect(decodeScopeRef(self)).toEqual({ failure: { path: ['parent'], reason: 'parent' } })
})
