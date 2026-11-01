import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
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

function outcomeOf(requestId: string, value: FileBatchOutcome): FacilityResult<FileBatchOutcome> {
  return { kind: 'done', requestId, value }
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

  async function commitBatch(
    request: Parameters<FileSystemFacility<unknown>['commitBatch']>[0],
  ): ReturnType<FileSystemFacility<unknown>['commitBatch']> {
    const { requestId, entries } = request
    if (request.binding.kind !== 'host_machine') return reject(requestId, 'unsupported')
    if (entries.length === 0) return reject(requestId, 'invalidInput')
    const targets = entries.map(entry => entry.path)
    if (!targets.every(isHostPath)) return reject(requestId, 'invalidInput')
    if (targets.some(target => target.length > 1 && target.endsWith('/')))
      return reject(requestId, 'invalidInput')
    if (entries.some(entry => entry.named === null || entry.named.token === ''))
      return reject(requestId, 'notAuthorized')
    if (new Set(targets.map(pathWithoutTrailingSlash)).size !== targets.length)
      return reject(requestId, 'invalidInput')
    if (env.stateDirectory === undefined) return reject(requestId, 'unavailable')
    await env.drain()
    const refusal = await gate(env.paths, requestId, targets)
    if (refusal !== undefined) return refusal
    const tenant = tenantCodec.encode(request.access.tenant)
    if (!tenant.ok) return reject(requestId, 'notAuthorized')

    const held: FileHandle[] = []
    try {
      // Step 1: every entry is checked before anything is written.
      const staged: Staged[] = []
      const id = randomUUID()
      for (const [index, entry] of entries.entries()) {
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
        if (entry.expectedVersion === null) {
          if (tokenOf(await parent.stat({ bigint: true })).token !== named)
            return reject(requestId, 'conflict')
          if (existing !== undefined) return reject(requestId, 'conflict')
        } else {
          if (existing === undefined) return reject(requestId, 'notFound')
          if (tokenOf(existing).token !== named) return reject(requestId, 'conflict')
          if (!existing.isFile()) return reject(requestId, 'unsupported')
          if (versionOf(existing) !== entry.expectedVersion) return reject(requestId, 'conflict')
        }
        staged.push({
          entry,
          named,
          parent,
          name,
          temp: `.omne-batch-${id}-${index}`,
          mode: existing === undefined ? 0o666 : Number(existing.mode & 0o777n),
        })
      }

      // Step 2: the manifest, before any staged file exists.
      const { directory, file } = manifestLocation(tenant.value, id)
      const manifest: Manifest = {
        version: 1,
        id,
        generation: env.generation,
        tenant: tenant.value,
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
        return await stageAndPublish(request, staged, manifest, file)
      } finally {
        env.running.delete(id)
      }
    } finally {
      for (const handle of held) await env.close(handle)
    }
  }

  /** Steps 3 to 5: stage the bytes, then publish each entry and record its receipt. */
  async function stageAndPublish(
    request: Parameters<FileSystemFacility<unknown>['commitBatch']>[0],
    staged: readonly Staged[],
    manifest: Manifest,
    file: string,
  ): Promise<FacilityResult<FileBatchOutcome>> {
    const { requestId } = request
    const batch: FileBatchRef = { id: manifest.id, generation: manifest.generation }
    const made: Staged[] = []

    /** Removes the staged files not yet published; false when one could not be removed. */
    const discard = async (items: readonly Staged[]): Promise<boolean> => {
      let all = true
      for (const item of items)
        try {
          await unlink(fdPath(item.parent, item.temp))
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') all = false
        }
      return all
    }

    try {
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
    } catch (error) {
      // Nothing was published. A clean undo is a refusal; an undo that fails leaves files behind.
      if (!(await discard(made))) return unknown(requestId)
      await unlink(file).catch(() => undefined)
      return failed(requestId, changeFailure(error), 'notFound')
    }

    const receipts: string[] = []
    let stop: 'conflict' | 'closed' | 'effectUnknown' | undefined
    let at = 0
    for (; at < staged.length; at++) {
      const item = staged[at]
      if (item === undefined) break
      if (env.sealed()) {
        stop = 'closed'
        break
      }
      const target = fdPath(item.parent, item.name)
      const temporary = fdPath(item.parent, item.temp)
      if (item.entry.expectedVersion === null) {
        // `link` fails when the name is taken, so a new file never replaces anything.
        try {
          await link(temporary, target)
        } catch (error) {
          stop = errorCode(error) === 'EEXIST' ? 'conflict' : 'effectUnknown'
          break
        }
        await unlink(temporary).catch(() => undefined)
      } else {
        let current: FileStats | undefined
        try {
          current = await lstat(target, { bigint: true })
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') {
            stop = 'effectUnknown'
            break
          }
        }
        if (
          current === undefined ||
          !current.isFile() ||
          tokenOf(current).token !== item.named ||
          versionOf(current) !== item.entry.expectedVersion
        ) {
          stop = 'conflict'
          break
        }
        try {
          await rename(temporary, target)
        } catch {
          stop = 'effectUnknown'
          break
        }
      }
      try {
        await writeManifest(file, {
          ...manifest,
          state: 'publishing',
          receipts: [...receipts, item.entry.path],
        })
      } catch {
        stop = 'effectUnknown'
        break
      }
      receipts.push(item.entry.path)
    }

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
    await discard(staged.slice(at))
    if (stop === 'conflict')
      await writeManifest(file, { ...manifest, state: 'conflict', receipts }).catch(() => undefined)
    return outcomeOf(requestId, { batch, published: receipts, kind: 'unknown', reason: stop })
  }

  async function recoverBatch(
    request: Parameters<FileSystemFacility<unknown>['recoverBatch']>[0],
  ): ReturnType<FileSystemFacility<unknown>['recoverBatch']> {
    const { requestId, batch } = request
    if (request.binding.kind !== 'host_machine') return reject(requestId, 'unsupported')
    if (!batchIdPattern.test(batch.id)) return reject(requestId, 'invalidInput')
    if (env.stateDirectory === undefined) return reject(requestId, 'unavailable')
    await env.drain()
    const refusal = await gate(env.paths, requestId, [])
    if (refusal !== undefined) return refusal
    const tenant = tenantCodec.encode(request.access.tenant)
    if (!tenant.ok) return reject(requestId, 'notAuthorized')

    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(manifestLocation(tenant.value, batch.id).file, 'utf8'))
    } catch (error) {
      return errorCode(error) === 'ENOENT' ? reject(requestId, 'notFound') : unknown(requestId)
    }
    if (!isManifest(parsed)) return unknown(requestId)
    // A batch of another tenant, or of another generation than the one asked for, is not found.
    if (
      parsed.tenant !== tenant.value ||
      parsed.id !== batch.id ||
      parsed.generation !== batch.generation
    )
      return reject(requestId, 'notFound')

    const recognition = await recognize(parsed)
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
