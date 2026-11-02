import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  FacilityReason,
  FacilityResult,
  FileBatchOutcome,
  FileBatchRecognition,
  FileBatchRef,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import {
  changeFailure,
  errorCode,
  failed,
  fdPath,
  gate,
  isHostPath,
  pathWithoutTrailingSlash,
  reject,
  tokenOf,
  unknown,
  versionOf,
  type CloseHandle,
  type FileStats,
  type HostPaths,
} from './host-paths.ts'

/** What the batch operations need from the engine that owns the facade. */
export type FileBatchEnvironment = Readonly<{
  paths: HostPaths
  /** Where the manifests of batches are kept; absent, both operations answer `unavailable`. */
  stateDirectory: string | undefined
  /** The process instance of the engine: a batch of another generation was written by another process. */
  generation: string
  /** The batches this process is publishing now. */
  running: Set<string>
  /** True once the facade is closed: a batch stops before its next publication. */
  sealed(): boolean
  close: CloseHandle
  drain(): Promise<void>
  /** Receives a diagnostic about a published batch; it never changes the result. */
  diagnose?: ((diagnostic: HostFileDiagnostic) => void) | undefined
}>

/** A fact about a batch that its result cannot carry. */
export type HostFileDiagnostic = Readonly<{
  /** The entry is published, but the staged file it was published from could not be removed. */
  kind: 'temporaryFileRemains'
  /** The batch id. */
  batch: string
  /** The target that was published. */
  path: string
  /** The name of the staged file that stays beside the target. */
  temporary: string
  /** The error code of the failed removal. */
  code?: string
}>

export type FileBatch = Pick<FileSystemFacility<unknown>, 'commitBatch' | 'recoverBatch'>

type ManifestEntry = Readonly<{
  path: string
  /** The token the request named: the parent directory of a new file, the file for a replacement. */
  named: string
  expectedVersion: string | null
  /** Digest and size of the staged bytes. The bytes themselves stay in the staged file only. */
  sha256: string
  size: number
  temp: string
}>

/**
 * `staging` and `publishing` are the two steps of a batch that is, or was, running. `committed`
 * and `conflict` are the two ends the writer reached. A batch that stopped any other way stays
 * `publishing`.
 */
type ManifestState = 'staging' | 'publishing' | 'committed' | 'conflict'

type Manifest = Readonly<{
  version: 1
  id: string
  generation: string
  tenant: string
  state: ManifestState
  entries: readonly ManifestEntry[]
  /** Paths whose publication is durable. Only a receipt proves a publication. */
  receipts: readonly string[]
}>

const batchIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const manifestStates: readonly string[] = ['staging', 'publishing', 'committed', 'conflict']

const digestOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  return (
    isRecord(value) &&
    typeof value['path'] === 'string' &&
    typeof value['named'] === 'string' &&
    (value['expectedVersion'] === null || typeof value['expectedVersion'] === 'string') &&
    typeof value['sha256'] === 'string' &&
    typeof value['size'] === 'number' &&
    typeof value['temp'] === 'string'
  )
}

function isManifest(value: unknown): value is Manifest {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    typeof value['id'] === 'string' &&
    typeof value['generation'] === 'string' &&
    typeof value['tenant'] === 'string' &&
    typeof value['state'] === 'string' &&
    manifestStates.includes(value['state']) &&
    Array.isArray(value['entries']) &&
    value['entries'].every(isManifestEntry) &&
    Array.isArray(value['receipts']) &&
    value['receipts'].every(receipt => typeof receipt === 'string')
  )
}

/** Writes the manifest as a whole: a new file, synced, then renamed over the old one. */
async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  )
  try {
    await handle.writeFile(JSON.stringify(manifest))
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

type Staged = Readonly<{
  entry: Readonly<{
    path: string
    bytes: Uint8Array
    expectedVersion: string | null
  }>
  named: string
  parent: FileHandle
  name: string
  temp: string
  mode: number
}>

type CommitRequest = Parameters<FileSystemFacility<unknown>['commitBatch']>[0]
type RecoverRequest = Parameters<FileSystemFacility<unknown>['recoverBatch']>[0]
type Entries = CommitRequest['entries']

/** Why a batch stopped between publications; `effectUnknown` leaves the staged files where they are. */
type Stop = 'conflict' | 'closed' | 'effectUnknown'

/** How far publishing got: the receipts, the reason it stopped (if it did), and the entry it stopped at. */
type Publication = Readonly<{ receipts: readonly string[]; stop: Stop | undefined; at: number }>

function outcomeOf(requestId: string, value: FileBatchOutcome): FacilityResult<FileBatchOutcome> {
  return { kind: 'done', requestId, value }
}

/** The reason the entries as a whole are unsound, found without the file system. */
function entriesRefusal(entries: Entries): FacilityReason | undefined {
  if (entries.length === 0) return 'invalidInput'
  const targets = entries.map(entry => entry.path)
  if (!targets.every(isHostPath)) return 'invalidInput'
  if (targets.some(target => target.length > 1 && target.endsWith('/'))) return 'invalidInput'
  if (entries.some(entry => entry.named === null || entry.named.token === ''))
    return 'notAuthorized'
  if (new Set(targets.map(pathWithoutTrailingSlash)).size !== targets.length) return 'invalidInput'
  return undefined
}

/** The reason a recovery request is refused without the file system; the state directory must be configured. */
function recoverRefusalOf(
  request: RecoverRequest,
  stateDirectory: string | undefined,
): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (!batchIdPattern.test(request.batch.id)) return 'invalidInput'
  return stateDirectory === undefined ? 'unavailable' : undefined
}

/** What an entry's target must be for the entry to be staged; undefined when it is. */
async function targetRefusal(
  requestId: string,
  entry: Entries[number],
  parent: FileHandle,
  named: string,
  existing: FileStats | undefined,
): Promise<FacilityResult<never> | undefined> {
  if (entry.expectedVersion === null) {
    if (tokenOf(await parent.stat({ bigint: true })).token !== named)
      return reject(requestId, 'conflict')
    return existing === undefined ? undefined : reject(requestId, 'conflict')
  }
  if (existing === undefined) return reject(requestId, 'notFound')
  if (tokenOf(existing).token !== named) return reject(requestId, 'conflict')
  if (!existing.isFile()) return reject(requestId, 'unsupported')
  return versionOf(existing) === entry.expectedVersion ? undefined : reject(requestId, 'conflict')
}

/** Removes the staged files not yet published; false when one could not be removed. */
async function discardAll(items: readonly Staged[]): Promise<boolean> {
  let all = true
  for (const item of items)
    try {
      await unlink(fdPath(item.parent, item.temp))
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') all = false
    }
  return all
}

/** Creates and syncs every staged file, then marks the manifest `publishing`. `made` lists the files created. */
async function stageFiles(
  staged: readonly Staged[],
  made: Staged[],
  manifest: Manifest,
  file: string,
): Promise<void> {
  for (const item of staged) {
    const handle = await open(
      fdPath(item.parent, item.temp),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      item.mode,
    )
    made.push(item)
    try {
      await handle.writeFile(item.entry.bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  await writeManifest(file, { ...manifest, state: 'publishing' })
}

/** The target is checked once more against the name and version asked for, then renamed over. */
async function publishReplacement(item: Staged): Promise<Stop | undefined> {
  const target = fdPath(item.parent, item.name)
  let current: FileStats | undefined
  try {
    current = await lstat(target, { bigint: true })
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') return 'effectUnknown'
  }
  if (
    current === undefined ||
    !current.isFile() ||
    tokenOf(current).token !== item.named ||
    versionOf(current) !== item.entry.expectedVersion
  )
    return 'conflict'
  try {
    await rename(fdPath(item.parent, item.temp), target)
  } catch {
    return 'effectUnknown'
  }
  return undefined
}

/** True when the manifest is the batch of this tenant, of the generation asked for. */
function isBatchOf(manifest: Manifest, tenant: string, batch: FileBatchRef): boolean {
  return (
    manifest.tenant === tenant &&
    manifest.id === batch.id &&
    manifest.generation === batch.generation
  )
}

/** The manifest of a batch, or why there is none. */
async function loadManifest(file: string): Promise<Manifest | 'absent' | 'unreadable'> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? 'absent' : 'unreadable'
  }
  return isManifest(parsed) ? parsed : 'unreadable'
}

/**
 * `commitBatch` and `recoverBatch`. A batch stages every entry in its own directory, then publishes
 * the entries one by one; there is no atomic commit across paths. A manifest in the state
 * directory records what was staged and which publications are durable, so that a later process
 * can tell what happened.
 */
export function createHostFileBatch(env: FileBatchEnvironment): FileBatch {
  const manifestLocation = (tenant: string, id: string) => {
    const directory = join(
      env.stateDirectory ?? '',
      'batches',
      createHash('sha256').update(tenant).digest('hex'),
    )
    return { directory, file: join(directory, `${id}.json`) }
  }

  /** A diagnostic sink never changes the result of the batch. */
  function report(diagnostic: HostFileDiagnostic): void {
    try {
      env.diagnose?.(diagnostic)
    } catch {
      // The sink failed; the publication it reports has happened all the same.
    }
  }

  /** Step 1 for one entry: its parent, its target as it is now, and the staged file it will use. */
  async function checkEntry(
    requestId: string,
    entry: Entries[number],
    temp: string,
    held: FileHandle[],
  ): Promise<Staged | FacilityResult<never>> {
    const located = await env.paths.locate(entry.path)
    if (!located.ok) return failed(requestId, located.failure, 'notFound')
    const { parent, name, isRoot } = located.value
    held.push(parent)
    if (isRoot) return reject(requestId, 'notAuthorized')
    const named = entry.named?.token ?? ''
    let existing: FileStats | undefined
    try {
      existing = await lstat(fdPath(parent, name), { bigint: true })
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') return unknown(requestId)
    }
    const refusal = await targetRefusal(requestId, entry, parent, named, existing)
    if (refusal !== undefined) return refusal
    const mode = existing === undefined ? 0o666 : Number(existing.mode & 0o777n)
    return { entry, named, parent, name, temp, mode }
  }

  /** Step 1: every entry is checked before anything is written. */
  async function checkEntries(
    requestId: string,
    entries: Entries,
    id: string,
    held: FileHandle[],
  ): Promise<readonly Staged[] | FacilityResult<never>> {
    const staged: Staged[] = []
    for (const [index, entry] of entries.entries()) {
      const checked = await checkEntry(requestId, entry, `.omne-batch-${id}-${index}`, held)
      if ('kind' in checked) return checked
      staged.push(checked)
    }
    return staged
  }

  async function commitBatch(
    request: CommitRequest,
  ): ReturnType<FileSystemFacility<unknown>['commitBatch']> {
    const { requestId, entries } = request
    if (request.binding.kind !== 'host_machine') return reject(requestId, 'unsupported')
    const unsound = entriesRefusal(entries)
    if (unsound !== undefined) return reject(requestId, unsound)
    if (env.stateDirectory === undefined) return reject(requestId, 'unavailable')
    await env.drain()
    const refusal = await gate(
      env.paths,
      requestId,
      entries.map(entry => entry.path),
    )
    if (refusal !== undefined) return refusal
    const tenant = tenantCodec.encode(request.access.tenant)
    if (!tenant.ok) return reject(requestId, 'notAuthorized')

    const held: FileHandle[] = []
    try {
      const id = randomUUID()
      const staged = await checkEntries(requestId, entries, id, held)
      if ('kind' in staged) return staged
      return await recordAndPublish(requestId, staged, id, tenant.value)
    } finally {
      for (const handle of held) await env.close(handle)
    }
  }

  /** Step 2: the manifest, before any staged file exists; then steps 3 to 5. */
  async function recordAndPublish(
    requestId: string,
    staged: readonly Staged[],
    id: string,
    tenant: string,
  ): Promise<FacilityResult<FileBatchOutcome>> {
    const { directory, file } = manifestLocation(tenant, id)
    const manifest: Manifest = {
      version: 1,
      id,
      generation: env.generation,
      tenant,
      state: 'staging',
      entries: staged.map(item => ({
        path: item.entry.path,
        named: item.named,
        expectedVersion: item.entry.expectedVersion,
        sha256: digestOf(item.entry.bytes),
        size: item.entry.bytes.byteLength,
        temp: item.temp,
      })),
      receipts: [],
    }
    env.running.add(id)
    try {
      try {
        await mkdir(directory, { recursive: true })
        await writeManifest(file, manifest)
      } catch {
        return reject(requestId, 'unavailable')
      }
      return await stageAndPublish(requestId, staged, manifest, file)
    } finally {
      env.running.delete(id)
    }
  }

  /** Steps 3 to 5: stage the bytes, then publish each entry and record its receipt. */
  async function stageAndPublish(
    requestId: string,
    staged: readonly Staged[],
    manifest: Manifest,
    file: string,
  ): Promise<FacilityResult<FileBatchOutcome>> {
    const made: Staged[] = []
    try {
      await stageFiles(staged, made, manifest, file)
    } catch (error) {
      // Nothing was published. A clean undo is a refusal; an undo that fails leaves files behind.
      if (!(await discardAll(made))) return unknown(requestId)
      await unlink(file).catch(() => undefined)
      return failed(requestId, changeFailure(error), 'notFound')
    }
    const publication = await publishAll(staged, manifest, file)
    return settle(requestId, staged, manifest, file, publication)
  }

  async function publishAll(
    staged: readonly Staged[],
    manifest: Manifest,
    file: string,
  ): Promise<Publication> {
    const receipts: string[] = []
    let at = 0
    for (; at < staged.length; at++) {
      const item = staged[at]
      if (item === undefined) break
      if (env.sealed()) return { receipts, stop: 'closed', at }
      const stop = await publishItem(item, manifest, file, receipts)
      if (stop !== undefined) return { receipts, stop, at }
    }
    return { receipts, stop: undefined, at }
  }

  /** Publishes one entry and records its receipt; a stop reason when it could not. */
  async function publishItem(
    item: Staged,
    manifest: Manifest,
    file: string,
    receipts: string[],
  ): Promise<Stop | undefined> {
    const stop =
      item.entry.expectedVersion === null
        ? await publishNew(item, manifest.id)
        : await publishReplacement(item)
    if (stop !== undefined) return stop
    try {
      await writeManifest(file, {
        ...manifest,
        state: 'publishing',
        receipts: [...receipts, item.entry.path],
      })
    } catch {
      return 'effectUnknown'
    }
    receipts.push(item.entry.path)
    return undefined
  }

  /** `link` fails when the name is taken, so a new file never replaces anything. */
  async function publishNew(item: Staged, batch: string): Promise<Stop | undefined> {
    const temporary = fdPath(item.parent, item.temp)
    try {
      await link(temporary, fdPath(item.parent, item.name))
    } catch (error) {
      return errorCode(error) === 'EEXIST' ? 'conflict' : 'effectUnknown'
    }
    try {
      await unlink(temporary)
    } catch (error) {
      // The file is published; the staged name that stays beside it is named, not hidden.
      const code = errorCode(error)
      if (code !== 'ENOENT')
        report({
          kind: 'temporaryFileRemains',
          batch,
          path: item.entry.path,
          temporary: item.temp,
          ...(code === undefined ? {} : { code }),
        })
    }
    return undefined
  }

  async function settle(
    requestId: string,
    staged: readonly Staged[],
    manifest: Manifest,
    file: string,
    { receipts, stop, at }: Publication,
  ): Promise<FacilityResult<FileBatchOutcome>> {
    const batch: FileBatchRef = { id: manifest.id, generation: manifest.generation }
    if (stop === undefined) {
      await writeManifest(file, { ...manifest, state: 'committed', receipts }).catch(
        () => undefined,
      )
      return outcomeOf(requestId, { batch, published: receipts, kind: 'committed' })
    }
    if (stop === 'effectUnknown')
      return outcomeOf(requestId, {
        batch,
        published: receipts,
        kind: 'unknown',
        reason: 'effectUnknown',
      })

    // A stop between publications: what is not published yet is taken away again.
    await discardAll(staged.slice(at))
    if (stop === 'conflict')
      await writeManifest(file, { ...manifest, state: 'conflict', receipts }).catch(() => undefined)
    return outcomeOf(requestId, { batch, published: receipts, kind: 'unknown', reason: stop })
  }

  async function recoverBatch(
    request: RecoverRequest,
  ): ReturnType<FileSystemFacility<unknown>['recoverBatch']> {
    const { requestId, batch } = request
    const unsound = recoverRefusalOf(request, env.stateDirectory)
    if (unsound !== undefined) return reject(requestId, unsound)
    await env.drain()
    const refusal = await gate(env.paths, requestId, [])
    if (refusal !== undefined) return refusal
    const tenant = tenantCodec.encode(request.access.tenant)
    if (!tenant.ok) return reject(requestId, 'notAuthorized')

    const loaded = await loadManifest(manifestLocation(tenant.value, batch.id).file)
    if (loaded === 'absent') return reject(requestId, 'notFound')
    if (loaded === 'unreadable') return unknown(requestId)
    // A batch of another tenant, or of another generation than the one asked for, is not found.
    if (!isBatchOf(loaded, tenant.value, batch)) return reject(requestId, 'notFound')

    const recognition = await recognize(loaded)
    return recognition === undefined
      ? unknown(requestId)
      : { kind: 'done', requestId, value: recognition }
  }

  /** What the targets hold now, against the receipts. Undefined when a target cannot be read. */
  async function recognize(manifest: Manifest): Promise<FileBatchRecognition | undefined> {
    const published = manifest.entries
      .filter(entry => manifest.receipts.includes(entry.path))
      .map(entry => entry.path)
    const matchingPrepared: string[] = []
    const conflicting: string[] = []
    for (const entry of manifest.entries) {
      if (manifest.receipts.includes(entry.path)) continue
      const seen = await observe(entry)
      if (seen === undefined) return undefined
      if (seen === 'absent') {
        if (entry.expectedVersion !== null) conflicting.push(entry.path)
      } else if (seen.matches) matchingPrepared.push(entry.path)
      else if (entry.expectedVersion === null || seen.version !== entry.expectedVersion)
        conflicting.push(entry.path)
    }
    const ref: FileBatchRef = { id: manifest.id, generation: manifest.generation }
    return {
      batch: ref,
      state: stateOf(manifest, published.length),
      published,
      matchingPrepared,
      conflicting,
    }
  }

  function stateOf(manifest: Manifest, receipts: number): FileBatchRecognition['state'] {
    if (receipts === manifest.entries.length) return 'complete'
    if (manifest.state === 'conflict') return 'conflict'
    if (manifest.generation !== env.generation) return 'interrupted'
    return env.running.has(manifest.id) ? 'pending' : 'partial'
  }

  /** The target of an entry as it is now: absent, or its version and whether its bytes are the staged bytes. */
  async function observe(
    entry: ManifestEntry,
  ): Promise<'absent' | Readonly<{ version: string; matches: boolean }> | undefined> {
    const located = await env.paths.locate(entry.path)
    if (!located.ok) return located.failure === 'unresolved' ? 'absent' : undefined
    const { parent, name } = located.value
    try {
      let stat: FileStats
      try {
        stat = await lstat(fdPath(parent, name), { bigint: true })
      } catch (error) {
        return errorCode(error) === 'ENOENT' ? 'absent' : undefined
      }
      const version = versionOf(stat)
      if (!stat.isFile() || stat.size !== BigInt(entry.size)) return { version, matches: false }
      const handle = await open(
        fdPath(parent, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      try {
        return { version, matches: digestOf(await handle.readFile()) === entry.sha256 }
      } finally {
        await env.close(handle)
      }
    } catch {
      return undefined
    } finally {
      await env.close(parent)
    }
  }

  return Object.freeze({ commitBatch, recoverBatch })
}
