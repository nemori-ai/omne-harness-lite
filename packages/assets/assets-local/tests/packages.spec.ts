// Published packages: one case for each cell of the totalized table of the publish flow
// (publish, read and the recovery scan against none, published, staging only, recorded but not
// swapped in), the two crash points, two publishes at once, and the rejections.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryRegistry,
  digestBytes,
  packageDigest,
  type CapabilityId,
  type PackageReader,
} from '@omne-harness/assets'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { ownerSources } from './sources.ts'
import { grants, openWorld, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const encoder = new TextEncoder()

/** A category whose body is a directory: at most 3 files, 16 bytes each, 32 bytes together. */
function bundles() {
  const registry = createCategoryRegistry()
  registry.register({
    category: 'bundle',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    layout: {
      namespace: 'bundles',
      limits: { files: 3, fileBytes: 16, totalBytes: 32 },
      async inspect(pkg) {
        const manifest = await pkg.manifest()
        if (!('ok' in manifest))
          return { failure: { kind: 'source-failed', failure: manifest.failure } }
        if (manifest.ok.entries.some(entry => entry.path === 'BAD'))
          return { failure: { kind: 'invalid-package', reason: 'bad-file' } }
        return {
          ok: {
            kind: 'object',
            entries: [
              {
                key: 'files',
                value: { kind: 'number', lexeme: String(manifest.ok.entries.length) },
              },
            ],
          },
        }
      },
    },
  })
  registry.register({
    category: 'plain',
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  })
  return registry
}

/** A reader over files in memory. */
function memory(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(Object.entries(files).map(([path, text]) => [path, encoder.encode(text)]))
  return {
    async manifest() {
      return {
        ok: {
          entries: [...bytes].map(([path, content]) => ({
            path,
            bytes: content.length,
            digest: digestBytes(content),
          })),
        },
      }
    },
    async open(path, expected) {
      const content = bytes.get(path)
      if (content === undefined || digestBytes(content) !== expected)
        return { failure: 'entry-not-found' }
      return { ok: content }
    },
  }
}

function versionOf(files: Readonly<Record<string, string>>): string {
  return packageDigest(
    Object.entries(files).map(([path, text]) => ({
      path,
      digest: digestBytes(encoder.encode(text)),
    })),
  )
}

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('invalid identity')
  return made.id
}

const report = id('bundle', 'report')
const FIRST = { 'SKILL.md': 'first', 'scripts/run.sh': 'echo 1' }
const SECOND = { 'SKILL.md': 'second', 'scripts/run.sh': 'echo 2' }

class Crash extends Error {}

type Step = 'staged' | 'recorded'

async function world(
  options: {
    afterPackageStep?: (step: Step) => void | Promise<void>
    ownerWrap?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'assets-packages-')))
  const opened = await openWorld({ categories: bundles(), packageRoot, ...options })
  worlds.push(opened)
  return { ...opened, packageRoot }
}

/** A world that crashes once, at the `nth` time it passes `step`, then runs on. */
async function crashingWorld(step: Step, nth = 1) {
  let seen = 0
  return world({
    afterPackageStep(at) {
      if (at === step && ++seen === nth) throw new Crash(step)
    },
  })
}

const publish = (w: World, files: Readonly<Record<string, string>>, operationId: string) =>
  w.owner.packages.publish({
    capability: report,
    assetRef: 'tenant/report',
    from: memory(files),
    operationId,
  })

function stagingOf(root: string): string[] {
  const dir = join(root, '.staging')
  return existsSync(dir) ? readdirSync(dir) : []
}

function placed(root: string, version: string): string {
  return join(root, 'bundles', 'report', version.replace(':', '-'))
}

async function readAll(w: World, version: string) {
  const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version })
  const manifest = await reader.manifest()
  if (!('ok' in manifest)) return manifest
  const files: Record<string, string> = {}
  for (const entry of manifest.ok.entries) {
    const opened = await reader.open(entry.path, entry.digest)
    if (!('ok' in opened)) return opened
    files[entry.path] = new TextDecoder().decode(opened.ok)
  }
  return { ok: files }
}

describe('publish: the cells of the totalized table', () => {
  it('发布 × 没有：校验不过拒绝且什么都不变；校验过则暂存、记版本、换入', async () => {
    const w = await world()
    const refused = await publish(w, { BAD: 'x' }, 'publish-bad')
    expect(refused).toEqual({
      kind: 'rejected',
      rejection: { kind: 'invalid-package', reason: 'bad-file' },
    })
    expect(readdirSync(w.packageRoot)).toEqual([])
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toEqual({ kind: 'absent' })

    const published = await publish(w, FIRST, 'publish-1')
    expect(published).toEqual({ kind: 'published', version: versionOf(FIRST), changed: true })
    expect(stagingOf(w.packageRoot)).toEqual([])
    expect(readFileSync(join(placed(w.packageRoot, versionOf(FIRST)), 'SKILL.md'), 'utf8')).toBe(
      'first',
    )
  })

  it('发布 × 已发布：同版本不写，答 changed: false；新版本照「没有」做', async () => {
    const w = await world()
    await publish(w, FIRST, 'publish-1')
    const before = await w.owner.readAsset({ assetRef: 'tenant/report' })
    expect(await publish(w, FIRST, 'publish-again')).toEqual({
      kind: 'published',
      version: versionOf(FIRST),
      changed: false,
    })
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toEqual(before)
    expect(await w.owner.getOperation('publish-again')).toEqual({ kind: 'not_found' })

    expect(await publish(w, SECOND, 'publish-2')).toEqual({
      kind: 'published',
      version: versionOf(SECOND),
      changed: true,
    })
    expect(await readAll(w, versionOf(SECOND))).toEqual({ ok: SECOND })
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
  })

  it('发布 × 只有暂存：清掉旧暂存，照「没有」做', async () => {
    const w = await crashingWorld('staged')
    const stale = { ...FIRST, 'stale.txt': 'old' }
    expect(await publish(w, stale, 'publish-1')).toEqual({
      kind: 'unknown',
      operationId: 'publish-1',
    })
    expect(stagingOf(w.packageRoot)).toHaveLength(1)
    expect(await publish(w, FIRST, 'publish-1')).toEqual({
      kind: 'published',
      version: versionOf(FIRST),
      changed: true,
    })
    expect(stagingOf(w.packageRoot)).toEqual([])
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
    expect(existsSync(join(placed(w.packageRoot, versionOf(FIRST)), 'stale.txt'))).toBe(false)
  })

  it('发布 × 记了没换：先把它换入完成，再做这次发布', async () => {
    const w = await crashingWorld('recorded')
    expect(await publish(w, FIRST, 'publish-1')).toEqual({
      kind: 'unknown',
      operationId: 'publish-1',
    })
    expect(existsSync(placed(w.packageRoot, versionOf(FIRST)))).toBe(false)
    expect(await publish(w, FIRST, 'publish-other')).toEqual({
      kind: 'published',
      version: versionOf(FIRST),
      changed: false,
    })
    expect(stagingOf(w.packageRoot)).toEqual([])
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
  })
})

describe('read: the cells of the totalized table', () => {
  it('读 × 没有：答包不存在', async () => {
    const w = await world()
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await reader.manifest()).toEqual({ failure: 'package-not-found' })
    expect(await reader.open('SKILL.md', digestBytes(encoder.encode('first')))).toEqual({
      failure: 'package-not-found',
    })
  })

  it('读 × 已发布：给内容；摘要对不上答材料不可用', async () => {
    const w = await world()
    await publish(w, FIRST, 'publish-1')
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
    writeFileSync(join(placed(w.packageRoot, versionOf(FIRST)), 'scripts/run.sh'), 'rm -rf /')
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await reader.open('scripts/run.sh', digestBytes(encoder.encode('echo 1')))).toEqual({
      failure: 'material-unavailable',
    })
    expect(await reader.open('SKILL.md', digestBytes(encoder.encode('first')))).toEqual({
      ok: encoder.encode('first'),
    })
  })

  it('读 × 只有暂存：暂存不可见，答包不存在', async () => {
    const w = await crashingWorld('staged')
    await publish(w, FIRST, 'publish-1')
    expect(stagingOf(w.packageRoot)).toHaveLength(1)
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await reader.manifest()).toEqual({ failure: 'package-not-found' })
  })

  it('读 × 记了没换：答材料不可用', async () => {
    const w = await crashingWorld('recorded')
    await publish(w, FIRST, 'publish-1')
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await reader.manifest()).toEqual({ failure: 'material-unavailable' })
    expect(await reader.open('SKILL.md', digestBytes(encoder.encode('first')))).toEqual({
      failure: 'material-unavailable',
    })
  })
})

describe('the recovery scan: the cells of the totalized table', () => {
  it('恢复扫描 × 没有：不动', async () => {
    const w = await world()
    expect(await w.owner.packages.recover()).toEqual({ completed: 0, discarded: 0, mismatched: [] })
    expect(readdirSync(w.packageRoot)).toEqual([])
  })

  it('恢复扫描 × 已发布：不动；正式位置摘要对不上的报告它，不动', async () => {
    const w = await world()
    await publish(w, FIRST, 'publish-1')
    expect(await w.owner.packages.recover()).toEqual({ completed: 0, discarded: 0, mismatched: [] })
    const changed = join(placed(w.packageRoot, versionOf(FIRST)), 'SKILL.md')
    writeFileSync(changed, 'tampered')
    expect(await w.owner.packages.recover()).toEqual({
      completed: 0,
      discarded: 0,
      mismatched: [report],
    })
    expect(readFileSync(changed, 'utf8')).toBe('tampered')
  })

  it('恢复扫描 × 只有暂存：删掉暂存', async () => {
    const w = await crashingWorld('staged')
    await publish(w, FIRST, 'publish-1')
    expect(await w.owner.packages.recover()).toEqual({ completed: 0, discarded: 1, mismatched: [] })
    expect(stagingOf(w.packageRoot)).toEqual([])
    expect(existsSync(placed(w.packageRoot, versionOf(FIRST)))).toBe(false)
  })

  it('恢复扫描 × 记了没换：把暂存换入', async () => {
    const w = await crashingWorld('recorded')
    await publish(w, FIRST, 'publish-1')
    expect(await w.owner.packages.recover()).toEqual({ completed: 1, discarded: 0, mismatched: [] })
    expect(stagingOf(w.packageRoot)).toEqual([])
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
  })
})

describe('a crash after a step, then the recovery scan: all old or all new', () => {
  it('崩在暂存之后：恢复扫描之后全旧', async () => {
    const w = await crashingWorld('staged', 2)
    await publish(w, FIRST, 'publish-1')
    expect(await publish(w, SECOND, 'publish-2')).toEqual({
      kind: 'unknown',
      operationId: 'publish-2',
    })
    expect(await w.owner.packages.recover()).toEqual({ completed: 0, discarded: 1, mismatched: [] })
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toMatchObject({
      kind: 'asset',
      asset: { latestVersion: versionOf(FIRST) },
    })
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
    expect(await readAll(w, versionOf(SECOND))).toEqual({ failure: 'package-not-found' })
    expect(existsSync(placed(w.packageRoot, versionOf(SECOND)))).toBe(false)
  })

  it('崩在记版本之后：恢复扫描之后全新', async () => {
    const w = await crashingWorld('recorded', 2)
    await publish(w, FIRST, 'publish-1')
    expect(await publish(w, SECOND, 'publish-2')).toEqual({
      kind: 'unknown',
      operationId: 'publish-2',
    })
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toMatchObject({
      kind: 'asset',
      asset: { latestVersion: versionOf(SECOND) },
    })
    expect(await w.owner.packages.recover()).toEqual({ completed: 1, discarded: 0, mismatched: [] })
    expect(await readAll(w, versionOf(SECOND))).toEqual({ ok: SECOND })
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
  })
})

describe('publishing a directory', () => {
  it('C4 版本号等于包的摘要，记录的正文是清单加投影的声明，字节在正式位置', async () => {
    const w = await world()
    const published = await publish(w, FIRST, 'publish-1')
    const version = versionOf(FIRST)
    expect(published).toEqual({ kind: 'published', version, changed: true })
    const record = await w.owner.readVersion({ assetRef: 'tenant/report', version })
    expect(record).toMatchObject({
      kind: 'version',
      version: { category: 'bundle', name: 'report', version },
    })
    if (record.kind !== 'version') throw new Error('no record')
    const entries = Object.entries(FIRST).map(([path, text]) => {
      const bytes = encoder.encode(text)
      return {
        kind: 'object',
        entries: [
          { key: 'path', value: { kind: 'string', value: path } },
          { key: 'bytes', value: { kind: 'number', lexeme: String(bytes.length) } },
          { key: 'digest', value: { kind: 'string', value: digestBytes(bytes) } },
        ],
      }
    })
    expect(record.version.body).toEqual({
      kind: 'object',
      entries: [
        { key: 'files', value: { kind: 'number', lexeme: '2' } },
        {
          key: 'manifest',
          value: {
            kind: 'object',
            entries: [{ key: 'entries', value: { kind: 'array', items: entries } }],
          },
        },
      ],
    })
    for (const [path, text] of Object.entries(FIRST))
      expect(readFileSync(join(placed(w.packageRoot, version), path), 'utf8')).toBe(text)
    expect(await w.owner.packages.locate({ assetRef: 'tenant/report', version })).toEqual({
      kind: 'local-directory',
      path: placed(w.packageRoot, version),
    })
  })

  it('C4 同一个操作标识再发一次，不写，答复相同', async () => {
    const w = await world()
    const first = await publish(w, FIRST, 'publish-1')
    const asset = await w.owner.readAsset({ assetRef: 'tenant/report' })
    expect(await publish(w, FIRST, 'publish-1')).toEqual(first)
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toEqual(asset)
    expect(stagingOf(w.packageRoot)).toEqual([])
  })

  it('C5 manifest 给出清单；open 按路径与摘要给字节；清单之外的路径答条目不存在', async () => {
    const w = await world()
    await publish(w, FIRST, 'publish-1')
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    const manifest = await reader.manifest()
    expect(manifest).toEqual(await memory(FIRST).manifest())
    const digest = digestBytes(encoder.encode('first'))
    expect(await reader.open('SKILL.md', digest)).toEqual({ ok: encoder.encode('first') })
    expect(await reader.open('other.md', digest)).toEqual({ failure: 'entry-not-found' })
    expect(await reader.open('SKILL.md', digestBytes(encoder.encode('other')))).toEqual({
      failure: 'entry-not-found',
    })
    expect(await reader.open('../outside', digest)).toEqual({ failure: 'entry-not-found' })
  })

  it('C7 两次同名的发布同时来：一个 published，一个 conflict，后者的暂存被清掉', async () => {
    // Both publishes read the revision and stage before either one records its version.
    const bothStaged = Promise.withResolvers<void>()
    let staged = 0
    const w = await world({
      async afterPackageStep(step) {
        if (step !== 'staged') return
        staged += 1
        if (staged === 2) bothStaged.resolve()
        await bothStaged.promise
      },
    })
    const results = await Promise.all([
      publish(w, FIRST, 'publish-a'),
      publish(w, SECOND, 'publish-b'),
    ])
    expect(results.filter(result => result.kind === 'published')).toHaveLength(1)
    expect(results.filter(result => result.kind === 'conflict')).toHaveLength(1)
    expect(stagingOf(w.packageRoot)).toEqual([])
    const kept = results[0]?.kind === 'published' ? FIRST : SECOND
    const lost = kept === FIRST ? SECOND : FIRST
    expect(await readAll(w, versionOf(kept))).toEqual({ ok: kept })
    expect(existsSync(placed(w.packageRoot, versionOf(lost)))).toBe(false)
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toMatchObject({
      kind: 'asset',
      asset: { latestVersion: versionOf(kept), revision: 1 },
    })
  })
})

describe('reading by asset reference, and the directory names', () => {
  it('位置读口在版本记录读不到时答 unavailable，不答 absent，也不抛出', async () => {
    let failing = false
    const w = await world({
      ownerWrap: storage => ({
        ...storage,
        read(request, options) {
          if (failing && JSON.stringify(request.input).includes('"kind":"version"'))
            throw new Error('the storage does not answer')
          return storage.read(request, options)
        },
      }),
    })
    await publish(w, FIRST, 'publish-1')
    failing = true
    expect(
      await w.owner.packages.locate({ assetRef: 'tenant/report', version: versionOf(FIRST) }),
    ).toEqual({ kind: 'unavailable' })
    failing = false
    expect(
      await w.owner.packages.locate({ assetRef: 'tenant/report', version: versionOf(FIRST) }),
    ).toMatchObject({ kind: 'local-directory' })
  })

  it('一个读口对象里版本记录读一次：manifest 与几次 open 只读一次版本记录', async () => {
    let versionReads = 0
    const w = await world({
      ownerWrap: storage => ({
        ...storage,
        read(request, options) {
          if (JSON.stringify(request.input).includes('"kind":"version"')) versionReads += 1
          return storage.read(request, options)
        },
      }),
    })
    await publish(w, FIRST, 'publish-1')
    versionReads = 0
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await readAll(w, versionOf(FIRST))).toEqual({ ok: FIRST })
    versionReads = 0
    await reader.manifest()
    await reader.open('SKILL.md', digestBytes(encoder.encode('first')))
    await reader.open('scripts/run.sh', digestBytes(encoder.encode('echo 1')))
    expect(versionReads).toBe(1)
  })

  it('版本号落盘成目录名时没有 Windows 不认的字符，版本号本身不变', async () => {
    const w = await world()
    const published = await publish(w, FIRST, 'publish-1')
    expect(published).toMatchObject({ version: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) })
    const names = readdirSync(join(w.packageRoot, 'bundles', 'report'))
    expect(names).toEqual([versionOf(FIRST).replace('sha256:', 'sha256-')])
    for (const name of names) expect(name).not.toMatch(/[<>:"/\\|?*]/)
    const location = await w.owner.packages.locate({
      assetRef: 'tenant/report',
      version: versionOf(FIRST),
    })
    expect(location).toEqual({
      kind: 'local-directory',
      path: placed(w.packageRoot, versionOf(FIRST)),
    })
  })
})

describe('C8 a directory that does not pass is rejected and nothing is written', () => {
  it.each([
    ['超过文件数', { a: '1', b: '2', c: '3', d: '4' }, { kind: 'limit-exceeded', limit: 'files' }],
    ['超过单文件大小', { a: 'x'.repeat(17) }, { kind: 'limit-exceeded', limit: 'fileBytes' }],
    [
      '超过整包大小',
      { a: 'x'.repeat(16), b: 'y'.repeat(16), c: 'z' },
      { kind: 'limit-exceeded', limit: 'totalBytes' },
    ],
    ['inspect 不过', { BAD: 'x' }, { kind: 'invalid-package', reason: 'bad-file' }],
  ])('%s', async (_case, files, rejection) => {
    const w = await world()
    expect(await publish(w, files, 'publish-1')).toEqual({ kind: 'rejected', rejection })
    expect(readdirSync(w.packageRoot)).toEqual([])
    expect(await w.owner.readAsset({ assetRef: 'tenant/report' })).toEqual({ kind: 'absent' })
  })

  it.each([
    ['类别没登记', id('nobody', 'report'), { kind: 'unknown-category' }],
    ['类别不是目录类别', id('plain', 'report'), { kind: 'not-a-directory-category' }],
  ])('%s', async (_case, capability, rejection) => {
    const w = await world()
    const result = await w.owner.packages.publish({
      capability,
      assetRef: 'tenant/report',
      from: memory(FIRST),
      operationId: 'publish-1',
    })
    expect(result).toEqual({ kind: 'rejected', rejection })
    expect(readdirSync(w.packageRoot)).toEqual([])
  })

  it('没有根目录时这几样不可用', async () => {
    const w = await openWorld({ categories: bundles() })
    worlds.push(w)
    expect(await publish(w, FIRST, 'publish-1')).toEqual({
      kind: 'rejected',
      rejection: { kind: 'not-configured' },
    })
    const reader = w.owner.packages.reader({ assetRef: 'tenant/report', version: versionOf(FIRST) })
    expect(await reader.manifest()).toEqual({ failure: 'unavailable' })
    expect(
      await w.owner.packages.locate({ assetRef: 'tenant/report', version: versionOf(FIRST) }),
    ).toEqual({
      kind: 'absent',
    })
  })
})

describe('readHeldCapability', () => {
  it('C8 按能力身份读到持有；没有时答没有', async () => {
    const w = await world()
    expect(await w.owner.readHeldCapability({ capability: report })).toEqual({ kind: 'absent' })
    await publish(w, FIRST, 'publish-1')
    expect(await w.owner.readHeldCapability({ capability: report })).toEqual({ kind: 'absent' })
    const held = await w.owner.hold({
      operationId: 'hold-1',
      holdingRef: 'holding-report',
      scopeRef: 'tenant-a',
      assetRef: 'tenant/report',
      selection: { kind: 'follow' },
      sources: ownerSources('tenant'),
      grants,
    })
    expect(held).toMatchObject({ kind: 'committed' })
    const read = await w.owner.readHeldCapability({ capability: report })
    expect(read).toEqual(
      await w.owner.readHolding({ holdingRef: 'holding-report', scopeRef: 'tenant-a' }),
    )
    expect(read).toMatchObject({
      kind: 'holding',
      holding: { holdingRef: 'holding-report', state: 'held' },
      selected: { version: versionOf(FIRST) },
    })
    expect(await w.owner.readHeldCapability({ capability: id('bundle', 'other') })).toEqual({
      kind: 'absent',
    })
  })
})
