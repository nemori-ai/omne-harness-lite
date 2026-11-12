// Published packages (SPEC「正文是目录的类别」 of @omne-harness/assets): the manifest and the
// projected declaration are the body of a version record, written by the existing `publish`; the
// bytes are files under the package root. Publishing is an ordered flow, not a transaction:
// stage, record the version, then swap the staging in. A crash between the record and the swap
// leaves the staging, and `recover` swaps it in.
import { existsSync, type Dirent } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
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
  type PackageReader,
  type PackageRejection,
  type PackageSourceFailure,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { digest } from './encoding.ts'
import type { AssetsMutationResult, AssetsOperationResult, AssetsPublish } from './types.ts'

export type PackageStep = 'staged' | 'recorded'

export type PackagePublishResult =
  | Readonly<{ kind: 'published'; version: string; changed: boolean }>
  | Readonly<{ kind: 'rejected'; rejection: PackageRejection }>
  /** The version record was not written: another publish of the same asset came first. */
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unknown'; operationId: string }>

export type PackageRecovery = Readonly<{
  /** Recorded versions whose staging was swapped in. */
  completed: number
  /** Stagings without a record, or left over beside a version already in place. */
  discarded: number
  /** Identities whose files in place differ from their record. They stay as they are. */
  mismatched: readonly CapabilityId[]
}>

export interface PublishedPackages {
  /** Publishes a package. Idempotent by operation identifier. The version is the package digest. */
  publish(input: {
    capability: CapabilityId
    assetRef: string
    from: PackageReader
    operationId: string
  }): Promise<PackagePublishResult>
  /** The read port of one version of one asset. Each file read checks its digest. */
  reader(input: { assetRef: string; version: string }): PackageReader
  /** The recovery scan at start. */
  recover(): Promise<PackageRecovery>
}

/** The local directory of a published version: on this single machine only, not in the contract. */
export type PackageLocation =
  | Readonly<{ kind: 'local-directory'; path: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable' }>

export interface LocalPackages extends PublishedPackages {
  /** Reads the version record, so it answers later; a record that cannot be read is `unavailable`, never `absent`. */
  locate(input: { assetRef: string; version: string }): Promise<PackageLocation>
}

/** The identity and the body of one version record. */
type VersionRecord = Readonly<{ category: string; name: string; body: JsonValue }>

/** What the packages need of the records. */
export type PackageRecords = Readonly<{
  publish(input: AssetsPublish): Promise<AssetsMutationResult>
  getOperation(operationId: string): Promise<AssetsOperationResult>
  readAssetRevision(assetRef: string): Promise<Outcome<number, string>>
  /** One version record by asset reference and version, or `undefined` when it is absent. */
  readVersionRecord(
    assetRef: string,
    version: string,
  ): Promise<Outcome<VersionRecord | undefined, string>>
}>

/** The directory name of a version: a version is `sha256:<hex>`, and a colon is no lawful file
 * name on Windows, so it becomes `sha256-<hex>`. The version itself does not change. */
export function versionDirectoryName(version: string): string {
  return version.replaceAll(':', '-')
}

/** The file in each namespace directory that names its category, for the recovery scan. */
const CATEGORY_FILE = '.category'

const STAGING = '.staging'
const SOURCE = 'published-package'
/** The budget of reading back the body: the version record allows 1 MiB. */
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

/** A path that stays below the package root: no empty, `.` or `..` segment, no `\`, no NUL. */
function isSafePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function checkManifest(
  manifest: PackageManifest,
  limits: PackageLayout['limits'],
): PackageRejection | undefined {
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

/** The manifest of a version body, or `undefined` when the body holds none. */
function manifestOf(body: JsonValue): PackageManifest | undefined {
  const items = field(field(body, 'manifest'), 'entries')
  if (items?.kind !== 'array') return undefined
  const entries: { path: string; bytes: number; digest: string }[] = []
  for (const item of items.items) {
    const path = field(item, 'path')
    const bytes = field(item, 'bytes')
    const entryDigest = field(item, 'digest')
    if (path?.kind !== 'string' || bytes?.kind !== 'number' || entryDigest?.kind !== 'string')
      return undefined
    entries.push({ path: path.value, bytes: Number(bytes.lexeme), digest: entryDigest.value })
  }
  return { entries }
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

export function createPublishedPackages(input: {
  root: string | undefined
  categories: CategoryRegistry
  records: PackageRecords
  afterStep?: ((step: PackageStep) => void | Promise<void>) | undefined
}): LocalPackages {
  const { root, categories, records } = input

  function finalOf(root: string, layout: PackageLayout, name: string, version: string): string {
    return join(root, layout.namespace, name, versionDirectoryName(version))
  }
  function layoutOf(category: string): PackageLayout | undefined {
    return categories.lookup(category)?.layout
  }

  async function stagings(root: string): Promise<{ dir: string; meta?: StagingMeta }[]> {
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

  /** Moves the staged files to their place. Another swap of the same version may come first. The
   * namespace directory names its category first, so the recovery scan can name the identity. */
  async function swap(staging: string, final: string, category: string): Promise<void> {
    await mkdir(dirname(final), { recursive: true })
    const named = join(dirname(dirname(final)), CATEGORY_FILE)
    if (!existsSync(named)) await writeFile(named, category)
    try {
      await rename(join(staging, 'files'), final)
    } catch (error) {
      if (!(await isDirectory(final))) throw error
    }
    await rm(staging, { recursive: true, force: true })
  }

  /** The state「记了没换」: the record is there and the files are not. Its staging is there. */
  async function completeSwap(root: string, meta: StagingMeta, final: string): Promise<void> {
    if (await isDirectory(final)) return
    const staged = (await stagings(root)).find(
      one =>
        one.meta?.category === meta.category &&
        one.meta.name === meta.name &&
        one.meta.version === meta.version,
    )
    if (staged === undefined) throw new Error('a recorded version has neither files nor staging')
    await swap(staged.dir, final, meta.category)
  }

  /** Writes every file through the publisher's reader, then the meta file that marks it whole. */
  async function stage(
    staging: string,
    manifest: PackageManifest,
    from: PackageReader,
    meta: StagingMeta,
  ): Promise<PackageSourceFailure | undefined> {
    const files = join(staging, 'files')
    await mkdir(files, { recursive: true })
    for (const entry of manifest.entries) {
      const opened = await from.open(entry.path, entry.digest)
      if (!('ok' in opened)) return opened.failure
      if (opened.ok.length !== entry.bytes || digestBytes(opened.ok) !== entry.digest)
        return 'material-unavailable'
      const target = join(files, entry.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, opened.ok)
    }
    await writeFile(join(staging, 'meta.json'), JSON.stringify(meta))
    return undefined
  }

  async function publish(
    request: Parameters<PublishedPackages['publish']>[0],
  ): Promise<PackagePublishResult> {
    const { capability, assetRef, from, operationId } = request
    if (root === undefined) return rejected({ kind: 'not-configured' })
    const contract = categories.lookup(capability.category)
    if (contract === undefined) return rejected({ kind: 'unknown-category' })
    const layout = contract.layout
    if (layout === undefined) return rejected({ kind: 'not-a-directory-category' })
    const listed = await from.manifest()
    if (!('ok' in listed)) return rejected({ kind: 'source-failed', failure: listed.failure })
    const manifest = listed.ok
    const invalid = checkManifest(manifest, layout.limits)
    if (invalid !== undefined) return rejected(invalid)
    const inspected = await layout.inspect(from)
    if (!('ok' in inspected)) return rejected(inspected.failure)
    const declaration = inspected.ok
    if (declaration.kind !== 'object' || field(declaration, 'manifest') !== undefined)
      return rejected({ kind: 'invalid-package', reason: 'declaration-shape' })
    const version = packageDigest(manifest.entries)
    const body = readBodyText(
      writeJsonText({
        kind: 'object',
        entries: [...declaration.entries, { key: 'manifest', value: manifestTree(manifest) }],
      }),
      BODY_LIMITS,
    )
    if (body.kind !== 'ok') return rejected({ kind: 'record-rejected', reason: 'limit_exceeded' })
    const judged = contract.judge(body.value, {
      capabilityName: capability.name,
      definition: version,
    })
    if (!judged.ok) return rejected({ kind: 'invalid-package', reason: judged.rejected })
    const meta: StagingMeta = {
      category: capability.category,
      name: capability.name,
      assetRef,
      version,
    }
    const final = finalOf(root, layout, capability.name, version)

    const receipt = await records.getOperation(operationId)
    if (receipt.kind === 'committed') {
      await completeSwap(root, meta, final)
      return { kind: 'published', version, changed: receipt.changed }
    }
    if (receipt.kind === 'unknown') return { kind: 'unknown', operationId }
    if (receipt.kind === 'rejected') return recordRejected(receipt.reason)
    const existing = await records.readVersionRecord(assetRef, version)
    if (!('ok' in existing)) return rejected({ kind: 'record-rejected', reason: existing.failure })
    if (existing.ok !== undefined) {
      await completeSwap(root, meta, final)
      return { kind: 'published', version, changed: false }
    }

    const staging = join(root, STAGING, digest(operationId))
    await rm(staging, { recursive: true, force: true })
    const revision = await records.readAssetRevision(assetRef)
    if (!('ok' in revision)) return rejected({ kind: 'record-rejected', reason: revision.failure })
    const failure = await stage(staging, manifest, from, meta)
    if (failure !== undefined) {
      await rm(staging, { recursive: true, force: true })
      return rejected({ kind: 'source-failed', failure })
    }
    await input.afterStep?.('staged')
    const recorded = await records.publish({
      operationId,
      assetRef,
      expectedRevision: revision.ok,
      pinned: pinBody({ identity: capability, version, source: SOURCE, body: body.value }),
    })
    if (recorded.kind === 'unknown') return { kind: 'unknown', operationId }
    if (recorded.kind === 'rejected') {
      await rm(staging, { recursive: true, force: true })
      return recordRejected(recorded.reason)
    }
    await input.afterStep?.('recorded')
    await swap(staging, final, capability.category)
    return { kind: 'published', version, changed: recorded.changed }
  }

  function recordRejected(reason: string): PackagePublishResult {
    return reason === 'revision_conflict' || reason === 'version_conflict'
      ? { kind: 'conflict' }
      : rejected({ kind: 'record-rejected', reason })
  }

  /** The version record of one version of one asset: where its files are and its manifest. */
  async function placeOf(
    assetRef: string,
    version: string,
  ): Promise<Outcome<{ manifest: PackageManifest; final: string }, PackageSourceFailure>> {
    if (root === undefined) return fail('unavailable')
    const record = await records.readVersionRecord(assetRef, version)
    if (!('ok' in record)) return fail('unavailable')
    if (record.ok === undefined) return fail('package-not-found')
    const layout = layoutOf(record.ok.category)
    const manifest = manifestOf(record.ok.body)
    if (layout === undefined || manifest === undefined) return fail('package-not-found')
    return succeed({ manifest, final: finalOf(root, layout, record.ok.name, version) })
  }

  function reader(request: { assetRef: string; version: string }): PackageReader {
    const { assetRef, version } = request
    /** The record found once; a reader does not read it again. */
    let found: { manifest: PackageManifest; final: string } | undefined
    async function located(): Promise<
      Outcome<{ manifest: PackageManifest; final: string }, PackageSourceFailure>
    > {
      try {
        if (found === undefined) {
          const placed = await placeOf(assetRef, version)
          if (!('ok' in placed)) return placed
          found = placed.ok
        }
        // The files may still be swapped in; that is not cached.
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

  async function recover(): Promise<PackageRecovery> {
    if (root === undefined) return { completed: 0, discarded: 0, mismatched: [] }
    let completed = 0
    let discarded = 0
    for (const staged of await stagings(root)) {
      const meta = staged.meta
      const layout = meta === undefined ? undefined : layoutOf(meta.category)
      const recorded =
        meta === undefined
          ? undefined
          : await records.readVersionRecord(meta.assetRef, meta.version)
      if (recorded !== undefined && !('ok' in recorded)) throw new Error(recorded.failure)
      if (meta === undefined || layout === undefined || recorded?.ok === undefined) {
        await rm(staged.dir, { recursive: true, force: true })
        discarded += 1
        continue
      }
      const final = finalOf(root, layout, meta.name, meta.version)
      if (await isDirectory(final)) {
        await rm(staged.dir, { recursive: true, force: true })
        discarded += 1
        continue
      }
      await swap(staged.dir, final, meta.category)
      completed += 1
    }
    return { completed, discarded, mismatched: await mismatched(root) }
  }

  /**
   * Every identity with a version in place whose files differ from its record. It starts from the
   * directories in place, not from the records: a version is the package digest of its manifest,
   * so the files of a version directory must give back the digest that its name holds.
   */
  async function mismatched(root: string): Promise<CapabilityId[]> {
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

  return {
    async publish(request) {
      try {
        return await publish(request)
      } catch {
        return { kind: 'unknown', operationId: request.operationId }
      }
    },
    reader,
    recover,
    async locate({ assetRef, version }) {
      // Without a root this assembly keeps no local directory at all: that is `absent`, not unknown.
      if (root === undefined) return { kind: 'absent' }
      try {
        const placed = await placeOf(assetRef, version)
        if (!('ok' in placed))
          return placed.failure === 'unavailable' ? { kind: 'unavailable' } : { kind: 'absent' }
        return (await isDirectory(placed.ok.final))
          ? { kind: 'local-directory', path: placed.ok.final }
          : { kind: 'absent' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}

/** The directories in `dir` whose names do not start with a dot. */
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

/** The path and digest of every file below `dir`, with `/` between segments. */
async function entriesIn(dir: string, prefix: string): Promise<{ path: string; digest: string }[]> {
  const entries: { path: string; digest: string }[] = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = prefix === '' ? item.name : `${prefix}/${item.name}`
    if (item.isDirectory()) entries.push(...(await entriesIn(join(dir, item.name), path)))
    else entries.push({ path, digest: digestBytes(await readFile(join(dir, item.name))) })
  }
  return entries
}
