// The content-store source over a fake read port of assets (C10): it reads the snapshot and the
// files through the two steps of the read port, answers bytes-mismatch for bytes that differ from
// the manifest and package-not-found for no package, and runs the source conformance suite.
import { describe, expect, it } from 'vitest'
import {
  digestBytes,
  packageDigest,
  type PackageReader,
  type PackageSourceFailure,
} from '@omne-harness/assets'
import {
  isPackageDigest,
  toPackagePath,
  type PackageDigest,
  type PackagePath,
} from '@omne-harness/skill-contract'
import { sealSnapshot } from '@omne-harness/skill-contract/provider'
import {
  runConformanceCase,
  skillPackageSourceConformance,
} from '@omne-harness/skill-contract/testing'
import { createContentStoreSource } from '@omne-harness/skill-host-local'

const encoder = new TextEncoder()
const FILES: Readonly<Record<string, string>> = {
  'SKILL.md': '---\nname: weekly-report\ndescription: Writes the weekly report.\n---\nGather.\n',
  'scripts/report.sh': '#!/bin/sh\necho report\n',
}

function digestOf(files: Readonly<Record<string, string>>): PackageDigest {
  const digest = packageDigest(
    Object.entries(files).map(([path, text]) => ({
      path,
      digest: digestBytes(encoder.encode(text)),
    })),
  )
  if (!isPackageDigest(digest)) throw new Error('not a package digest')
  return digest
}

const DIGEST = digestOf(FILES)

function packagePath(raw: string): PackagePath {
  const path = toPackagePath(raw)
  if (!('ok' in path)) throw new Error(`not a package path: ${raw}`)
  return path.ok
}

type Store = Readonly<{
  /** What the read port of each digest holds. */
  packages: Map<string, Record<string, string>>
  opened: string[]
  /** Bytes that the store gives in place of the stored ones, by path. */
  tampered: Map<string, string>
  /** A failure that `open` gives for every file. */
  openFailure?: PackageSourceFailure
}>

function store(overrides: Partial<Store> = {}): Store {
  return {
    packages: new Map([[DIGEST, { ...FILES }]]),
    opened: [],
    tampered: new Map(),
    ...overrides,
  }
}

/** A read port that checks the digest of the bytes it gives, as the read port of assets does. */
function readerOf(held: Store) {
  return (digest: string): PackageReader => ({
    async manifest() {
      const files = held.packages.get(digest)
      if (files === undefined) return { failure: 'package-not-found' }
      return {
        ok: {
          entries: Object.entries(files).map(([path, text]) => ({
            path,
            bytes: encoder.encode(text).length,
            digest: digestBytes(encoder.encode(text)),
          })),
        },
      }
    },
    async open(path, expected) {
      held.opened.push(path)
      if (held.openFailure !== undefined) return { failure: held.openFailure }
      const files = held.packages.get(digest)
      if (files === undefined) return { failure: 'package-not-found' }
      const text = files[path]
      if (text === undefined || digestBytes(encoder.encode(text)) !== expected)
        return { failure: 'entry-not-found' }
      const bytes = encoder.encode(held.tampered.get(path) ?? text)
      return digestBytes(bytes) === expected ? { ok: bytes } : { failure: 'material-unavailable' }
    },
  })
}

const locator = { kind: 'content-store', digest: DIGEST } as const

describe('C10 the content-store source over the read port of assets', () => {
  it('reads the snapshot and a file through the read port', async () => {
    const source = createContentStoreSource({ readerOf: readerOf(store()) })
    const snapshot = await source.snapshot(locator)
    const expected = sealSnapshot({
      rootName: DIGEST,
      files: Object.entries(FILES).map(([path, text]) => ({
        path: packagePath(path),
        bytes: encoder.encode(text),
      })),
    })
    expect(snapshot).toEqual(expected)
    if (!('ok' in snapshot)) throw new Error('no snapshot')
    expect(snapshot.ok.digest).toBe(DIGEST)
    const [, script] = snapshot.ok.entries
    if (script === undefined) throw new Error('no script entry')
    expect(await source.open(locator, DIGEST, script.path)).toEqual({
      ok: encoder.encode(FILES['scripts/report.sh']),
    })
  })

  it('answers bytes-mismatch when the bytes differ from the manifest', async () => {
    const held = store({ tampered: new Map([['scripts/report.sh', 'rm -rf /\n']]) })
    const source = createContentStoreSource({ readerOf: readerOf(held) })
    expect(await source.snapshot(locator)).toEqual({ failure: 'bytes-mismatch' })
    const sealed = store()
    const sealedSource = createContentStoreSource({ readerOf: readerOf(sealed) })
    const snapshot = await sealedSource.snapshot(locator)
    if (!('ok' in snapshot)) throw new Error('no snapshot')
    sealed.tampered.set('SKILL.md', 'changed\n')
    expect(await sealedSource.open(locator, DIGEST, snapshot.ok.entries[0]!.path)).toEqual({
      failure: 'bytes-mismatch',
    })
  })

  it('answers bytes-mismatch when the manifest does not give the digest that names it', async () => {
    const held = store({ packages: new Map([[DIGEST, { 'SKILL.md': 'another package\n' }]]) })
    const source = createContentStoreSource({ readerOf: readerOf(held) })
    expect(await source.snapshot(locator)).toEqual({ failure: 'bytes-mismatch' })
  })

  it('answers package-not-found when there is no package', async () => {
    const source = createContentStoreSource({ readerOf: readerOf(store({ packages: new Map() })) })
    expect(await source.snapshot(locator)).toEqual({ failure: 'package-not-found' })
    expect(await source.open(locator, DIGEST, packagePath('SKILL.md'))).toEqual({
      failure: 'package-not-found',
    })
    expect(await source.snapshot({ kind: 'directory', root: '/skills/weekly-report' })).toEqual({
      failure: 'package-not-found',
    })
  })

  it('passes the failure of the read port on', async () => {
    const source = createContentStoreSource({
      readerOf: readerOf(store({ openFailure: 'unavailable' })),
    })
    expect(await source.snapshot(locator)).toEqual({ failure: 'unavailable' })
  })

  it('seals a digest once: a later read opens only the file it reads', async () => {
    const held = store()
    const source = createContentStoreSource({ readerOf: readerOf(held) })
    await source.snapshot(locator)
    expect(held.opened).toHaveLength(2)
    held.opened.length = 0
    await source.snapshot(locator)
    await source.open(locator, DIGEST, packagePath('SKILL.md'))
    expect(held.opened).toEqual(['SKILL.md'])
  })
})

describe('SkillPackageSource conformance: content-store source over a read port in memory', () => {
  for (const conformance of skillPackageSourceConformance())
    it(`${conformance.clause} ${conformance.name}`, async () => {
      const fixture = {
        source: createContentStoreSource({ readerOf: readerOf(store()) }),
        present: locator,
        absent: { kind: 'content-store', digest: digestOf({ 'SKILL.md': 'none\n' }) } as const,
        addressing: 'content-digest' as const,
      }
      const answer = await runConformanceCase(conformance, fixture)
      expect(answer.kind === 'passed' || answer.kind === 'not-applicable').toBe(true)
      if (conformance.clause !== 'PS8') expect(answer).toEqual({ kind: 'passed' })
    })
})
