import type { AnswerOf } from '@omne-harness/access-cordis-contract'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import type { WriteOutcome } from '../src/ports.ts'
import {
  ASSET,
  READ_REFUSALS,
  VIEWS,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type FixtureLogin,
  type FixturePrincipal,
  type World,
} from './fixtures/world.ts'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

type Operations = typeof assetsProtocol.operations
type Name = keyof Operations

function wire<K extends Name>(name: K, answer: AnswerOf<Operations[K]>) {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const codec = (assetsProtocol.operations[name].outcomes as Record<string, unknown>)[
    answer.outcome
  ] as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  const written = codec.write(answer.body, limits)
  if (!written.ok || written.value === undefined) throw new Error(`${answer.outcome} did not write`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

const signal = new AbortController().signal
const as = (login: FixtureLogin) => ({
  principal: loginIdentity(login),
  messageId: 'm-1',
  signal,
})

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const principalOf = (login: FixtureLogin): FixturePrincipal => ({
  account: login.account,
  tenantText: login.tenantText,
})

function body<K extends Name>(name: K, sample: Record<string, unknown>) {
  const read = assetsProtocol.operations[name].body.read(tree(sample), limits)
  if (!read.ok) throw new Error(`${name} sample did not read`)
  return read.value as never
}
const WRITE = { asset: ASSET, item: 'invoke', operation: 'op-1', expectedRevision: '12' }
const bodies = (login: FixtureLogin) => ({
  'list-settings': body('list-settings', { tenant: login.tenantText, after: null, limit: 20 }),
  'describe-setting': body('describe-setting', {
    tenant: login.tenantText,
    asset: ASSET,
    item: 'invoke',
  }),
  'set-setting': body('set-setting', {
    tenant: login.tenantText,
    ...WRITE,
    value: { kind: 'permission', pick: 'auto' },
  }),
  'clear-setting': body('clear-setting', { tenant: login.tenantText, ...WRITE }),
})

function call<K extends Name>(world: World, name: K, login: FixtureLogin, target = login) {
  const handler = world.contribution.operations[name] as (
    context: ReturnType<typeof as>,
    value: unknown,
  ) => Promise<AnswerOf<Operations[K]>>
  return handler(as(login), bodies(target)[name])
}

const NAMES = ['list-settings', 'describe-setting', 'set-setting', 'clear-setting'] as const

describe('list-settings', () => {
  it('hands over the tenant, the principal, after and limit, and leaves an absent asset out', async () => {
    const world = createWorld()
    await call(world, 'list-settings', ALICE)
    expect(world.calls()).toEqual([
      {
        method: 'list',
        input: { principal: principalOf(ALICE), tenant: ALICE.tenant, after: null, limit: 20 },
      },
    ])
  })

  it('hands over a named asset and the next text of the page before', async () => {
    const world = createWorld()
    const handler = world.contribution.operations['list-settings']
    await handler(
      as(ALICE),
      body('list-settings', {
        tenant: ALICE.tenantText,
        asset: { name: 'shell' },
        after: '20',
        limit: 5,
      }),
    )
    expect(world.calls()[0]?.input).toMatchObject({
      asset: { name: 'shell' },
      after: '20',
      limit: 5,
    })
  })

  it('a listed page carries each item with its value, source, revision and editability', async () => {
    const world = createWorld()
    world.answer({
      list: { kind: 'listed', items: Object.values(VIEWS), next: '3', completeness: 'partial' },
    })
    const answer = await call(world, 'list-settings', ALICE)
    expect(wire('list-settings', answer)).toEqual({
      outcome: 'succeeded',
      body: { items: Object.values(VIEWS), next: '3', completeness: 'partial' },
    })
  })
})

describe('describe-setting', () => {
  it('hands over the asset and the item', async () => {
    const world = createWorld()
    await call(world, 'describe-setting', ALICE)
    expect(world.calls()).toEqual([
      {
        method: 'describe',
        input: {
          principal: principalOf(ALICE),
          tenant: ALICE.tenant,
          asset: ASSET,
          item: 'invoke',
        },
      },
    ])
  })

  it.each(Object.entries(VIEWS))('a described %s item carries its revision', async (_, view) => {
    const world = createWorld()
    world.answer({ describe: { kind: 'described', item: view } })
    const answer = await call(world, 'describe-setting', ALICE)
    expect(wire('describe-setting', answer)).toEqual({ outcome: 'succeeded', body: { item: view } })
  })
})

describe('reads map the refusals of the face', () => {
  const expected = {
    denied: { outcome: 'denied' },
    'not-visible': { outcome: 'not-visible', body: {} },
    conflict: { outcome: 'conflict', body: {} },
    unavailable: { outcome: 'basis-unavailable' },
  } as const
  for (const name of ['list-settings', 'describe-setting'] as const)
    it.each(READ_REFUSALS)(`${name} maps %s`, async kind => {
      const world = createWorld()
      world.answer({ list: { kind }, describe: { kind } })
      const answer = await call(world, name, ALICE)
      expect(wire(name, answer)).toEqual(expected[kind])
    })
})

describe('set-setting', () => {
  it('hands over the operation, the revision read and a pick', async () => {
    const world = createWorld()
    await call(world, 'set-setting', ALICE)
    expect(world.calls()).toEqual([
      {
        method: 'set',
        input: {
          principal: principalOf(ALICE),
          tenant: ALICE.tenant,
          ...WRITE,
          value: { kind: 'permission', pick: 'auto' },
        },
      },
    ])
  })

  it('hands over an ordinary value as plain JSON', async () => {
    const world = createWorld()
    const value = { depth: [1, 'two', null, true, { nested: 2.5 }] }
    await world.contribution.operations['set-setting'](
      as(ALICE),
      body('set-setting', {
        tenant: ALICE.tenantText,
        ...WRITE,
        value: { kind: 'ordinary', value },
      }),
    )
    expect(world.calls()[0]?.input).toMatchObject({ value: { kind: 'ordinary', value } })
  })

  it('keeps a key named __proto__ as an own key of the value', async () => {
    const world = createWorld()
    const value = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>
    await world.contribution.operations['set-setting'](
      as(ALICE),
      body('set-setting', {
        tenant: ALICE.tenantText,
        ...WRITE,
        value: { kind: 'ordinary', value },
      }),
    )
    const [handedCall] = world.calls()
    if (handedCall === undefined) throw new Error('the face was not called')
    const handed = (handedCall.input as { value: { value: object } }).value.value
    expect(Object.hasOwn(handed, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(handed)).toBe(Object.prototype)
  })

  it('hands over a secret as it came: the face answers for it', async () => {
    const world = createWorld()
    await world.contribution.operations['set-setting'](
      as(ALICE),
      body('set-setting', {
        tenant: ALICE.tenantText,
        ...WRITE,
        value: { kind: 'secret', secret: 's' },
      }),
    )
    expect(world.calls()[0]?.input).toMatchObject({ value: { kind: 'secret', secret: 's' } })
  })
})

describe('clear-setting', () => {
  it('hands over the operation and the revision read, and no value', async () => {
    const world = createWorld()
    await call(world, 'clear-setting', ALICE)
    expect(world.calls()).toEqual([
      { method: 'clear', input: { principal: principalOf(ALICE), tenant: ALICE.tenant, ...WRITE } },
    ])
  })
})

describe('writes map every outcome of the face', () => {
  const rows: readonly (readonly [WriteOutcome, unknown])[] = [
    [
      { kind: 'written', revision: '13' },
      { outcome: 'succeeded', body: { revision: '13' } },
    ],
    [{ kind: 'no-change' }, { outcome: 'no-change', body: {} }],
    [{ kind: 'denied' }, { outcome: 'denied' }],
    [{ kind: 'not-visible' }, { outcome: 'not-visible', body: {} }],
    [{ kind: 'invalid' }, { outcome: 'invalid', body: {} }],
    [{ kind: 'conflict' }, { outcome: 'conflict', body: {} }],
    ...(['locked', 'out-of-bound', 'prohibited-above', 'not-a-source'] as const).map(
      reason =>
        [
          { kind: 'not-writable', reason },
          { outcome: 'not-writable', body: { reason } },
        ] as const,
    ),
    [{ kind: 'unavailable' }, { outcome: 'basis-unavailable' }],
    [{ kind: 'unknown' }, { outcome: 'unknown' }],
  ]
  for (const name of ['set-setting', 'clear-setting'] as const)
    it.each(rows)(`${name} maps %o`, async (outcome, expected) => {
      const world = createWorld()
      world.answer({ write: outcome })
      expect(wire(name, await call(world, name, ALICE))).toEqual(expected)
    })
})

describe('the principal for the target tenant (AA-1)', () => {
  it.each(NAMES)(
    '%s: a login of another account is denied and the face is not called',
    async name => {
      const world = createWorld()
      const answer = await call(world, name, BOB, ALICE)
      expect(answer).toEqual({ outcome: 'denied' })
      expect(world.calls()).toEqual([])
    },
  )

  it.each(NAMES)('%s: identity refuses, the refusal is answered as it is', async name => {
    for (const refusal of ['denied', 'basis-unavailable'] as const) {
      const world = createWorld()
      world.refuseTargets(refusal)
      expect(await call(world, name, ALICE)).toEqual({ outcome: refusal })
      expect(world.calls()).toEqual([])
    }
  })

  it.each(NAMES)('%s: identity throws, the basis is unavailable', async name => {
    const world = createWorld()
    world.refuseTargets('throw')
    expect(await call(world, name, ALICE)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.calls()).toEqual([])
  })
})

describe('the face is taken at the call (AA-2)', () => {
  it.each(NAMES)('%s: the face is not on the tree, the basis is unavailable', async name => {
    const world = createWorld()
    world.removeFace()
    expect(await call(world, name, ALICE)).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('a face that throws (AA-5)', () => {
  it.each(['list-settings', 'describe-setting'] as const)(
    '%s: nothing was committed, the basis is unavailable',
    async name => {
      const world = createWorld()
      world.answer({ list: 'throw', describe: 'throw' })
      expect(await call(world, name, ALICE)).toEqual({ outcome: 'basis-unavailable' })
    },
  )

  it.each(['set-setting', 'clear-setting'] as const)(
    '%s: the write may have been handed over, the result is unknown',
    async name => {
      const world = createWorld()
      world.answer({ write: 'throw' })
      expect(await call(world, name, ALICE)).toEqual({ outcome: 'unknown' })
    },
  )
})
