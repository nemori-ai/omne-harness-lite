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
  type CategoryView,
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
import type { AssetsMutationResult, AssetsPublishAndHold } from './types.ts'

export type PackageStep = 'staged' | 'swapped'

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
  discarded: number
  deferred: readonly CapabilityId[]
  mismatched: readonly CapabilityId[]
}>

export type PackageHolding = Omit<AssetsPublishAndHold['holding'], 'scopeRef'>

export interface PublishedPackages {
  publish(input: {
    capability: CapabilityId
    from: PackageReader
    operationId: string
    holding: PackageHolding
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
  publishAndHold(input: AssetsPublishAndHold): Promise<AssetsMutationResult>
  readAssetRevision(assetRef: string): Promise<Outcome<number, string>>
  readVersionRecord(
    assetRef: string,
    version: string,
  ): Promise<Outcome<VersionRecord | undefined, string>>
}>

export function versionDirectoryName(version: string): string {
  return version.replaceAll(':', '-')
}

const VERSION_DIRECTORY = /^sha256-([0-9a-f]{64})$/

function versionOfDirectory(name: string): string | undefined {
  const hex = VERSION_DIRECTORY.exec(name)?.[1]
  return hex === undefined ? undefined : `sha256:${hex}`
}

export function publishedAssetRef(capability: CapabilityId): string {
  return `${capability.category}/${capability.name}`
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

export function manifestOf(body: JsonValue): PackageManifest | undefined {
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

type PublishRequest = Parameters<PublishedPackages['publish']>[0]

type Place = Readonly<{ manifest: PackageManifest; final: string }>

type Prepared = Readonly<{
  staging: string
  manifest: PackageManifest
  version: string
  body: JsonValue
  final: string
}>

type Shared = Readonly<{
  root: string | undefined
  holdingScope: string
  categories: Pick<CategoryView, 'lookup'>
  records: PackageRecords
}>

type PackageDisk = Readonly<{
  stage(
    staging: string,
    manifest: PackageManifest,
    from: PackageReader,
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

async function discardStagings(root: string): Promise<number> {
  let names: string[]
  try {
    names = await readdir(join(root, STAGING))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 0
    throw error
  }
  for (const name of names) await rm(join(root, STAGING, name), { recursive: true, force: true })
  return names.length
}

function packageDisk(durability: PackageDurability): PackageDisk {
  return {
    async stage(staging, manifest, from) {
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
  const { root, holdingScope, categories, records } = shared

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
    return succeed({
      staging: join(root, STAGING, digest(request.operationId)),
      manifest,
      version,
      body: body.ok,
      final: finalOf(root, layout, capability.name, version),
    })
  }

  async function swapIn(
    prepared: Prepared,
    request: PublishRequest,
  ): Promise<PackagePublishResult | undefined> {
    const { staging, manifest, final } = prepared
    if (await isDirectory(final)) return undefined
    await rm(staging, { recursive: true, force: true })
    const failure = await disk.stage(staging, manifest, request.from)
    if (failure !== undefined) {
      await rm(staging, { recursive: true, force: true })
      return rejected({ kind: 'source-failed', failure })
    }
    await afterStep?.('staged')
    await disk.swap(staging, final, request.capability.category)
    await afterStep?.('swapped')
    return undefined
  }

  return async request => {
    const prepared = await validate(request)
    if (!('ok' in prepared)) return rejected(prepared.failure)
    const { capability, operationId } = request
    const ref = publishedAssetRef(capability)
    const revision = await records.readAssetRevision(ref)
    if (!('ok' in revision)) return rejected({ kind: 'record-rejected', reason: revision.failure })
    const failed = await swapIn(prepared.ok, request)
    if (failed !== undefined) return failed
    const { version, body } = prepared.ok
    const recorded = await records.publishAndHold({
      operationId,
      assetRef: ref,
      expectedRevision: revision.ok,
      pinned: pinBody({ identity: capability, version, source: SOURCE, body }),
      holding: { scopeRef: holdingScope, ...request.holding },
    })
    if (recorded.kind === 'unknown') return { kind: 'unknown', operationId }
    if (recorded.kind === 'rejected') return recordRejected(recorded.reason)
    return { kind: 'published', version, changed: recorded.changed }
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
  const contract = categories.lookup(record.ok.category)
  if (contract === undefined) return fail('unavailable')
  const layout = contract.layout
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

function packageRecovery(shared: Shared): () => Promise<PackageRecovery> {
  const { root, categories, records } = shared

  async function unrecorded(category: string, name: string, dir: string) {
    const version = versionOfDirectory(dir)
    const id = capabilityId(category, name)
    if (version === undefined || !id.ok) return undefined
    const record = await records.readVersionRecord(publishedAssetRef(id.id), version)
    if (!('ok' in record)) throw new Error(record.failure)
    return record.ok === undefined ? id.id : undefined
  }

  return async () => {
    if (root === undefined) return { discarded: 0, deferred: [], mismatched: [] }
    let discarded = await discardStagings(root)
    const deferred = new Map<string, CapabilityId>()
    for (const namespace of await directoriesIn(root)) {
      const category = await categoryOf(root, namespace)
      if (category === undefined) continue
      const present = categories.lookup(category) !== undefined
      for (const name of await directoriesIn(join(root, namespace)))
        for (const dir of await directoriesIn(join(root, namespace, name))) {
          const id = await unrecorded(category, name, dir)
          if (id === undefined) continue
          if (!present) deferred.set(`${category}\0${name}`, id)
          else {
            await rm(join(root, namespace, name, dir), { recursive: true, force: true })
            discarded += 1
          }
        }
    }
    return { discarded, deferred: [...deferred.values()], mismatched: await mismatchedIn(root) }
  }
}

async function categoryOf(root: string, namespace: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, namespace, CATEGORY_FILE), 'utf8')
  } catch {
    return undefined
  }
}

async function mismatchedIn(root: string): Promise<CapabilityId[]> {
  const found = new Map<string, CapabilityId>()
  for (const namespace of await directoriesIn(root)) {
    const category = await categoryOf(root, namespace)
    if (category === undefined) continue
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
  holdingScope: string
  categories: Pick<CategoryView, 'lookup'>
  records: PackageRecords
  afterStep?: ((step: PackageStep) => void | Promise<void>) | undefined
  durability?: PackageDurability | undefined
}): LocalPackages {
  const { root, holdingScope, categories, records } = input
  const shared: Shared = { root, holdingScope, categories, records }
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
    recover: packageRecovery(shared),
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
