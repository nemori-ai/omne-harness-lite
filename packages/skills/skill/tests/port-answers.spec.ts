// The unified handling of a port answer, by the contract SPEC "端口答复的统一处置": every answer
// is parsed whole at the boundary of this member, the discriminant and the payload. An answer
// outside its closed set, a port that rejects or throws, and an answer that throws while it is
// read are all "no answer": the read check and the resolution are taken as `unknown`; the source
// is taken as `unavailable`, which the mapping turns into `source-unavailable`. No operation
// throws. Every case goes through the public services.
import { describe, expect, it } from 'vitest'
import { createPackageInspection, createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import type {
  CatalogResolution,
  ReadVerdict,
  Resolution,
  SkillPackageSource,
  SkillReadCheck,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import {
  alice,
  createWorld,
  okOf,
  retired,
  review,
  reviewLocator,
  scope,
  type Principal,
  type Scope,
  type World,
} from './access-world.ts'

type Adopted = Extract<Resolution, { kind: 'adopted' }>
type StandIn = Extract<Resolution, { kind: 'known-unavailable' }>

const UNKNOWN = { failure: { kind: 'unknown' } }
const SOURCE_UNAVAILABLE = { failure: { kind: 'source-unavailable' } }
const body = { capability: review, part: { kind: 'body' } } as const

/** A port method that answers `answer` whatever it is asked, or rejects when `answer` is an Error.
 * The port types do not let a malformed answer be written, so the helper widens it here. */
function answering<T>(answer: unknown): () => Promise<T> {
  return () =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer as unknown as T)
}

/** A port method that throws before it gives a promise. */
function throwing<T>(): () => Promise<T> {
  return () => {
    throw new Error('the port threw at once')
  }
}

/** An object that throws on every look at its fields: a broken proxy that a port hands over. It
 * is not a thenable, so the promise of the port settles with it. */
const EXPLODING: unknown = new Proxy(
  {},
  {
    get(_target, key) {
      if (key === 'then') return undefined
      throw new Error('the answer broke while it was read')
    },
    has() {
      throw new Error('the answer broke while it was read')
    },
  },
)

/** A script declaration whose parameters hold every kind of JSON node. */
const SCRIPT = {
  entry: 'scripts/run.sh',
  runKind: 'shell',
  facilities: ['network'],
  parameters: {
    kind: 'object',
    entries: [
      { key: 'none', value: { kind: 'null' } },
      { key: 'flag', value: { kind: 'boolean', value: true } },
      { key: 'text', value: { kind: 'string', value: 'x' } },
      { key: 'count', value: { kind: 'number', lexeme: '1' } },
      { key: 'list', value: { kind: 'array', items: [{ kind: 'null' }] } },
    ],
  },
}

/** The adopted answer and the stand-in answer that the world's resolution gives. */
async function lawfulAnswers(world: World) {
  const adopted = await world.ports.resolution.resolve(alice, scope, review)
  const standIn = await world.ports.resolution.resolve(alice, scope, retired)
  if (adopted.kind !== 'adopted' || standIn.kind !== 'known-unavailable')
    throw new Error('the world does not adopt review or does not stand in for retired')
  return { adopted, standIn }
}

/** One malformed answer and the name of its case. */
type Case = readonly [name: string, answer: unknown]

const THROWN: readonly Case[] = [
  ['a reject', new Error('the port broke')],
  ['an answer that throws when it is read', EXPLODING],
]

/** The cases of `THROWN` after the cases of `own`. */
function cases(...own: readonly Case[]): readonly Case[] {
  return [...own, ...THROWN]
}

describe('the read check', () => {
  it.each(cases(['an answer outside the set', { kind: 'exploded' }]))(
    '%s makes describe, read and the catalog answer unknown',
    async (_case, answer) => {
      const { ports } = createWorld()
      const readCheck: SkillReadCheck<Principal, Scope> = { check: answering<ReadVerdict>(answer) }
      const access = createSkillAccess({ ...ports, readCheck })
      const catalog = createSkillCatalog({ ...ports, readCheck })
      expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
      expect(await access.read(alice, scope, body)).toStrictEqual(UNKNOWN)
      expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
    },
  )

  it('a port that throws before it gives a promise makes describe, read and the catalog answer unknown', async () => {
    const { ports } = createWorld()
    const readCheck: SkillReadCheck<Principal, Scope> = { check: throwing<ReadVerdict>() }
    const access = createSkillAccess({ ...ports, readCheck })
    const catalog = createSkillCatalog({ ...ports, readCheck })
    expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
    expect(await access.read(alice, scope, body)).toStrictEqual(UNKNOWN)
    expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
  })
})

describe('the resolution at resolve', () => {
  /** Describe and read through a resolution with this `resolve` both answer unknown. */
  async function expectUnknown(world: World, resolve: () => Promise<Resolution>) {
    const resolution: SkillResolution<Principal, Scope> = { ...world.ports.resolution, resolve }
    const access = createSkillAccess({ ...world.ports, resolution })
    expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
    expect(await access.read(alice, scope, body)).toStrictEqual(UNKNOWN)
  }

  it.each(
    cases(
      ['an answer that is no object', null],
      ['an answer outside the set', { kind: 'exploded' }],
    ),
  )('%s makes describe and read answer unknown', async (_case, answer) => {
    await expectUnknown(createWorld(), answering(answer))
  })

  it('a port that throws before it gives a promise makes describe and read answer unknown', async () => {
    await expectUnknown(createWorld(), throwing<Resolution>())
  })

  it.each([
    ['without its reference and its declaration', () => ({ kind: 'adopted' })],
    [
      'with a capability identity that has an empty name',
      (a: Adopted) => ({
        ...a,
        ref: { ...a.ref, capability: { category: 'skill', name: '' } },
      }),
    ],
    [
      'with a locator of a kind outside the set',
      (a: Adopted) => ({
        ...a,
        ref: { ...a.ref, locator: { kind: 'ftp', root: '/x' } },
      }),
    ],
    [
      'with a digest that is no package digest',
      (a: Adopted) => ({ ...a, ref: { ...a.ref, digest: 'sha1:00' } }),
    ],
    [
      'with a declared name that is no skill name',
      (a: Adopted) => ({
        ...a,
        declared: { ...a.declared, name: 'Not A Name' },
      }),
    ],
    [
      'with a tool that is no capability identity',
      (a: Adopted) => ({
        ...a,
        declared: { ...a.declared, tools: ['read-file'] },
      }),
    ],
    [
      'with a script whose entry is no package path',
      (a: Adopted) => ({
        ...a,
        declared: {
          ...a.declared,
          scripts: [{ entry: '../run.sh', runKind: 'shell', facilities: [] }],
        },
      }),
    ],
    [
      'with a setting of a category outside the set',
      (a: Adopted) => ({
        ...a,
        declared: { ...a.declared, settings: [{ name: 'tone', category: 'mood' }] },
      }),
    ],
    [
      'with script parameters that hold a node outside the JSON tree',
      (a: Adopted) => ({
        ...a,
        declared: {
          ...a.declared,
          scripts: [{ ...SCRIPT, parameters: { kind: 'array', items: [{ kind: 'number' }] } }],
        },
      }),
    ],
  ])('an adopted answer %s makes describe and read answer unknown', async (_case, broken) => {
    const world = createWorld()
    const { adopted } = await lawfulAnswers(world)
    await expectUnknown(world, answering(broken(adopted)))
  })

  it.each([
    ['without a name', (s: StandIn) => ({ ...s, name: undefined })],
    [
      'with a reason that holds a control character',
      (s: StandIn) => ({ ...s, reason: 'Gone.\u0007' }),
    ],
    [
      'with a description longer than 1024 characters',
      (s: StandIn) => ({ ...s, description: 'x'.repeat(1025) }),
    ],
  ])('a stand-in answer %s makes describe answer unknown', async (_case, broken) => {
    const world = createWorld()
    const { standIn } = await lawfulAnswers(world)
    const resolution: SkillResolution<Principal, Scope> = {
      ...world.ports.resolution,
      resolve: answering(broken(standIn)),
    }
    const access = createSkillAccess({ ...world.ports, resolution })
    expect(await access.describe(alice, scope, retired)).toStrictEqual(UNKNOWN)
  })

  it('a script with parameters of every JSON node passes as it was given', async () => {
    const world = createWorld()
    const { adopted } = await lawfulAnswers(world)
    const declared = { ...adopted.declared, scripts: [SCRIPT] }
    const resolution: SkillResolution<Principal, Scope> = {
      ...world.ports.resolution,
      resolve: answering({ ...adopted, declared }),
    }
    const access = createSkillAccess({ ...world.ports, resolution })
    expect(okOf(await access.describe(alice, scope, review)).scripts).toStrictEqual([SCRIPT])
  })

  it('a well-formed answer with extra fields passes without them', async () => {
    const world = createWorld()
    const { adopted } = await lawfulAnswers(world)
    const resolution: SkillResolution<Principal, Scope> = {
      ...world.ports.resolution,
      resolve: answering({ ...adopted, extra: 'ignored', declared: { ...adopted.declared } }),
    }
    const access = createSkillAccess({ ...world.ports, resolution })
    expect(await access.describe(alice, scope, review)).toStrictEqual(
      await world.access.describe(alice, scope, review),
    )
  })
})

describe('the resolution at adopted', () => {
  /** The catalog over a resolution whose `adopted` gives `answer` answers unknown both ways. */
  async function expectUnknown(world: World, answer: unknown) {
    const resolution: SkillResolution<Principal, Scope> = {
      ...world.ports.resolution,
      adopted: answering<{ ok: readonly CatalogResolution[] }>(answer),
    }
    const catalog = createSkillCatalog({ ...world.ports, resolution })
    expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
    expect(await catalog.search(alice, scope, { text: '' })).toStrictEqual({ failure: 'unknown' })
  }

  it.each(
    cases(
      ['an answer that is no outcome', 42],
      ['a failure outside the set', { failure: 'exploded' }],
      ['an ok that is no list', { ok: 'everything' }],
      ['a list with an answer outside the set', { ok: [{ kind: 'none' }] }],
    ),
  )('%s makes the catalog answer unknown', async (_case, answer) => {
    await expectUnknown(createWorld(), answer)
  })

  it('a port that throws before it gives a promise makes the catalog answer unknown', async () => {
    const world = createWorld()
    const resolution: SkillResolution<Principal, Scope> = {
      ...world.ports.resolution,
      adopted: throwing(),
    }
    const catalog = createSkillCatalog({ ...world.ports, resolution })
    expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
  })

  it.each([
    ['an adopted item without its declaration', (a: object) => ({ ...a, declared: undefined })],
    [
      'an adopted item whose capability identity has no name',
      (a: Adopted) => ({
        ...a,
        ref: { ...a.ref, capability: { category: 'skill' } },
      }),
    ],
    [
      'an adopted item whose tools hold an identity with an empty name',
      (a: Adopted) => ({
        ...a,
        declared: { ...a.declared, tools: [{ category: 'tool', name: '' }] },
      }),
    ],
    [
      'an adopted item whose description is longer than 1024 characters',
      (a: Adopted) => ({
        ...a,
        declared: { ...a.declared, description: 'x'.repeat(1025) },
      }),
    ],
  ])('a list with %s makes the catalog answer unknown', async (_case, broken) => {
    const world = createWorld()
    const { adopted, standIn } = await lawfulAnswers(world)
    await expectUnknown(world, { ok: [broken(adopted), standIn] })
  })

  it.each([
    ['whose name is no skill name', { name: 'Not A Name' }],
    ['whose reason is empty', { reason: '' }],
    ['whose description is empty', { description: '' }],
    ['whose capability identity is a text', { capability: 'skill:retired' }],
  ])('a list with a stand-in item %s makes the catalog answer unknown', async (_case, change) => {
    const world = createWorld()
    const { adopted, standIn } = await lawfulAnswers(world)
    await expectUnknown(world, { ok: [adopted, { ...standIn, ...change }] })
  })
})

describe('the source', () => {
  const OUTSIDE: readonly Case[] = cases(
    ['a failure outside the set', { failure: 'exploded' }],
    [
      'a failure that is no text even when it reads as a member of the set',
      { failure: { toString: () => 'outside-package' } },
    ],
    ['an answer that is no outcome', 42],
  )

  it.each<Case>([
    ...OUTSIDE,
    ['an ok that sealSnapshot did not make', 'forged'],
    ['a port that throws before it gives a promise', 'throwing'],
  ])(
    '%s at snapshot makes inspect, read, list and export answer source-unavailable',
    async (_case, answer) => {
      const world = createWorld()
      const { ports } = world
      const real = okOf(await ports.source.snapshot(reviewLocator))
      const snapshot: SkillPackageSource['snapshot'] =
        answer === 'forged'
          ? answering({ ok: { ...real } })
          : answer === 'throwing'
            ? throwing()
            : answering(answer)
      const source: SkillPackageSource = { ...ports.source, snapshot }
      const access = createSkillAccess({ ...ports, source })
      const described = okOf(await world.access.describe(alice, scope, review))
      if (described.material.kind !== 'pinned') throw new Error('describe did not pin')
      expect(await createPackageInspection(source).inspect(reviewLocator)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
      expect(await access.read(alice, scope, body)).toStrictEqual(SOURCE_UNAVAILABLE)
      expect(await access.list(alice, scope, review)).toStrictEqual(SOURCE_UNAVAILABLE)
      expect(await access.export(alice, scope, review, described.material.basis)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
    },
  )

  it.each<Case>([
    ...OUTSIDE,
    ['an ok that is no bytes', { ok: 'Read the diff.' }],
    ['a port that throws before it gives a promise', 'throwing'],
  ])(
    '%s at open makes inspect, read and export answer source-unavailable',
    async (_case, answer) => {
      const world = createWorld()
      const { ports } = world
      const open: SkillPackageSource['open'] =
        answer === 'throwing' ? throwing() : answering(answer)
      const source: SkillPackageSource = { ...ports.source, open }
      const access = createSkillAccess({ ...ports, source })
      const described = okOf(await access.describe(alice, scope, review))
      if (described.material.kind !== 'pinned') throw new Error('describe did not pin')
      expect(await createPackageInspection(source).inspect(reviewLocator)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
      expect(await access.read(alice, scope, body)).toStrictEqual(SOURCE_UNAVAILABLE)
      expect(await access.export(alice, scope, review, described.material.basis)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
    },
  )
})
