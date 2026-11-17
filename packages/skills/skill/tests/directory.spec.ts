import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillAccess } from '@omne-harness/skill'
import type { SkillPackageSource } from '@omne-harness/skill-contract/provider'
import {
  alice,
  createWorld,
  currentDigest,
  failureOf,
  okOf,
  review,
  reviewLocator,
  scope,
} from './access-world.ts'

const body = { capability: review, part: { kind: 'body' } } as const
const DIRECTORY = '/state/assets/skills/review/sha256-current'

function accessWith(directory: SkillPackageSource['directory']) {
  const world = createWorld()
  const asked: unknown[][] = []
  const source: SkillPackageSource = {
    snapshot: locator => world.ports.source.snapshot(locator),
    open: (locator, digest, path) => world.ports.source.open(locator, digest, path),
    ...(directory === undefined
      ? {}
      : {
          directory: (...args: Parameters<NonNullable<SkillPackageSource['directory']>>) => {
            asked.push(args)
            return directory(...args)
          },
        }),
  }
  return {
    access: createSkillAccess({ ...world.ports, source }),
    asked,
    calls: () => world.controls.calls(),
  }
}

describe('read and list carry the local directory of the pinned package', () => {
  it('gives the directory the source names, asked with the pinned locator and digest', async () => {
    const test = accessWith(async () => succeed(DIRECTORY))
    expect(okOf(await test.access.read(alice, scope, body)).directory).toBe(DIRECTORY)
    expect(okOf(await test.access.list(alice, scope, review)).directory).toBe(DIRECTORY)
    expect(test.asked).toEqual([
      [reviewLocator, currentDigest],
      [reviewLocator, currentDigest],
    ])
  })

  it('leaves the directory out when this assembly keeps no local directory', async () => {
    const test = accessWith(async () => succeed(null))
    expect(okOf(await test.access.read(alice, scope, body))).not.toHaveProperty('directory')
    expect(okOf(await test.access.list(alice, scope, review))).not.toHaveProperty('directory')
  })

  it('leaves the directory out when the source does not name directories', async () => {
    const test = accessWith(undefined)
    expect(okOf(await test.access.read(alice, scope, body))).not.toHaveProperty('directory')
    expect(okOf(await test.access.list(alice, scope, review))).not.toHaveProperty('directory')
  })

  it('answers source-unavailable for the whole call when the directory cannot be told, and reads no bytes', async () => {
    for (const directory of [
      async () => fail('unavailable' as const),
      async () => {
        throw new Error('disk gone')
      },
      async () => ({ ok: 42 }) as never,
    ] satisfies NonNullable<SkillPackageSource['directory']>[]) {
      const test = accessWith(directory)
      expect(failureOf(await test.access.read(alice, scope, body))).toStrictEqual({
        kind: 'source-unavailable',
      })
      expect(failureOf(await test.access.list(alice, scope, review))).toStrictEqual({
        kind: 'source-unavailable',
      })
      expect(test.calls().open).toBe(0)
    }
  })

  it('stops a listing with aborted when the signal fires while the directory is asked', async () => {
    const aborter = new AbortController()
    const test = accessWith(async () => {
      aborter.abort()
      return succeed(DIRECTORY)
    })
    expect(
      failureOf(await test.access.list(alice, scope, review, { signal: aborter.signal })),
    ).toStrictEqual({ kind: 'aborted' })
  })

  it('stops with aborted when the signal fires while the directory is asked, and reads no bytes', async () => {
    const aborter = new AbortController()
    const test = accessWith(async () => {
      aborter.abort()
      return succeed(DIRECTORY)
    })
    expect(
      failureOf(await test.access.read(alice, scope, body, { signal: aborter.signal })),
    ).toStrictEqual({ kind: 'aborted' })
    expect(test.calls().open).toBe(0)
  })
})
