// The conformance suite of `SkillPackageSource` and its memory double.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { computeDigest } from './digest.ts'
import { encodingOf, inferMediaType } from './media.ts'
import { toPackagePath } from './names.ts'
import type { SkillPackageSource } from './ports.ts'
import { assertSealed, sealSnapshot } from './snapshot.ts'
import type { Bytes, PackageLocator, PackagePath } from './values.ts'

export type MemoryPackage = Readonly<{
  locator: PackageLocator
  rootName: string
  /** Package paths and their content; text is written as UTF-8. */
  files: Readonly<Record<string, string | Bytes>>
}>

function locatorKey(locator: PackageLocator): string {
  return JSON.stringify(
    locator.kind === 'directory' ? ['directory', locator.root] : ['content-store', locator.digest],
  )
}

const encoder = new TextEncoder()

/**
 * A source over fixed packages in memory. It ignores the `digest` argument of `open`: it holds
 * only the current bytes of each package. It throws a TypeError for a file name that is not a
 * package path or for a package that does not seal.
 */
export function createMemorySource(packages: readonly MemoryPackage[]): SkillPackageSource {
  const held = new Map<
    string,
    Readonly<{ rootName: string; files: ReadonlyMap<PackagePath, Bytes> }>
  >()
  for (const item of packages) {
    const files = new Map<PackagePath, Bytes>()
    for (const [raw, content] of Object.entries(item.files)) {
      const path = toPackagePath(raw)
      if (!('ok' in path)) throw new TypeError(`not a package path: ${raw}`)
      files.set(path.ok, typeof content === 'string' ? encoder.encode(content) : content.slice())
    }
    held.set(locatorKey(item.locator), { rootName: item.rootName, files })
  }
  return {
    async snapshot(locator) {
      const item = held.get(locatorKey(locator))
      if (item === undefined) return fail('package-not-found')
      const files = [...item.files].map(([path, bytes]) => ({ path, bytes }))
      const sealed = sealSnapshot({ rootName: item.rootName, files })
      if (!('ok' in sealed))
        throw new TypeError(`the memory package does not seal: ${sealed.failure.kind}`)
      return sealed
    },
    async open(locator, _digest, path) {
      const item = held.get(locatorKey(locator))
      if (item === undefined) return fail('package-not-found')
      const bytes = item.files.get(path)
      return bytes === undefined ? fail('entry-not-found') : succeed(bytes.slice())
    },
  }
}

export type SourceSamples = Readonly<{
  /** A package that the source holds. It must not change while the suite runs. */
  present: PackageLocator
  /** A locator of no package. */
  absent: PackageLocator
}>

const SOURCE_CASES = {
  sealed: 'snapshot gives a snapshot that sealSnapshot made',
  stable: 'two snapshots of an unchanged package are equal',
  bytes: 'open gives bytes that match every entry of the snapshot',
  absentSnapshot: 'snapshot of an absent package answers package-not-found',
  absentOpen: 'open in an absent package answers package-not-found',
  absentEntry: 'open of a path that is not in the package answers entry-not-found',
} as const

/** A path that the snapshot does not list. */
function pathOutside(listed: ReadonlySet<string>): PackagePath {
  for (let index = 0; ; index += 1) {
    const path = toPackagePath(`conformance-absent-${index}`)
    if ('ok' in path && !listed.has(path.ok)) return path.ok
  }
}

export function describeSkillPackageSourceConformance(
  input: Readonly<{
    name: string
    create: () => SkillPackageSource | Promise<SkillPackageSource>
    samples: SourceSamples
  }>,
): void {
  const { create, samples } = input
  const snapshotOf = async (source: SkillPackageSource) => {
    const answer = await source.snapshot(samples.present)
    if (!('ok' in answer))
      throw new Error(`snapshot of the present package failed: ${answer.failure}`)
    return answer.ok
  }

  describe(`SkillPackageSource conformance: ${input.name}`, () => {
    it(SOURCE_CASES.sealed, async () => {
      const snapshot = await snapshotOf(await create())
      expect(() => assertSealed(snapshot)).not.toThrow()
    })

    it(SOURCE_CASES.stable, async () => {
      const source = await create()
      const first = await snapshotOf(source)
      const second = await snapshotOf(source)
      expect(second.digest).toBe(first.digest)
      expect(second.entries).toEqual(first.entries)
      expect(second.rootName).toBe(first.rootName)
    })

    it(SOURCE_CASES.bytes, async () => {
      const source = await create()
      const snapshot = await snapshotOf(source)
      for (const entry of snapshot.entries) {
        const answer = await source.open(samples.present, snapshot.digest, entry.path)
        if (!('ok' in answer)) throw new Error(`open ${entry.path} failed: ${answer.failure}`)
        const bytes = answer.ok
        expect(computeDigest(bytes), entry.path).toBe(entry.digest)
        expect(bytes.length, entry.path).toBe(entry.size)
        expect(encodingOf(bytes), entry.path).toBe(entry.encoding)
        expect(inferMediaType(entry.path, bytes), entry.path).toBe(entry.mediaType)
      }
    })

    it(SOURCE_CASES.absentSnapshot, async () => {
      expect(await (await create()).snapshot(samples.absent)).toEqual({
        failure: 'package-not-found',
      })
    })

    it(SOURCE_CASES.absentOpen, async () => {
      const source = await create()
      const snapshot = await snapshotOf(source)
      const path = snapshot.entries[0]?.path ?? pathOutside(new Set())
      expect(await source.open(samples.absent, snapshot.digest, path)).toEqual({
        failure: 'package-not-found',
      })
    })

    it(SOURCE_CASES.absentEntry, async () => {
      const source = await create()
      const snapshot = await snapshotOf(source)
      const path = pathOutside(new Set(snapshot.entries.map(entry => entry.path)))
      expect(await source.open(samples.present, snapshot.digest, path)).toEqual({
        failure: 'entry-not-found',
      })
    })
  })
}
