import { existsSync, type Dirent } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  capabilityId,
  digestBytes,
  packageDigest,
  pinBody,
  readBodyText,
  type CapabilityId,
  type CategoryRegistry,
  type JsonValue,
  type PackageLayout,
  type PackageManifest,
  type PackageManifestEntry,
  type PackageReader,
  type PackageRejection,
  type PackageSourceFailure,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { digest } from './encoding.ts'
import type { AssetsMutationResult, AssetsOperationResult, AssetsPublish } from './types.ts'

export type PackageStep = 'staged' | 'recorded'

export type PackageDurability = Readonly<{
  file(path: string, bytes: Uint8Array | string): Promise<void>
  directory(path: string): Promise<void>
}>

export const nodeDurability: PackageDurability = Object.freeze({
  async file(path: string, bytes: Uint8Array | string) {
    const handle = await open(path, 'w')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
  async directory(path: string) {
    if (process.platform === 'win32') return
    const handle = await open(path, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
})

export type PackagePublishResult =
  | Readonly<{ kind: 'published'; version: string; changed: boolean }>
  | Readonly<{ kind: 'rejected'; rejection: PackageRejection }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unknown'; operationId: string }>

export type PackageRecovery = Readonly<{
  completed: number
  discarded: number
  mismatched: readonly CapabilityId[]
}>

export interface PublishedPackages {
  publish(input: {
    capability: CapabilityId
    assetRef: string
    from: PackageReader
    operationId: string
  }): Promise<PackagePublishResult>
  reader(input: { assetRef: string; version: string }): PackageReader
  recover(): Promise<PackageRecovery>
}

export type PackageLocation =
  | Readonly<{ kind: 'local-directory'; path: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

export interface LocalPackages extends PublishedPackages {
  locate(input: { assetRef: string; version: string }): Promise<PackageLocation>
}

type VersionRecord = Readonly<{ category: string; name: string; body: JsonValue }>

export type PackageRecords = Readonly<{
  publish(input: AssetsPublish): Promise<AssetsMutationResult>
  getOperation(operationId: string): Promise<AssetsOperationResult>
  readAssetRevision(assetRef: string): Promise<Outcome<number, string>>
  readVersionRecord(
    assetRef: string,
    version: string,
  ): Promise<Outcome<VersionRecord | undefined, string>>
}>

export function versionDirectoryName(version: string): string {
  return version.replaceAll(':', '-')
}

const CATEGORY_FILE = '.category'

const STAGING = '.staging'
const SOURCE = 'published-package'
const BODY_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  maxItems: 50_000,
  maxMembers: 1024,
  maxStringLength: 65_536,
  maxNumberLength: 32,
})

const rejected = (rejection: PackageRejection): PackagePublishResult => ({
  kind: 'rejected',
  rejection,
})

function isSafePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function pathRejection(manifest: PackageManifest): PackageRejection | undefined {
  const paths = new Set<string>()
  for (const entry of manifest.entries) {
    if (!isSafePath(entry.path) || paths.has(entry.path))
      return { kind: 'invalid-package', reason: 'manifest-path' }
    paths.add(entry.path)
  }
  for (const path of paths) {
    const segments = path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1)
      if (paths.has(segments.slice(0, depth).join('/')))
        return { kind: 'invalid-package', reason: 'manifest-path' }
  }
  return undefined
}

function limitRejection(
  manifest: PackageManifest,
  limits: PackageLayout['limits'],
): PackageRejection | undefined {
  if (manifest.entries.length > limits.files) return { kind: 'limit-exceeded', limit: 'files' }
  if (manifest.entries.some(entry => entry.bytes > limits.fileBytes))
    return { kind: 'limit-exceeded', limit: 'fileBytes' }
  const total = manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0)
  if (total > limits.totalBytes) return { kind: 'limit-exceeded', limit: 'totalBytes' }
  return undefined
}

const text = (value: string): JsonValue => ({ kind: 'string', value })

function manifestTree(manifest: PackageManifest): JsonValue {
  return {
    kind: 'object',
    entries: [
      {
        key: 'entries',
        value: {
          kind: 'array',
          items: manifest.entries.map(entry => ({
            kind: 'object',
            entries: [
              { key: 'path', value: text(entry.path) },
              { key: 'bytes', value: { kind: 'number', lexeme: String(entry.bytes) } },
              { key: 'digest', value: text(entry.digest) },
            ],
          })),
        },
      },
    ],
  }
}

function field(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function manifestOf(body: JsonValue): PackageManifest | undefined {
  const items = field(field(body, 'manifest'), 'entries')
  if (items?.kind !== 'array') return undefined
  const entries = items.items.map(entryOf)
  return entries.every(entry => entry !== undefined) ? { entries } : undefined
}

function entryOf(item: JsonValue): PackageManifestEntry | undefined {
  const path = field(item, 'path')
  const bytes = field(item, 'bytes')
  const entryDigest = field(item, 'digest')
  if (path?.kind !== 'string' || bytes?.kind !== 'number' || entryDigest?.kind !== 'string')
    return undefined
  return { path: path.value, bytes: Number(bytes.lexeme), digest: entryDigest.value }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return false
    throw error
  }
}

type StagingMeta = Readonly<{ category: string; name: string; assetRef: string; version: string }>

type Staged = Readonly<{ dir: string; meta?: StagingMeta }>

type PublishRequest = Parameters<PublishedPackages['publish']>[0]

type Place = Readonly<{ manifest: PackageManifest; final: string }>

type Prepared = Readonly<{
  root: string
  staging: string
  manifest: PackageManifest
  version: string
  body: JsonValue
  meta: StagingMeta
  final: string
}>

type Shared = Readonly<{
  root: string | undefined
  categories: CategoryRegistry
  records: PackageRecords
}>

type PackageDisk = Readonly<{
  stage(
    staging: string,
    manifest: PackageManifest,
    from: PackageReader,
    meta: StagingMeta,
  ): Promise<PackageSourceFailure | undefined>
  swap(staging: string, final: string, category: string): Promise<void>
}>

function recordBody(
  declaration: JsonValue,
  manifest: PackageManifest,
): Outcome<JsonValue, PackageRejection> {
  if (declaration.kind !== 'object' || field(declaration, 'manifest') !== undefined)
    return fail({ kind: 'invalid-package', reason: 'declaration-shape' })
  const body = readBodyText(
    writeJsonText({
      kind: 'object',
      entries: [...declaration.entries, { key: 'manifest', value: manifestTree(manifest) }],
    }),
    BODY_LIMITS,
  )
  return body.kind === 'ok'
    ? succeed(body.value)
    : fail({ kind: 'record-rejected', reason: 'limit_exceeded' })
}

function finalOf(root: string, layout: PackageLayout, name: string, version: string): string {
  return join(root, layout.namespace, name, versionDirectoryName(version))
}

function recordRejected(reason: string): PackagePublishResult {
  return reason === 'revision_conflict' || reason === 'version_conflict'
    ? { kind: 'conflict' }
    : rejected({ kind: 'record-rejected', reason })
}

async function stagingsIn(root: string): Promise<Staged[]> {
  let names: string[]
  try {
    names = await readdir(join(root, STAGING))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  return Promise.all(
    names.map(async name => {
      const dir = join(root, STAGING, name)
      try {
        const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as StagingMeta
        return { dir, meta }
      } catch {
        return { dir }
      }
    }),
  )
}

function packageDisk(durability: PackageDurability): PackageDisk {
  return {
    async stage(staging, manifest, from, meta) {
      const files = join(staging, 'files')
      await mkdir(files, { recursive: true })
      const directories = new Set([files, staging, dirname(staging)])
      for (const entry of manifest.entries) {
        const opened = await from.open(entry.path, entry.digest)
        if (!('ok' in opened)) return opened.failure
        if (opened.ok.length !== entry.bytes || digestBytes(opened.ok) !== entry.digest)
          return 'material-unavailable'
        const target = join(files, entry.path)
        await mkdir(dirname(target), { recursive: true })
        for (let dir = dirname(target); dir !== files; dir = dirname(dir)) directories.add(dir)
        await durability.file(target, opened.ok)
      }
      await durability.file(join(staging, 'meta.json'), JSON.stringify(meta))
      for (const directory of [...directories].sort((a, b) => b.length - a.length))
        await durability.directory(directory)
      return undefined
    },
    async swap(staging, final, category) {
      const place = dirname(final)
      const namespace = dirname(place)
      await mkdir(place, { recursive: true })
      const named = join(namespace, CATEGORY_FILE)
      if (!existsSync(named)) await durability.file(named, category)
      try {
        await rename(join(staging, 'files'), final)
      } catch (error) {
        if (!(await isDirectory(final))) throw error
      }
      for (const directory of [place, namespace, dirname(namespace)])
        await durability.directory(directory)
      await rm(staging, { recursive: true, force: true })
    },
  }
}

function packagePublisher(
  shared: Shared,
  disk: PackageDisk,
  afterStep: ((step: PackageStep) => void | Promise<void>) | undefined,
): (request: PublishRequest) => Promise<PackagePublishResult> {
  const { root, categories, records } = shared

  async function validate(request: PublishRequest): Promise<Outcome<Prepared, PackageRejection>> {
    const { capability, from } = request
    if (root === undefined) return fail({ kind: 'not-configured' })
    const contract = categories.lookup(capability.category)
    if (contract === undefined) return fail({ kind: 'unknown-category' })
    const layout = contract.layout
    if (layout === undefined) return fail({ kind: 'not-a-directory-category' })
    const listed = await from.manifest()
    if (!('ok' in listed)) return fail({ kind: 'source-failed', failure: listed.failure })
    const manifest = listed.ok
    const invalid = pathRejection(manifest) ?? limitRejection(manifest, layout.limits)
    if (invalid !== undefined) return fail(invalid)
    const inspected = await layout.inspect(from)
    if (!('ok' in inspected)) return inspected
    const body = recordBody(inspected.ok, manifest)
    if (!('ok' in body)) return body
    const version = packageDigest(manifest.entries)
    const judged = contract.judge(body.ok, { capabilityName: capability.name, definition: version })
    if (!judged.ok) return fail({ kind: 'invalid-package', reason: judged.rejected })
    const { name, category } = capability
    return succeed({
      root,
      staging: join(root, STAGING, digest(request.operationId)),
      manifest,
      version,
      body: body.ok,
      meta: { category, name, assetRef: request.assetRef, version },
      final: finalOf(root, layout, name, version),
    })
  }

  async function completeSwap(prepared: Prepared): Promise<void> {
    const { meta, final } = prepared
    if (await isDirectory(final)) return
    const staged = (await stagingsIn(prepared.root)).find(
      one =>
        one.meta?.category === meta.category &&
        one.meta.name === meta.name &&
        one.meta.version === meta.version,
    )
    if (staged === undefined) throw new Error('a recorded version has neither files nor staging')
    await disk.swap(staged.dir, final, meta.category)
  }

  async function settledBefore(
    prepared: Prepared,
    operationId: string,
  ): Promise<PackagePublishResult | undefined> {
    const { meta, version } = prepared
    const receipt = await records.getOperation(operationId)
    if (receipt.kind === 'committed') {
      await completeSwap(prepared)
      return { kind: 'published', version, changed: receipt.changed }
    }
    if (receipt.kind === 'unknown') return { kind: 'unknown', operationId }
    if (receipt.kind === 'rejected') return recordRejected(receipt.reason)
    const existing = await records.readVersionRecord(meta.assetRef, version)
    if (!('ok' in existing)) return rejected({ kind: 'record-rejected', reason: existing.failure })
    if (existing.ok === undefined) return undefined
    await completeSwap(prepared)
    return { kind: 'published', version, changed: false }
  }

  async function stageRecordSwap(
    prepared: Prepared,
    request: PublishRequest,
  ): Promise<PackagePublishResult> {
    const { capability, assetRef, from, operationId } = request
    const { staging, manifest, version, body, meta, final } = prepared
    await rm(staging, { recursive: true, force: true })
    const revision = await records.readAssetRevision(assetRef)
    if (!('ok' in revision)) return rejected({ kind: 'record-rejected', reason: revision.failure })
    const failure = await disk.stage(staging, manifest, from, meta)
    if (failure !== undefined) {
      await rm(staging, { recursive: true, force: true })
      return rejected({ kind: 'source-failed', failure })
    }
    await afterStep?.('staged')
    const recorded = await records.publish({
      operationId,
      assetRef,
      expectedRevision: revision.ok,
      pinned: pinBody({ identity: capability, version, source: SOURCE, body }),
    })
    if (recorded.kind === 'unknown') return { kind: 'unknown', operationId }
    if (recorded.kind === 'rejected') {
      await rm(staging, { recursive: true, force: true })
      return recordRejected(recorded.reason)
    }
    await afterStep?.('recorded')
    await disk.swap(staging, final, capability.category)
    return { kind: 'published', version, changed: recorded.changed }
  }

  return async request => {
    const prepared = await validate(request)
    if (!('ok' in prepared)) return rejected(prepared.failure)
    return (
      (await settledBefore(prepared.ok, request.operationId)) ??
      stageRecordSwap(prepared.ok, request)
    )
  }
}

async function placeOf(
  shared: Shared,
  assetRef: string,
  version: string,
): Promise<Outcome<Place, PackageSourceFailure>> {
  const { root, categories, records } = shared
  if (root === undefined) return fail('unavailable')
  const record = await records.readVersionRecord(assetRef, version)
  if (!('ok' in record)) return fail('unavailable')
  if (record.ok === undefined) return fail('package-not-found')
  const layout = categories.lookup(record.ok.category)?.layout
  const manifest = manifestOf(record.ok.body)
  if (layout === undefined || manifest === undefined) return fail('package-not-found')
  return succeed({ manifest, final: finalOf(root, layout, record.ok.name, version) })
}

function packageReader(
  shared: Shared,
  request: { assetRef: string; version: string },
): PackageReader {
  const { assetRef, version } = request
  let found: Place | undefined
  async function located(): Promise<Outcome<Place, PackageSourceFailure>> {
    try {
      if (found === undefined) {
        const placed = await placeOf(shared, assetRef, version)
        if (!('ok' in placed)) return placed
        found = placed.ok
      }
      return (await isDirectory(found.final)) ? succeed(found) : fail('material-unavailable')
    } catch {
      return fail('unavailable')
    }
  }
  return {
    async manifest() {
      const place = await located()
      return 'ok' in place ? succeed(place.ok.manifest) : place
    },
    async open(path, expected) {
      const place = await located()
      if (!('ok' in place)) return place
      const entry = place.ok.manifest.entries.find(
        one => one.path === path && one.digest === expected,
      )
      if (entry === undefined) return fail('entry-not-found')
      let bytes: Uint8Array
      try {
        const read = await readFile(join(place.ok.final, entry.path))
        bytes = new Uint8Array(read.buffer, read.byteOffset, read.byteLength)
      } catch {
        return fail('material-unavailable')
      }
      return digestBytes(bytes) === expected ? succeed(bytes) : fail('material-unavailable')
    },
  }
}

async function locatePackage(
  shared: Shared,
  request: { assetRef: string; version: string },
): Promise<PackageLocation> {
  if (shared.root === undefined) return { kind: 'absent' }
  try {
    const placed = await placeOf(shared, request.assetRef, request.version)
    if (!('ok' in placed))
      return placed.failure === 'unavailable' ? { kind: 'unavailable' } : { kind: 'absent' }
    return (await isDirectory(placed.ok.final))
      ? { kind: 'local-directory', path: placed.ok.final }
      : { kind: 'absent' }
  } catch {
    return { kind: 'unavailable' }
  }
}

function packageRecovery(shared: Shared, disk: PackageDisk): () => Promise<PackageRecovery> {
  const { root, categories, records } = shared

  async function settle(root: string, staged: Staged): Promise<'completed' | 'discarded'> {
    const { meta } = staged
    const layout = meta === undefined ? undefined : categories.lookup(meta.category)?.layout
    if (meta !== undefined && layout !== undefined) {
      const recorded = await records.readVersionRecord(meta.assetRef, meta.version)
      if (!('ok' in recorded)) throw new Error(recorded.failure)
      const final = finalOf(root, layout, meta.name, meta.version)
      if (recorded.ok !== undefined && !(await isDirectory(final))) {
        await disk.swap(staged.dir, final, meta.category)
        return 'completed'
      }
    }
    await rm(staged.dir, { recursive: true, force: true })
    return 'discarded'
  }

  return async () => {
    if (root === undefined) return { completed: 0, discarded: 0, mismatched: [] }
    let completed = 0
    let discarded = 0
    for (const staged of await stagingsIn(root)) {
      if ((await settle(root, staged)) === 'completed') completed += 1
      else discarded += 1
    }
    return { completed, discarded, mismatched: await mismatchedIn(root) }
  }
}

async function mismatchedIn(root: string): Promise<CapabilityId[]> {
  const found = new Map<string, CapabilityId>()
  for (const namespace of await directoriesIn(root)) {
    let category: string
    try {
      category = await readFile(join(root, namespace, CATEGORY_FILE), 'utf8')
    } catch {
      continue
    }
    for (const name of await directoriesIn(join(root, namespace)))
      for (const version of await directoriesIn(join(root, namespace, name))) {
        const dir = join(root, namespace, name, version)
        if (versionDirectoryName(packageDigest(await entriesIn(dir, ''))) === version) continue
        const id = capabilityId(category, name)
        if (id.ok) found.set(`${category}\0${name}`, id.id)
      }
  }
  return [...found.values()]
}

export function createPublishedPackages(input: {
  root: string | undefined
  categories: CategoryRegistry
  records: PackageRecords
  afterStep?: ((step: PackageStep) => void | Promise<void>) | undefined
  durability?: PackageDurability | undefined
}): LocalPackages {
  const shared: Shared = { root: input.root, categories: input.categories, records: input.records }
  const disk = packageDisk(input.durability ?? nodeDurability)
  const publish = packagePublisher(shared, disk, input.afterStep)
  return {
    async publish(request) {
      try {
        return await publish(request)
      } catch {
        return { kind: 'unknown', operationId: request.operationId }
      }
    },
    reader: request => packageReader(shared, request),
    recover: packageRecovery(shared, disk),
    locate: request => locatePackage(shared, request),
  }
}

async function directoriesIn(dir: string): Promise<string[]> {
  let items: Dirent[]
  try {
    items = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  return items
    .filter(item => item.isDirectory() && !item.name.startsWith('.'))
    .map(item => item.name)
}

async function entriesIn(dir: string, prefix: string): Promise<{ path: string; digest: string }[]> {
  const entries: { path: string; digest: string }[] = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = prefix === '' ? item.name : `${prefix}/${item.name}`
    if (item.isDirectory()) entries.push(...(await entriesIn(join(dir, item.name), path)))
    else entries.push({ path, digest: digestBytes(await readFile(join(dir, item.name))) })
  }
  return entries
}
