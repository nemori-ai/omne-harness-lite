// The conformance suite of `SkillPackageSource` and its memory double.
import assert from 'node:assert/strict'
import { fail, succeed } from '@omne-harness/operation-result'
import { computeDigest, isPackageDigest } from './digest.ts'
import { encodingOf, inferMediaType } from './media.ts'
import { toPackagePath } from './names.ts'
import type { SkillPackageSource } from './ports.ts'
import { assertSealed, sealSnapshot } from './snapshot.ts'
import { conformanceCase, NotApplicable, type ConformanceCase } from './testing-case.ts'
import type {
  Bytes,
  PackageDigest,
  PackageLocator,
  PackagePath,
  SkillPackageSnapshot,
} from './values.ts'

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

type Held = Readonly<{ snapshot: SkillPackageSnapshot; files: ReadonlyMap<PackagePath, Bytes> }>

function hold(item: MemoryPackage): Held {
  const files = new Map<PackagePath, Bytes>()
  for (const [raw, content] of Object.entries(item.files)) {
    const path = toPackagePath(raw)
    if (!('ok' in path)) throw new TypeError(`not a package path: ${raw}`)
    files.set(path.ok, typeof content === 'string' ? encoder.encode(content) : content.slice())
  }
  const list = [...files].map(([path, bytes]) => ({ path, bytes }))
  const sealed = sealSnapshot({ rootName: item.rootName, files: list })
  if (!('ok' in sealed))
    throw new TypeError(`the memory package does not seal: ${sealed.failure.kind}`)
  return { snapshot: sealed.ok, files }
}

/**
 * A source over fixed packages in memory. It keeps the bytes of each package under the digest of
 * its snapshot, so `open` with any other digest answers `package-not-found`. It throws a TypeError
 * for a file name that is not a package path or for a package that does not seal.
 */
export function createMemorySource(packages: readonly MemoryPackage[]): SkillPackageSource {
  const held = new Map<string, Held>(packages.map(item => [locatorKey(item.locator), hold(item)]))
  return {
    async snapshot(locator) {
      const item = held.get(locatorKey(locator))
      return item === undefined ? fail('package-not-found') : succeed(item.snapshot)
    },
    async open(locator, digest, path) {
      const item = held.get(locatorKey(locator))
      if (item === undefined || item.snapshot.digest !== digest) return fail('package-not-found')
      const bytes = item.files.get(path)
      return bytes === undefined ? fail('entry-not-found') : succeed(bytes.slice())
    },
  }
}

/** A fresh source for one case, and the locators that the case asks about. */
export type SourceFixture = Readonly<{
  source: SkillPackageSource
  /** A package that the source holds. It must not change while the case runs. */
  present: PackageLocator
  /** A locator of no package. */
  absent: PackageLocator
  /** `content-digest` when the source keeps bytes by snapshot digest, `locator` otherwise. */
  addressing: 'content-digest' | 'locator'
}>

async function snapshotOf(fixture: SourceFixture): Promise<SkillPackageSnapshot> {
  const answer = await fixture.source.snapshot(fixture.present)
  if (!('ok' in answer)) assert.fail(`snapshot of the present package: ${answer.failure}`)
  return answer.ok
}

/** A path that the snapshot does not list. */
function pathOutside(snapshot: SkillPackageSnapshot): PackagePath {
  const listed = new Set<string>(snapshot.entries.map(entry => entry.path))
  for (let index = 0; ; index += 1) {
    const path = toPackagePath(`conformance-absent-${index}`)
    if ('ok' in path && !listed.has(path.ok)) return path.ok
  }
}

/** A well-formed digest other than `digest`. */
function otherDigest(digest: PackageDigest): PackageDigest {
  for (const digit of ['0', '1']) {
    const text = `sha256:${digit.repeat(64)}`
    if (isPackageDigest(text) && text !== digest) return text
  }
  throw new Error('unreachable: two different digests cannot both equal one digest')
}

export function skillPackageSourceConformance(): ConformanceCase<SourceFixture>[] {
  return [
    conformanceCase('PS1', 'snapshot gives a snapshot that sealSnapshot made', async fixture => {
      const snapshot = await snapshotOf(fixture)
      assert.doesNotThrow(() => assertSealed(snapshot), 'the snapshot is not sealed')
    }),
    conformanceCase('PS2', 'two snapshots of an unchanged package are equal', async fixture => {
      const first = await snapshotOf(fixture)
      const second = await snapshotOf(fixture)
      assert.equal(second.digest, first.digest)
      assert.equal(second.rootName, first.rootName)
      assert.deepEqual(second.entries, first.entries)
    }),
    conformanceCase(
      'PS3',
      'open gives bytes that match every entry of the snapshot',
      async fixture => {
        const snapshot = await snapshotOf(fixture)
        for (const entry of snapshot.entries) {
          const answer = await fixture.source.open(fixture.present, snapshot.digest, entry.path)
          if (!('ok' in answer)) assert.fail(`open ${entry.path}: ${answer.failure}`)
          const bytes = answer.ok
          assert.equal(computeDigest(bytes), entry.digest, `${entry.path}: digest`)
          assert.equal(bytes.length, entry.size, `${entry.path}: size`)
          assert.equal(encodingOf(bytes), entry.encoding, `${entry.path}: encoding`)
          assert.equal(
            inferMediaType(entry.path, bytes),
            entry.mediaType,
            `${entry.path}: media type`,
          )
        }
      },
    ),
    conformanceCase(
      'PS4',
      'snapshot of an absent package answers package-not-found',
      async fixture => {
        assert.deepEqual(await fixture.source.snapshot(fixture.absent), {
          failure: 'package-not-found',
        })
      },
    ),
    conformanceCase('PS5', 'open in an absent package answers package-not-found', async fixture => {
      const snapshot = await snapshotOf(fixture)
      const path = snapshot.entries[0]?.path ?? pathOutside(snapshot)
      assert.deepEqual(await fixture.source.open(fixture.absent, snapshot.digest, path), {
        failure: 'package-not-found',
      })
    }),
    conformanceCase(
      'PS6',
      'open of a path that is not in the package answers entry-not-found',
      async fixture => {
        const snapshot = await snapshotOf(fixture)
        assert.deepEqual(
          await fixture.source.open(fixture.present, snapshot.digest, pathOutside(snapshot)),
          { failure: 'entry-not-found' },
        )
      },
    ),
    conformanceCase(
      'PS7',
      'a source that keeps bytes by digest answers package-not-found for a digest it does not hold',
      async fixture => {
        if (fixture.addressing !== 'content-digest')
          throw new NotApplicable('content-digest addressing')
        const snapshot = await snapshotOf(fixture)
        const path = snapshot.entries[0]?.path ?? pathOutside(snapshot)
        assert.deepEqual(
          await fixture.source.open(fixture.present, otherDigest(snapshot.digest), path),
          { failure: 'package-not-found' },
        )
      },
    ),
  ]
}
