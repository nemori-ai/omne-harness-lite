import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  declarationRejection,
  digestBytes,
  judgePackageContent,
  packageDigest,
  withinDirectory,
  type BodyContract,
  type JsonValue,
  type PackageLayout,
  type PackageReader,
  type PackageSourceFailure,
} from '../src/index.ts'

const encoder = new TextEncoder()
const LIMITS = { files: 4, fileBytes: 64, totalBytes: 128 }

function packageOf(files: Readonly<Record<string, string>>) {
  const opened: string[] = []
  const reader: PackageReader = {
    manifest: async () =>
      succeed({
        entries: Object.entries(files).map(([path, text]) => ({
          path,
          bytes: encoder.encode(text).length,
          digest: digestBytes(encoder.encode(text)),
        })),
      }),
    async open(path, expected) {
      opened.push(`${path} ${expected}`)
      const text = files[path]
      return text === undefined ? fail('entry-not-found') : succeed(encoder.encode(text))
    },
  }
  return { reader, opened }
}

const failing = (failure: PackageSourceFailure): PackageReader => ({
  manifest: async () => fail(failure),
  open: async () => fail(failure),
})

const FILES = {
  'plugin.json': '{}',
  'skills/tidy/SKILL.md': 'tidy',
  'skills/tidy/scripts/run.sh': 'run',
  'skills/tidy-more/SKILL.md': 'more',
}

describe('withinDirectory', () => {
  it('lists the files under the directory and no other, by their paths inside it', async () => {
    const listed = await withinDirectory(packageOf(FILES).reader, 'skills/tidy').manifest()
    expect('ok' in listed && listed.ok.entries.map(entry => entry.path)).toEqual([
      'SKILL.md',
      'scripts/run.sh',
    ])
  })

  it('keeps the size and the digest of each file', async () => {
    const listed = await withinDirectory(packageOf(FILES).reader, 'skills/tidy').manifest()
    expect('ok' in listed && listed.ok.entries[0]).toEqual({
      path: 'SKILL.md',
      bytes: 4,
      digest: digestBytes(encoder.encode('tidy')),
    })
  })

  it('opens a file by its path inside the directory, with the digest it was asked for', async () => {
    const { reader, opened } = packageOf(FILES)
    const read = await withinDirectory(reader, 'skills/tidy').open('scripts/run.sh', 'sha256:x')
    expect('ok' in read && new TextDecoder().decode(read.ok)).toBe('run')
    expect(opened).toEqual(['skills/tidy/scripts/run.sh sha256:x'])
  })

  it.each(['../../plugin.json', '../tidy-more/SKILL.md', '/plugin.json', '', './SKILL.md', 'a//b'])(
    'does not ask the package for %j: the path leaves the directory or is not a path',
    async path => {
      const { reader, opened } = packageOf(FILES)
      expect(await withinDirectory(reader, 'skills/tidy').open(path, 'sha256:x')).toEqual(
        fail('entry-not-found'),
      )
      expect(opened).toEqual([])
    },
  )

  it('says what the package says when the package cannot be read', async () => {
    expect(await withinDirectory(failing('unavailable'), 'skills/tidy').manifest()).toEqual(
      fail('unavailable'),
    )
  })
})

describe('declarationRejection', () => {
  const entry = (path: string, bytes = 1) => ({ path, bytes })

  it('accepts a list inside the limits', () => {
    expect(declarationRejection({ entries: [entry('a'), entry('b/c')] }, LIMITS)).toBeUndefined()
  })

  it.each([
    ['a path that leaves the package', [entry('../a')]],
    ['one path twice', [entry('a'), entry('a')]],
    ['a file that is also a directory', [entry('a'), entry('a/b')]],
  ])('rejects %s', (_, entries) => {
    expect(declarationRejection({ entries }, LIMITS)).toEqual({
      kind: 'invalid-package',
      reason: 'manifest-path',
    })
  })

  it.each([
    ['files', [entry('a'), entry('b'), entry('c'), entry('d'), entry('e')]],
    ['fileBytes', [entry('a', 65)]],
    ['totalBytes', [entry('a', 64), entry('b', 64), entry('c', 1)]],
  ] as const)('rejects a list over the limit on %s', (limit, entries) => {
    expect(declarationRejection({ entries }, LIMITS)).toEqual({ kind: 'limit-exceeded', limit })
  })
})

describe('judgePackageContent', () => {
  const declared: JsonValue = {
    kind: 'object',
    entries: [{ key: 'name', value: { kind: 'string', value: 'tidy' } }],
  }
  const judged: unknown[] = []

  function contract(over: Partial<PackageLayout> = {}, rejected?: string): BodyContract {
    return {
      category: 'skill',
      schema: { kind: 'null' },
      judge(body, context) {
        judged.push([body, context])
        return rejected === undefined ? { ok: true } : { ok: false, rejected }
      },
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
      layout: {
        namespace: 'skills',
        limits: LIMITS,
        inspect: async () => succeed(declared),
        ...over,
      },
    }
  }

  const SKILL = { 'SKILL.md': 'tidy' }

  it('gives the file list, the version and the body when the category accepts the package', async () => {
    judged.length = 0
    const answer = await judgePackageContent(contract(), packageOf(SKILL).reader, 'tidy')
    if (!('ok' in answer)) throw new Error('rejected')
    const entries = [{ path: 'SKILL.md', bytes: 4, digest: digestBytes(encoder.encode('tidy')) }]
    expect(answer.ok.manifest).toEqual({ entries })
    expect(answer.ok.version).toBe(packageDigest(entries))
    expect(JSON.stringify(answer.ok.body)).toContain('"key":"manifest"')
    expect(judged).toEqual([
      [answer.ok.body, { capabilityName: 'tidy', definition: answer.ok.version }],
    ])
  })

  it('rejects a category that takes no directory', async () => {
    const { layout: _, ...data } = contract()
    expect(await judgePackageContent(data, packageOf(SKILL).reader, 'tidy')).toEqual(
      fail({ kind: 'not-a-directory-category' }),
    )
  })

  it('says the source failed when the file list cannot be read', async () => {
    expect(await judgePackageContent(contract(), failing('unavailable'), 'tidy')).toEqual(
      fail({ kind: 'source-failed', failure: 'unavailable' }),
    )
  })

  it('holds the package to the limits of the category before the category reads it', async () => {
    let inspected = 0
    const strict = contract({
      limits: { ...LIMITS, files: 0 },
      inspect: async () => ((inspected += 1), succeed(declared)),
    })
    expect(await judgePackageContent(strict, packageOf(SKILL).reader, 'tidy')).toEqual(
      fail({ kind: 'limit-exceeded', limit: 'files' }),
    )
    expect(inspected).toBe(0)
  })

  it('gives the rejection of the layout as it is', async () => {
    const refusing = contract({
      inspect: async () => fail({ kind: 'invalid-package', reason: 'no-skill-md' }),
    })
    expect(await judgePackageContent(refusing, packageOf(SKILL).reader, 'tidy')).toEqual(
      fail({ kind: 'invalid-package', reason: 'no-skill-md' }),
    )
  })

  it('gives what the category says when it judges the body unfit', async () => {
    expect(
      await judgePackageContent(contract({}, 'name-mismatch'), packageOf(SKILL).reader, 'tidy'),
    ).toEqual(fail({ kind: 'invalid-package', reason: 'name-mismatch' }))
  })
})
