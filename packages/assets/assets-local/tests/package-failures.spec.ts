import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  digestBytes,
  packageDigest,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { lookupOf } from './lookup.ts'
import {
  createPublishedPackages,
  versionDirectoryName,
  type PackageRecords,
  type PackageStep,
} from '../src/packages.ts'

const encoder = new TextEncoder()
const FILES: Readonly<Record<string, string>> = { 'SKILL.md': 'one', 'scripts/run.sh': 'echo 1' }
const VERSION = packageDigest(
  Object.entries(FILES).map(([path, text]) => ({
    path,
    digest: digestBytes(encoder.encode(text)),
  })),
)
const OBJECT: JsonValue = { kind: 'object', entries: [] }

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('invalid identity')
  return made.id
}
const report = id('bundle', 'report')

function categories(declaration: () => JsonValue = () => OBJECT, judged = true) {
  return lookupOf(
    {
      category: 'bundle',
      schema: { kind: 'null' },
      judge: () => (judged ? { ok: true } : { ok: false, rejected: 'name-mismatch' }),
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
      layout: {
        namespace: 'bundles',
        limits: { files: 3, fileBytes: 64, totalBytes: 128 },
        async inspect() {
          return { ok: declaration() }
        },
      },
    },
    {
      category: 'plain',
      schema: { kind: 'null' },
      judge: () => ({ ok: true }),
      deriveDeclarations: () => ({ entries: [] }),
      references: () => [],
    },
  )
}

type Entry = Readonly<{ path: string; text: string }>

function reader(
  entries: readonly Entry[] = Object.entries(FILES).map(([path, text]) => ({ path, text })),
  overrides: Partial<PackageReader> = {},
): PackageReader {
  return {
    async manifest() {
      return {
        ok: {
          entries: entries.map(({ path, text }) => ({
            path,
            bytes: encoder.encode(text).length,
            digest: digestBytes(encoder.encode(text)),
          })),
        },
      }
    },
    async open(path) {
      const found = entries.find(entry => entry.path === path)
      return found === undefined
        ? { failure: 'entry-not-found' }
        : { ok: encoder.encode(found.text) }
    },
    ...overrides,
  }
}

function records(overrides: Partial<PackageRecords> = {}): PackageRecords {
  return {
    async publishAndHold(input) {
      return { kind: 'committed', operationId: input.operationId, revision: 1, changed: true, domainRevision: 1 }
    },
    async readAssetRevision() {
      return { ok: 0 }
    },
    async readVersionRecord() {
      return { ok: undefined }
    },
    ...overrides,
  }
}

function scratch(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'assets-package-failures-')))
}

function setup(
  options: {
    root?: string | undefined
    records?: Partial<PackageRecords>
    declaration?: () => JsonValue
    judged?: boolean
    afterStep?: (step: PackageStep) => void | Promise<void>
  } = {},
) {
  const root = 'root' in options ? options.root : scratch()
  const packages = createPublishedPackages({
    root,
    holdingScope: 'tenant-a',
    categories: categories(options.declaration, options.judged),
    records: records(options.records),
    afterStep: options.afterStep,
  })
  return { root: root ?? '', packages }
}

const publish = (
  packages: ReturnType<typeof setup>['packages'],
  from: PackageReader = reader(),
  operationId = 'publish-1',
) =>
  packages.publish({ capability: report, from, operationId, holding: { sources: [], grants: [] } })

const placeOf = (root: string, version = VERSION) =>
  join(root, 'bundles', 'report', versionDirectoryName(version))

const recordOf = (body: JsonValue = manifestBody()) =>
  ({ ok: { category: 'bundle', name: 'report', body } }) as const

function manifestBody(): JsonValue {
  return {
    kind: 'object',
    entries: [
      {
        key: 'manifest',
        value: {
          kind: 'object',
          entries: [
            {
              key: 'entries',
              value: {
                kind: 'array',
                items: Object.entries(FILES).map(([path, text]) => ({
                  kind: 'object',
                  entries: [
                    { key: 'path', value: { kind: 'string', value: path } },
                    {
                      key: 'bytes',
                      value: { kind: 'number', lexeme: String(encoder.encode(text).length) },
                    },
                    {
                      key: 'digest',
                      value: { kind: 'string', value: digestBytes(encoder.encode(text)) },
                    },
                  ],
                })),
              },
            },
          ],
        },
      },
    ],
  }
}

function writeTree(dir: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

function stagingOf(root: string): string[] {
  const dir = join(root, '.staging')
  return existsSync(dir) ? readdirSync(dir) : []
}

describe('publish rejects a package before it writes anything', () => {
  it.each([
    ['an empty path', ['']],
    ['a .. segment', ['a/../b']],
    ['a . segment', ['./a']],
    ['an empty segment', ['a//b']],
    ['a backslash', ['a\\b']],
    ['a NUL character', ['a\0b']],
    ['a repeated path', ['a', 'a']],
    ['a file that is the parent directory of another file', ['a', 'a/b']],
  ])('a manifest with %s is a bad manifest path', async (_case, paths) => {
    const { root, packages } = setup()
    const from = reader(paths.map(path => ({ path, text: 'x' })))
    expect(await publish(packages, from)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'invalid-package', reason: 'manifest-path' },
    })
    expect(readdirSync(root)).toEqual([])
  })

  it.each([
    ['a declaration that is no object', (): JsonValue => ({ kind: 'array', items: [] })],
    [
      'a declaration that names a manifest itself',
      (): JsonValue => ({
        kind: 'object',
        entries: [{ key: 'manifest', value: { kind: 'null' } }],
      }),
    ],
  ])('%s is a bad declaration shape', async (_case, declaration) => {
    const { root, packages } = setup({ declaration })
    expect(await publish(packages)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'invalid-package', reason: 'declaration-shape' },
    })
    expect(readdirSync(root)).toEqual([])
  })

  it('a record body over its budget is rejected, not cut', async () => {
    const declaration = (): JsonValue => ({
      kind: 'object',
      entries: [{ key: 'note', value: { kind: 'string', value: 'n'.repeat(70_000) } }],
    })
    const { packages } = setup({ declaration })
    expect(await publish(packages)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'record-rejected', reason: 'limit_exceeded' },
    })
  })

  it('a manifest that cannot be read is a failure of the source', async () => {
    const { packages } = setup()
    const from = reader(undefined, { manifest: async () => ({ failure: 'unavailable' }) })
    expect(await publish(packages, from)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'source-failed', failure: 'unavailable' },
    })
  })

  it('a body that the category refuses is an invalid package with its reason', async () => {
    const { packages } = setup({ judged: false })
    expect(await publish(packages)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'invalid-package', reason: 'name-mismatch' },
    })
  })
})

describe('publish while it stages and records', () => {
  it('bytes that differ from the manifest leave no staging', async () => {
    const { root, packages } = setup()
    const from = reader(undefined, { open: async () => ({ ok: encoder.encode('other') }) })
    expect(await publish(packages, from)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'source-failed', failure: 'material-unavailable' },
    })
    expect(stagingOf(root)).toEqual([])
  })

  it('a reader that fails while staging leaves no staging', async () => {
    const { root, packages } = setup()
    const from = reader(undefined, { open: async () => ({ failure: 'unavailable' }) })
    expect(await publish(packages, from)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'source-failed', failure: 'unavailable' },
    })
    expect(stagingOf(root)).toEqual([])
  })

  it('an asset revision that cannot be read rejects the record', async () => {
    const { packages } = setup({
      records: { readAssetRevision: async () => ({ failure: 'unavailable' }) },
    })
    expect(await publish(packages)).toEqual({
      kind: 'rejected',
      rejection: { kind: 'record-rejected', reason: 'unavailable' },
    })
  })

  it('an unknown record answers unknown; the swapped version directory stays for the recovery scan', async () => {
    const { root, packages } = setup({
      records: {
        publishAndHold: async input => ({ kind: 'unknown', operationId: input.operationId }),
      },
    })
    expect(await publish(packages)).toEqual({ kind: 'unknown', operationId: 'publish-1' })
    expect(stagingOf(root)).toEqual([])
    expect(existsSync(placeOf(root))).toBe(true)
  })

  it.each([
    ['version_conflict', { kind: 'conflict' }],
    ['revision_conflict', { kind: 'conflict' }],
    [
      'forbidden',
      { kind: 'rejected', rejection: { kind: 'record-rejected', reason: 'forbidden' } },
    ],
  ] as const)(
    'a record rejected for %s leaves no staging and no record',
    async (reason, answer) => {
      const { root, packages } = setup({
        records: { publishAndHold: async () => ({ kind: 'rejected', reason }) },
      })
      expect(await publish(packages)).toEqual(answer)
      expect(stagingOf(root)).toEqual([])
    },
  )

  it('asks the records with the revision read before staging, and with the holding of the capability', async () => {
    const asked: unknown[] = []
    let revisionRead = false
    const { packages } = setup({
      records: {
        async readAssetRevision(assetRef) {
          revisionRead = true
          asked.push(assetRef)
          return { ok: 4 }
        },
        async publishAndHold(input) {
          asked.push(input)
          return { kind: 'committed', operationId: input.operationId, revision: 5, changed: true, domainRevision: 1 }
        },
      },
      afterStep(step) {
        if (step === 'staged') expect(revisionRead).toBe(true)
      },
    })
    expect(await publish(packages)).toEqual({ kind: 'published', version: VERSION, changed: true })
    expect(asked[0]).toBe('bundle/report')
    expect(asked[1]).toMatchObject({
      operationId: 'publish-1',
      assetRef: 'bundle/report',
      expectedRevision: 4,
      holding: { holdingRef: 'bundle/report', scopeRef: 'tenant-a', sources: [], grants: [] },
    })
  })
})

describe('the swap meets a place that is already there', () => {
  it('a version directory that is already there is the same content: no staging, straight to the commit', async () => {
    const { root, packages } = setup()
    writeTree(placeOf(root), FILES)
    const from = reader(undefined, {
      open: async () => {
        throw new Error('staging must not read the files again')
      },
    })
    expect(await publish(packages, from)).toEqual({
      kind: 'published',
      version: VERSION,
      changed: true,
    })
    expect(stagingOf(root)).toEqual([])
  })

  it('takes a version directory that another publish put in place first', async () => {
    let root = ''
    const made = setup({
      afterStep(step) {
        if (step === 'staged') writeTree(placeOf(root), FILES)
      },
    })
    root = made.root
    expect(await publish(made.packages)).toEqual({
      kind: 'published',
      version: VERSION,
      changed: true,
    })
    expect(stagingOf(root)).toEqual([])
  })

  it('answers unknown when the place of the version is a file', async () => {
    let root = ''
    const made = setup({
      afterStep(step) {
        if (step !== 'staged') return
        mkdirSync(join(placeOf(root), '..'), { recursive: true })
        writeFileSync(placeOf(root), 'not a directory')
      },
    })
    root = made.root
    expect(await publish(made.packages)).toEqual({ kind: 'unknown', operationId: 'publish-1' })
  })
})

describe('the read port and locate', () => {
  it.each([
    ['a body without a manifest', recordOf(OBJECT)],
    [
      'a category without a layout',
      { ok: { category: 'plain', name: 'report', body: manifestBody() } },
    ],
  ] as const)('a record of %s names no package', async (_case, record) => {
    const { packages } = setup({ records: { readVersionRecord: async () => record } })
    const read = packages.reader({ assetRef: 'tenant/report', version: VERSION })
    expect(await read.manifest()).toEqual({ failure: 'package-not-found' })
  })

  it('a version record read that throws answers unavailable', async () => {
    const { packages } = setup({
      records: {
        readVersionRecord: async () => {
          throw new Error('no answer')
        },
      },
    })
    const read = packages.reader({ assetRef: 'tenant/report', version: VERSION })
    expect(await read.manifest()).toEqual({ failure: 'unavailable' })
    expect(await packages.locate({ assetRef: 'tenant/report', version: VERSION })).toEqual({
      kind: 'unavailable',
    })
  })

  it('a file that is gone from the place answers material-unavailable', async () => {
    const { root, packages } = setup({ records: { readVersionRecord: async () => recordOf() } })
    writeTree(placeOf(root), FILES)
    rmSync(join(placeOf(root), 'SKILL.md'))
    const read = packages.reader({ assetRef: 'tenant/report', version: VERSION })
    expect(await read.open('SKILL.md', digestBytes(encoder.encode(FILES['SKILL.md']!)))).toEqual({
      failure: 'material-unavailable',
    })
  })

  it.each([
    [
      'a record that cannot be read',
      'unavailable',
      async () => ({ failure: 'unavailable' }) as const,
    ],
    ['no record', 'absent', async () => ({ ok: undefined }) as const],
    ['a record whose place is not there', 'absent', async () => recordOf()],
  ] as const)('locate answers %s as %s', async (_case, kind, readVersionRecord) => {
    const { packages } = setup({ records: { readVersionRecord } })
    expect(await packages.locate({ assetRef: 'tenant/report', version: VERSION })).toEqual({
      kind,
    })
  })

  it('locate answers absent when a file stands where a directory of the path should be', async () => {
    const { root, packages } = setup({ records: { readVersionRecord: async () => recordOf() } })
    mkdirSync(join(root, 'bundles'), { recursive: true })
    writeFileSync(join(root, 'bundles', 'report'), 'a file')
    expect(await packages.locate({ assetRef: 'tenant/report', version: VERSION })).toEqual({
      kind: 'absent',
    })
  })
})

describe('the recovery scan', () => {
  it('finds nothing without a root, or with a root that is not there yet', async () => {
    expect(await setup({ root: undefined }).packages.recover()).toEqual({
      discarded: 0,
      deferred: [],
      mismatched: [],
    })
    const missing = join(scratch(), 'not-yet')
    expect(await setup({ root: missing }).packages.recover()).toEqual({
      discarded: 0,
      deferred: [],
      mismatched: [],
    })
  })

  it('discards every staging, whatever is in it', async () => {
    const { root, packages } = setup()
    writeTree(join(root, '.staging', 'half', 'files'), { 'SKILL.md': 'half' })
    writeTree(join(root, '.staging', 'whole', 'files'), FILES)
    expect(await packages.recover()).toEqual({ discarded: 2, deferred: [], mismatched: [] })
    expect(stagingOf(root)).toEqual([])
  })

  it('throws when the record of a version directory cannot be read, and deletes nothing', async () => {
    const asked: string[] = []
    const { root, packages } = setup({
      records: {
        async readVersionRecord(assetRef, version) {
          asked.push(`${assetRef} ${version}`)
          return { failure: 'unavailable' }
        },
      },
    })
    mkdirSync(join(root, 'bundles'), { recursive: true })
    writeFileSync(join(root, 'bundles', '.category'), 'bundle')
    writeTree(placeOf(root), FILES)
    await expect(packages.recover()).rejects.toThrow('unavailable')
    expect(asked).toEqual([`bundle/report ${VERSION}`])
    expect(existsSync(placeOf(root))).toBe(true)
  })

  it('never takes a directory whose name is no version for an unrecorded version', async () => {
    const asked: string[] = []
    const { root, packages } = setup({
      records: {
        async readVersionRecord(_assetRef, version) {
          asked.push(version)
          return { ok: undefined }
        },
      },
    })
    mkdirSync(join(root, 'bundles'), { recursive: true })
    writeFileSync(join(root, 'bundles', '.category'), 'bundle')
    const hex = '0'.repeat(64)
    const names = [
      'loose',
      'sha256',
      'a-b-c',
      'sha256-0',
      `sha512-${hex}`,
      `xsha256-${hex}`,
      `sha256-${hex}x`,
    ]
    for (const name of names) writeTree(join(root, 'bundles', 'report', name), FILES)
    expect(await packages.recover()).toMatchObject({ discarded: 0, deferred: [] })
    expect(asked).toEqual([])
    expect(readdirSync(join(root, 'bundles', 'report')).sort()).toEqual([...names].sort())
  })

  it('reports each capability of a withdrawn category once in deferred', async () => {
    const { root, packages } = setup()
    mkdirSync(join(root, 'gones'), { recursive: true })
    writeFileSync(join(root, 'gones', '.category'), 'gone')
    const versions = [`sha256-${'0'.repeat(64)}`, `sha256-${'1'.repeat(64)}`]
    for (const name of ['first', 'second'])
      for (const version of versions) writeTree(join(root, 'gones', name, version), FILES)
    const { deferred, discarded } = await packages.recover()
    expect(discarded).toBe(0)
    expect(deferred).toHaveLength(2)
    expect(deferred).toEqual(expect.arrayContaining([id('gone', 'first'), id('gone', 'second')]))
    expect(readdirSync(join(root, 'gones', 'first')).sort()).toEqual(versions)
  })

  it('keeps a recorded version directory and a directory whose name is no version', async () => {
    const { root, packages } = setup({ records: { readVersionRecord: async () => recordOf() } })
    mkdirSync(join(root, 'bundles'), { recursive: true })
    writeFileSync(join(root, 'bundles', '.category'), 'bundle')
    writeTree(placeOf(root), FILES)
    writeTree(join(root, 'bundles', 'report', 'loose'), FILES)
    expect(await packages.recover()).toEqual({ discarded: 0, deferred: [], mismatched: [report] })
    expect(existsSync(placeOf(root))).toBe(true)
    expect(existsSync(join(root, 'bundles', 'report', 'loose'))).toBe(true)
  })

  it('reports each mismatched identity once and skips what it cannot name', async () => {
    const { root, packages } = setup({ records: { readVersionRecord: async () => recordOf() } })
    mkdirSync(join(root, 'bundles'), { recursive: true })
    writeFileSync(join(root, 'bundles', '.category'), 'bundle')
    writeTree(join(root, 'bundles', 'report', 'sha256-0'), { a: '1' })
    writeTree(join(root, 'bundles', 'report', 'sha256-1'), { a: '2' })
    writeTree(join(root, 'bundles', 'other', 'sha256-0'), { a: '1' })
    writeTree(join(root, 'loose', 'report', 'sha256-0'), { a: '1' })
    mkdirSync(join(root, 'blank'), { recursive: true })
    writeFileSync(join(root, 'blank', '.category'), '')
    writeTree(join(root, 'blank', 'report', 'sha256-0'), { a: '1' })
    const { mismatched } = await packages.recover()
    expect(mismatched).toHaveLength(2)
    expect(mismatched).toEqual(expect.arrayContaining([report, id('bundle', 'other')]))
  })

  it('throws when the stagings cannot be listed, and keeps them', async () => {
    const { root, packages } = setup()
    writeTree(join(root, '.staging', 'one', 'files'), FILES)
    chmodSync(join(root, '.staging'), 0o000)
    try {
      await expect(packages.recover()).rejects.toThrow()
    } finally {
      chmodSync(join(root, '.staging'), 0o755)
    }
    expect(stagingOf(root)).toEqual(['one'])
  })

  it('throws when the versions of a name cannot be listed', async () => {
    const { root, packages } = setup()
    const name = join(root, 'bundles', 'report')
    mkdirSync(name, { recursive: true })
    writeFileSync(join(root, 'bundles', '.category'), 'bundle')
    chmodSync(name, 0o000)
    try {
      await expect(packages.recover()).rejects.toThrow()
    } finally {
      chmodSync(name, 0o755)
    }
  })
})
