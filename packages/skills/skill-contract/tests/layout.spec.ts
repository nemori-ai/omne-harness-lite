import { describe, expect, it } from 'vitest'
import { digestBytes, packageDigest, type PackageReader } from '@omne-harness/assets'
import {
  parseSkillPackage,
  projectAssetBody,
  SKILL_PACKAGE_LIMITS,
  skillBodyContract,
} from '@omne-harness/skill-contract'
import { packageEntryOf, sealEntries, sealSnapshot } from '@omne-harness/skill-contract/provider'
import { buildFixture, fixtureFiles, path } from './package-builder.ts'

function readerOf(files: Readonly<Record<string, Uint8Array>>): PackageReader {
  return {
    async manifest() {
      return {
        ok: {
          entries: Object.entries(files).map(([name, bytes]) => ({
            path: name,
            bytes: bytes.length,
            digest: digestBytes(bytes),
          })),
        },
      }
    },
    async open(name, expected) {
      const bytes = files[name]
      return bytes !== undefined && digestBytes(bytes) === expected
        ? { ok: bytes }
        : { failure: 'entry-not-found' }
    },
  }
}

const layout = skillBodyContract().layout

describe('the layout of the skill category', () => {
  it('gives the namespace skills and the package limits of the contract', () => {
    expect(layout?.namespace).toBe('skills')
    expect(layout?.limits).toEqual({
      files: 200,
      fileBytes: 1024 * 1024,
      totalBytes: 8 * 1024 * 1024,
    })
    expect(layout?.limits).toEqual(SKILL_PACKAGE_LIMITS)
  })

  it('projects the name, the description and the tools of a legal Skill directory', async () => {
    const files = fixtureFiles('full-skill')
    expect(Object.keys(files)).toContain('scripts/run.sh')
    const inspected = await layout?.inspect(readerOf(files))
    const built = buildFixture('full-skill')
    const definition = parseSkillPackage({ snapshot: built.snapshot, control: built.control })
    if (!('ok' in definition)) throw new Error('the fixture does not parse')
    expect(inspected).toEqual({ ok: projectAssetBody(definition.ok) })
    expect(inspected).toMatchObject({
      ok: {
        kind: 'object',
        entries: [
          { key: 'name', value: { kind: 'string', value: 'full-skill' } },
          { key: 'description', value: { kind: 'string' } },
          { key: 'tools', value: { kind: 'array', items: [{ kind: 'object' }] } },
          { key: 'package', value: { kind: 'object' } },
        ],
      },
    })
  })

  it.each([
    ['missing-manifest', 'manifest-missing'],
    ['format-unsupported', 'declaration-format-unsupported'],
    ['tool-ref-invalid', 'tool-ref-invalid'],
    ['malformed-duplicate-key', 'malformed'],
  ])('gives a named rejection for the illegal directory %s: %s', async (fixture, reason) => {
    expect(await layout?.inspect(readerOf(fixtureFiles(fixture)))).toEqual({
      failure: { kind: 'invalid-package', reason },
    })
  })

  it('gives the failure of the reader as source-failed', async () => {
    const files = fixtureFiles('plain-skill')
    const reader = readerOf(files)
    const broken: PackageReader = {
      manifest: () => reader.manifest(),
      open: async () => ({ failure: 'unavailable' }),
    }
    expect(await layout?.inspect(broken)).toEqual({
      failure: { kind: 'source-failed', failure: 'unavailable' },
    })
  })
})

describe('the other rejections of inspect', () => {
  const plain = fixtureFiles('plain-skill')

  it('gives the failure of the manifest as source-failed', async () => {
    const broken: PackageReader = {
      manifest: async () => ({ failure: 'package-not-found' }),
      open: readerOf(plain).open,
    }
    expect(await layout?.inspect(broken)).toEqual({
      failure: { kind: 'source-failed', failure: 'package-not-found' },
    })
  })

  it('rejects a manifest path that is no package path as bad-path', async () => {
    const reader = readerOf({ ...plain, '../outside.md': new TextEncoder().encode('x') })
    expect(await layout?.inspect(reader)).toEqual({
      failure: { kind: 'invalid-package', reason: 'bad-path' },
    })
  })

  it('answers material-unavailable when the reader gives bytes of another digest', async () => {
    const reader = readerOf(plain)
    const lying: PackageReader = {
      manifest: () => reader.manifest(),
      open: async () => ({ ok: new TextEncoder().encode('other bytes') }),
    }
    expect(await layout?.inspect(lying)).toEqual({
      failure: { kind: 'source-failed', failure: 'material-unavailable' },
    })
  })

  it('rejects a file that is the parent directory of another path as prefix-conflict', async () => {
    const bytes = new TextEncoder().encode('x')
    const reader = readerOf({ ...plain, docs: bytes, 'docs/guide.md': bytes })
    expect(await layout?.inspect(reader)).toEqual({
      failure: { kind: 'invalid-package', reason: 'prefix-conflict' },
    })
  })
})

describe('a snapshot sealed from manifest entries', () => {
  it('is the same, field by field, as the snapshot sealed from every byte', () => {
    const built = buildFixture('full-skill')
    const fromBytes = built.snapshot
    const fromEntries = sealEntries({ rootName: 'full-skill', entries: fromBytes.entries })
    expect(fromEntries).toEqual({ ok: fromBytes })
    if (!('ok' in fromEntries)) throw new Error('not sealed')
    expect(fromEntries.ok).not.toBe(fromBytes)
    const computed = Object.entries(fixtureFiles('full-skill'))
      .map(([name, bytes]) => packageEntryOf(path(name), bytes))
      .sort((left, right) => (left.path < right.path ? -1 : 1))
    expect(fromEntries.ok.entries).toStrictEqual(computed)
    expect(Object.isFrozen(fromEntries.ok)).toBe(true)
    expect(fromBytes.digest).toBe(packageDigest(fromBytes.entries))
  })

  it('computes the digest again from the entries, whatever their order', () => {
    const { snapshot } = buildFixture('full-skill')
    const reversed = sealEntries({
      rootName: 'full-skill',
      entries: [...snapshot.entries].reverse(),
    })
    expect(reversed).toEqual({ ok: snapshot })
  })

  it('refuses the same defects as sealSnapshot', () => {
    const [entry] = buildFixture('plain-skill').snapshot.entries
    if (entry === undefined) throw new Error('no entry')
    expect(sealEntries({ rootName: '', entries: [entry] })).toEqual({
      failure: { kind: 'invalid-root-name' },
    })
    expect(sealEntries({ rootName: 'a', entries: [entry, entry] })).toEqual({
      failure: { kind: 'duplicate-path', path: entry.path },
    })
    const file = { ...entry, path: path('a') }
    const nested = { ...entry, path: path('a/b') }
    expect(sealEntries({ rootName: 'a', entries: [nested, file] })).toEqual(
      sealSnapshot({
        rootName: 'a',
        files: [
          { path: path('a/b'), bytes: new Uint8Array() },
          { path: path('a'), bytes: new Uint8Array() },
        ],
      }),
    )
  })
})
