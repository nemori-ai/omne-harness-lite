// The unified handling of a port answer outside its closed set and of a port that rejects, by
// the contract SPEC "端口答复的统一处置": the read check and the resolution are taken as
// `unknown`; the source is taken as `unavailable`, which the mapping turns into
// `source-unavailable`. No operation throws. The three ports each give one answer outside the
// set and one reject, through the public services.
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
import { alice, createWorld, review, reviewLocator, scope } from './access-world.ts'

const UNKNOWN = { failure: { kind: 'unknown' } }
const SOURCE_UNAVAILABLE = { failure: { kind: 'source-unavailable' } }
const body = { capability: review, part: { kind: 'body' } } as const

/** A port method that answers `answer` whatever it is asked, or rejects when `answer` is an Error. */
function answering<T>(answer: unknown): () => Promise<T> {
  return () =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer as unknown as T)
}

const OUTSIDE = [
  ['an answer outside the set', { kind: 'exploded' }],
  ['a reject', new Error('the port broke')],
] as const

describe('the read check', () => {
  it.each(OUTSIDE)(
    '%s makes describe, read and the catalog answer unknown',
    async (_case, answer) => {
      const { ports } = createWorld()
      const readCheck: SkillReadCheck<'alice' | 'mallory', 'workspace-a'> = {
        check: answering<ReadVerdict>(answer),
      }
      const access = createSkillAccess({ ...ports, readCheck })
      const catalog = createSkillCatalog({ ...ports, readCheck })
      expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
      expect(await access.read(alice, scope, body)).toStrictEqual(UNKNOWN)
      expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
    },
  )
})

describe('the resolution', () => {
  it.each([
    ['an answer that is no object', null],
    ['an answer outside the set', { kind: 'exploded' }],
    ['a reject', new Error('the port broke')],
  ] as const)('%s at resolve makes describe and read answer unknown', async (_case, answer) => {
    const { ports } = createWorld()
    const resolution: SkillResolution<'alice' | 'mallory', 'workspace-a'> = {
      ...ports.resolution,
      resolve: answering<Resolution>(answer),
    }
    const access = createSkillAccess({ ...ports, resolution })
    expect(await access.describe(alice, scope, review)).toStrictEqual(UNKNOWN)
    expect(await access.read(alice, scope, body)).toStrictEqual(UNKNOWN)
  })

  it.each([
    ['an answer that is no outcome', 42],
    ['an ok that is no list', { ok: 'everything' }],
    ['a list with an answer outside the set', { ok: [{ kind: 'none' }] }],
    ['a reject', new Error('the port broke')],
  ] as const)('%s at adopted makes the catalog answer unknown', async (_case, answer) => {
    const { ports } = createWorld()
    const resolution: SkillResolution<'alice' | 'mallory', 'workspace-a'> = {
      ...ports.resolution,
      adopted: answering<{ ok: readonly CatalogResolution[] }>(answer),
    }
    const catalog = createSkillCatalog({ ...ports, resolution })
    expect(await catalog.summaries(alice, scope)).toStrictEqual({ failure: 'unknown' })
    expect(await catalog.search(alice, scope, { text: 'review' })).toStrictEqual({
      failure: 'unknown',
    })
  })
})

describe('the source', () => {
  const SOURCE_OUTSIDE = [
    ['a failure outside the set', { failure: 'exploded' }],
    ['an answer that is no outcome', 42],
    ['a reject', new Error('the source broke')],
  ] as const

  it.each(SOURCE_OUTSIDE)(
    '%s at snapshot makes inspect, read, list and export answer source-unavailable',
    async (_case, answer) => {
      const { ports } = createWorld()
      const source: SkillPackageSource = { ...ports.source, snapshot: answering(answer) }
      const access = createSkillAccess({ ...ports, source })
      expect(await createPackageInspection(source).inspect(reviewLocator)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
      expect(await access.read(alice, scope, body)).toStrictEqual(SOURCE_UNAVAILABLE)
      expect(await access.list(alice, scope, review)).toStrictEqual(SOURCE_UNAVAILABLE)
    },
  )

  it.each(SOURCE_OUTSIDE)(
    '%s at open makes inspect, read and export answer source-unavailable',
    async (_case, answer) => {
      const { ports } = createWorld()
      const source: SkillPackageSource = { ...ports.source, open: answering(answer) }
      const access = createSkillAccess({ ...ports, source })
      expect(await createPackageInspection(source).inspect(reviewLocator)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
      expect(await access.read(alice, scope, body)).toStrictEqual(SOURCE_UNAVAILABLE)
      const described = await access.describe(alice, scope, review)
      if (!('ok' in described) || described.ok.material.kind !== 'pinned')
        throw new Error('describe did not pin')
      expect(await access.export(alice, scope, review, described.ok.material.basis)).toStrictEqual(
        SOURCE_UNAVAILABLE,
      )
    },
  )
})
