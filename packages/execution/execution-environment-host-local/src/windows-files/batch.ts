import { createHash, randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { win32 } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  FacilityResult,
  FileBatchRecognition,
  FileIdentity,
  FileRequest,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import {
  entriesRefusal,
  isBatchOf,
  loadManifest,
  recoverRefusalOf,
  writeManifest,
  type Manifest,
  type FileBatch,
  type HostFileDiagnostic,
} from '../host-file-batch.ts'
import { failed, reject, unknown } from '../host-paths.ts'
import { windowsObjectInfo } from './facility.ts'

type Files = Pick<FileSystemFacility<unknown>, 'stat' | 'read' | 'write' | 'move' | 'remove'>
type Commit = Parameters<FileSystemFacility<unknown>['commitBatch']>[0]
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

/** A staged file: where it is, what it is and the target it stands for. */
type Staged = Readonly<{ path: string; identity: FileIdentity; target: string; temp: string }>

/**
 * Batches composed of single Windows file operations. Staging writes every entry into a new file
 * beside its target; publication moves them over the targets one by one. A staged file that is not
 * published is removed again, and one that cannot be removed is named by `temporaryFileRemains`.
 */
export function createWindowsBatch(options: {
  files: Files
  stateDirectory?: string
  generation: string
  running: Set<string>
  sealed(): boolean
  diagnose?: ((diagnostic: HostFileDiagnostic) => void) | undefined
}): FileBatch {
  const { files } = options
  const report = (diagnostic: HostFileDiagnostic) => {
    try {
      options.diagnose?.(diagnostic)
    } catch {
      /* A diagnostic never changes the result. */
    }
  }
  const location = (tenant: string, id: string) =>
    win32.join(options.stateDirectory ?? '', 'batches', digest(tenant), `${id}.json`)
  const entryRequest = (
    request: Commit,
    entry: Commit['entries'][number],
  ): FileRequest<unknown> => ({ ...request, path: entry.path, named: entry.named })
  async function check(
    request: FileRequest<unknown>,
    version: string | null,
  ): Promise<FacilityResult<never> | undefined> {
    const found = await files.stat(request)
    if (version === null) {
      if (found.kind === 'done' || (found.kind === 'rejected' && found.reason === 'conflict'))
        return reject(request.requestId, 'conflict')
      if (found.kind !== 'unresolved') return found
      const parent = await files.stat({ ...request, path: win32.dirname(request.path) })
      if (parent.kind === 'unresolved') return reject(request.requestId, 'notFound')
      return parent.kind === 'done' ? undefined : parent
    }
    if (found.kind === 'unresolved') return reject(request.requestId, 'notFound')
    if (found.kind !== 'done') return found
    return found.value.type !== 'file'
      ? reject(request.requestId, 'unsupported')
      : found.value.version !== version
        ? reject(request.requestId, 'conflict')
        : undefined
  }
  return {
    async commitBatch(request) {
      request = {
        ...request,
        entries: request.entries.map(entry => ({
          ...entry,
          named: entry.named === null ? null : { ...entry.named },
          bytes: Uint8Array.from(entry.bytes),
        })),
      }
      if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
      const invalid = entriesRefusal(request.entries)
      if (invalid !== undefined) return reject(request.requestId, invalid)
      if (
        new Set(request.entries.map(entry => win32.normalize(entry.path).toLowerCase())).size !==
        request.entries.length
      )
        return reject(request.requestId, 'invalidInput')
      if (options.stateDirectory === undefined) return reject(request.requestId, 'unavailable')
      const tenant = tenantCodec.encode(request.access.tenant)
      if (!tenant.ok) return reject(request.requestId, 'notAuthorized')
      for (const entry of request.entries) {
        const refused = await check(entryRequest(request, entry), entry.expectedVersion)
        if (refused !== undefined) return refused
      }
      const batch = { id: randomUUID(), generation: options.generation }
      const file = location(tenant.value, batch.id)
      const manifest: Manifest = {
        version: 1,
        ...batch,
        tenant: tenant.value,
        state: 'staging',
        receipts: [],
        entries: request.entries.map((entry, index) => ({
          path: entry.path,
          named: entry.named?.token ?? '',
          expectedVersion: entry.expectedVersion,
          sha256: digest(entry.bytes),
          size: entry.bytes.length,
          temp: `.omne-batch-${batch.id}-${index}`,
        })),
      }
      const staged: Staged[] = []
      const published: string[] = []
      /** The staged files that are not published stay: the effect of the batch is not known. */
      let retainPrepared = false
      /** The staged files were already removed, or tried to be. */
      let discarded = false
      /** Removes the staged files given; false when one of them stays, which is then named. */
      const discard = async (items: readonly Staged[]): Promise<boolean> => {
        discarded = true
        let all = true
        for (const item of items) {
          const removed = await files.remove({
            ...request,
            path: item.path,
            named: item.identity.object,
            recursive: false,
          })
          if (
            removed.kind === 'done' ||
            (removed.kind === 'rejected' && removed.reason === 'notFound')
          )
            continue
          all = false
          report({
            kind: 'temporaryFileRemains',
            batch: batch.id,
            path: item.target,
            temporary: item.temp,
            ...(removed.kind === 'rejected' ? { code: removed.reason } : {}),
          })
        }
        return all
      }
      /**
       * Staging stopped before anything was published. With every staged file removed again and a
       * refusal for the step that stopped it, the batch is refused and its manifest goes; otherwise
       * its effect is not known.
       */
      const abandon = async (refusal: FacilityResult<never>): Promise<FacilityResult<never>> => {
        if (!(await discard(staged)) || refusal.kind !== 'rejected')
          return unknown(request.requestId)
        await unlink(file).catch(() => undefined)
        return refusal
      }
      const uncertain = (reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable') => {
        retainPrepared = reason === 'effectUnknown'
        return {
          kind: 'done' as const,
          requestId: request.requestId,
          value: { kind: 'unknown' as const, batch, published: [...published], reason },
        }
      }
      options.running.add(batch.id)
      try {
        try {
          await mkdir(win32.dirname(file), { recursive: true })
          await writeManifest(file, manifest)
        } catch {
          return reject(request.requestId, 'unavailable')
        }
        for (const [index, entry] of request.entries.entries()) {
          const stored = manifest.entries[index]
          if (stored === undefined) return uncertain('effectUnknown')
          const parentPath = win32.dirname(entry.path)
          const parent = await windowsObjectInfo(parentPath)
          if (!parent.ok)
            return await abandon(failed(request.requestId, parent.failure, 'notFound'))
          const path = win32.join(parentPath, stored.temp)
          const result = await files.write({
            ...request,
            path,
            named: { token: parent.value.token },
            bytes: entry.bytes,
            mode: 'create',
          })
          // A write refuses only when it left no file of its own.
          if (result.kind !== 'done')
            return await abandon(result.kind === 'rejected' ? result : unknown(request.requestId))
          staged.push({ path, identity: result.value, target: entry.path, temp: stored.temp })
        }
        await writeManifest(file, { ...manifest, state: 'publishing' })
        for (const [index, entry] of request.entries.entries()) {
          if (options.sealed()) return uncertain('closed')
          const refused = await check(entryRequest(request, entry), entry.expectedVersion)
          if (options.sealed()) return uncertain('closed')
          if (refused !== undefined) {
            await writeManifest(file, { ...manifest, state: 'conflict', receipts: published })
            return uncertain('conflict')
          }
          const item = staged[index]
          if (item === undefined) return uncertain('effectUnknown')
          const moved = await files.move({
            ...request,
            path: item.path,
            named: item.identity.object,
            expectedVersion: item.identity.version,
            target: { path: entry.path, named: entry.named },
            replace: entry.expectedVersion !== null,
          })
          if (moved.kind !== 'done') return uncertain('effectUnknown')
          await writeManifest(file, {
            ...manifest,
            state: 'publishing',
            receipts: [...published, entry.path],
          })
          published.push(entry.path)
        }
        await writeManifest(file, { ...manifest, state: 'committed', receipts: published })
        return {
          kind: 'done',
          requestId: request.requestId,
          value: { kind: 'committed', batch, published },
        }
      } catch {
        return uncertain('effectUnknown')
      } finally {
        if (!retainPrepared && !discarded) await discard(staged.slice(published.length))
        options.running.delete(batch.id)
      }
    },
    async recoverBatch(request) {
      request = { ...request, batch: { ...request.batch } }
      const invalid = recoverRefusalOf(request, options.stateDirectory)
      if (invalid !== undefined) return reject(request.requestId, invalid)
      const tenant = tenantCodec.encode(request.access.tenant)
      if (!tenant.ok) return reject(request.requestId, 'notAuthorized')
      const manifest = await loadManifest(location(tenant.value, request.batch.id))
      if (manifest === 'absent') return reject(request.requestId, 'notFound')
      if (manifest === 'unreadable') return unknown(request.requestId)
      if (!isBatchOf(manifest, tenant.value, request.batch))
        return reject(request.requestId, 'notFound')
      const matchingPrepared: string[] = [],
        conflicting: string[] = []
      for (const entry of manifest.entries) {
        if (manifest.receipts.includes(entry.path)) continue
        const found = await windowsObjectInfo(entry.path)
        if (!found.ok) {
          if (found.failure !== 'unresolved') return unknown(request.requestId)
          if (entry.expectedVersion !== null) conflicting.push(entry.path)
          continue
        }
        // A directory or a link at the target is neither the expected version nor the staged bytes.
        if (found.value.type !== 'file') {
          conflicting.push(entry.path)
          continue
        }
        const read = await files.read({
          ...request,
          path: entry.path,
          named: { token: found.value.token },
        })
        if (read.kind !== 'done') return unknown(request.requestId)
        if (read.value.bytes.length === entry.size && digest(read.value.bytes) === entry.sha256)
          matchingPrepared.push(entry.path)
        else if (entry.expectedVersion === null || entry.expectedVersion !== read.value.version)
          conflicting.push(entry.path)
      }
      const state: FileBatchRecognition['state'] =
        manifest.receipts.length === manifest.entries.length
          ? 'complete'
          : manifest.state === 'conflict'
            ? 'conflict'
            : manifest.generation !== options.generation
              ? 'interrupted'
              : options.running.has(manifest.id)
                ? 'pending'
                : 'partial'
      return {
        kind: 'done',
        requestId: request.requestId,
        value: {
          batch: request.batch,
          state,
          published: manifest.receipts,
          matchingPrepared,
          conflicting,
        },
      }
    },
  }
}
