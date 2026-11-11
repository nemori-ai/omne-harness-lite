import { createHash, randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  FacilityResult,
  FileBatchRecognition,
  FileSystemFacility,
} from '@omne-harness/execution-environment-contract'
import {
  entriesRefusal,
  isBatchOf,
  loadManifest,
  recoverRefusalOf,
  writeManifest,
  type FileBatch,
  type Manifest,
  type HostFileDiagnostic,
} from '../host-file-batch.ts'
import { failed, reject, unknown } from '../host-paths.ts'
import { createMacosPaths, type RootIdentity } from './paths.ts'
import { invoke } from './transport.ts'
import { runBatch, type NativeBatchEntry, type BatchEvent } from './batch-transport.ts'

type Commit = Parameters<FileBatch['commitBatch']>[0]
type Recover = Parameters<FileBatch['recoverBatch']>[0]
type Options = Readonly<{
  files: Pick<FileSystemFacility<unknown>, 'read'>
  rootIdentity?: () => Promise<RootIdentity | undefined>
  stateDirectory?: string
  generation: string
  running: Set<string>
  sealed(): boolean
  prerequisite(): Promise<boolean>
  diagnose?: ((diagnostic: HostFileDiagnostic) => void) | undefined
}>
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const location = (directory: string, tenant: string, id: string) =>
  join(directory, 'batches', digest(tenant), `${id}.json`)

function notify(
  options: Options,
  manifest: Manifest,
  event: Extract<BatchEvent, { event: 'published' }>,
): void {
  const entry = manifest.entries[event.index]
  if (entry === undefined || event.cleanupError === undefined) return
  try {
    options.diagnose?.({
      kind: 'temporaryFileRemains',
      batch: manifest.id,
      path: entry.path,
      temporary: event.cleanupError.temp,
      code: event.cleanupError.code,
    })
  } catch {
    /* A diagnostic cannot revoke a completed publication. */
  }
}

async function commit(options: Options, request: Commit, tenant: string, directory: string) {
  const endpoint = createMacosPaths(options.rootIdentity)
  const batch = { id: randomUUID(), generation: options.generation }
  const entries: NativeBatchEntry[] = []
  for (const [index, entry] of request.entries.entries()) {
    const path = await endpoint(entry.path)
    if (!path.ok) return failed(request.requestId, path.failure, 'notFound')
    entries.push({
      ...path.value,
      path: entry.path,
      named: entry.named?.token ?? '',
      version: entry.expectedVersion,
      bytes: Buffer.from(entry.bytes).toString('base64'),
      temp: `.omne-batch-${batch.id}-${index}`,
    })
  }
  if (!(await options.prerequisite())) return reject(request.requestId, 'unavailable')
  const manifest: Manifest = {
    version: 1,
    ...batch,
    tenant,
    state: 'staging',
    receipts: [],
    entries: request.entries.map((entry, index) => ({
      path: entry.path,
      named: entry.named?.token ?? '',
      expectedVersion: entry.expectedVersion,
      sha256: digest(entry.bytes),
      size: entry.bytes.length,
      temp: entries[index]?.temp ?? '',
    })),
  }
  const file = location(directory, tenant, batch.id)
  const published: string[] = []
  let manifestFailure = false
  let unavailable = false
  options.running.add(batch.id)
  try {
    const result = await runBatch(entries, options.rootIdentity !== undefined, async event => {
      if (event.event === 'beforePublish') return options.sealed() ? 'closed' : 'continue'
      try {
        if (event.event === 'checked') {
          await mkdir(dirname(file), { recursive: true })
          await writeManifest(file, manifest)
        } else if (event.event === 'staged') {
          await writeManifest(file, { ...manifest, state: 'publishing' })
        } else if (event.event === 'published') {
          const entry = manifest.entries[event.index]
          if (entry === undefined) throw new Error('missing batch entry')
          notify(options, manifest, event)
          await writeManifest(file, {
            ...manifest,
            state: 'publishing',
            receipts: [...published, entry.path],
          })
          published.push(entry.path)
        }
        return 'continue'
      } catch {
        manifestFailure = true
        unavailable = event.event === 'checked'
        return 'effectUnknown'
      }
    })
    if (unavailable) return reject(request.requestId, 'unavailable')
    if (typeof result !== 'string' && result.kind === 'stageFailed') {
      if (!result.cleaned) return unknown(request.requestId)
      await unlink(file).catch(() => undefined)
      return failed(request.requestId, result.reason, 'notFound')
    }
    if (typeof result === 'string' && result !== 'unknown')
      return failed(request.requestId, result, 'notFound')
    const finish =
      typeof result === 'string' || manifestFailure
        ? { kind: 'unknown' as const, reason: 'effectUnknown' as const }
        : result
    if (finish.kind === 'committed') {
      await writeManifest(file, { ...manifest, state: 'committed', receipts: published })
      return {
        kind: 'done' as const,
        requestId: request.requestId,
        value: { kind: 'committed' as const, batch, published },
      }
    }
    if (finish.reason === 'conflict')
      await writeManifest(file, { ...manifest, state: 'conflict', receipts: published })
    return {
      kind: 'done' as const,
      requestId: request.requestId,
      value: { kind: 'unknown' as const, batch, published, reason: finish.reason },
    }
  } catch {
    return {
      kind: 'done' as const,
      requestId: request.requestId,
      value: { kind: 'unknown' as const, batch, published, reason: 'effectUnknown' as const },
    }
  } finally {
    options.running.delete(batch.id)
  }
}

async function recognize(
  options: Options,
  request: Recover,
  manifest: Manifest,
): Promise<FacilityResult<FileBatchRecognition>> {
  const matchingPrepared: string[] = [],
    conflicting: string[] = []
  for (const entry of manifest.entries) {
    if (manifest.receipts.includes(entry.path)) continue
    const located = await createMacosPaths(options.rootIdentity)(entry.path)
    const seen = located.ok
      ? await invoke({
          ...located.value,
          operation: 'observe',
          named: '',
          path: entry.path,
          rooted: options.rootIdentity !== undefined,
        })
      : located.failure
    if (seen === 'unresolved') {
      if (entry.expectedVersion !== null) conflicting.push(entry.path)
      continue
    }
    if (typeof seen === 'string') return unknown(request.requestId)
    if (seen.info.type !== 'file' || seen.info.size !== entry.size) {
      if (entry.expectedVersion === null || seen.info.version !== entry.expectedVersion)
        conflicting.push(entry.path)
      continue
    }
    const read = await options.files.read({
      ...request,
      path: entry.path,
      named: { token: seen.info.token },
    })
    if (read.kind !== 'done') return unknown(request.requestId)
    if (read.value.bytes.length === entry.size && digest(read.value.bytes) === entry.sha256)
      matchingPrepared.push(entry.path)
    else if (entry.expectedVersion === null || read.value.version !== entry.expectedVersion)
      conflicting.push(entry.path)
  }
  const state =
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
}

export function createMacosBatch(options: Options): FileBatch {
  return {
    async commitBatch(original) {
      const request = {
        ...original,
        entries: original.entries.map(entry => ({
          ...entry,
          named: entry.named === null ? null : { ...entry.named },
          bytes: Uint8Array.from(entry.bytes),
        })),
      }
      if (request.binding.kind !== 'host_machine') return reject(request.requestId, 'unsupported')
      const refusal = entriesRefusal(request.entries)
      if (refusal !== undefined) return reject(request.requestId, refusal)
      if (options.stateDirectory === undefined) return reject(request.requestId, 'unavailable')
      const tenant = tenantCodec.encode(request.access.tenant)
      if (!tenant.ok) return reject(request.requestId, 'notAuthorized')
      return commit(options, request, tenant.value, options.stateDirectory)
    },
    async recoverBatch(original) {
      const request = { ...original, batch: { ...original.batch } }
      const refusal = recoverRefusalOf(request, options.stateDirectory)
      if (refusal !== undefined) return reject(request.requestId, refusal)
      const tenant = tenantCodec.encode(request.access.tenant)
      if (!tenant.ok) return reject(request.requestId, 'notAuthorized')
      if (!(await options.prerequisite())) return reject(request.requestId, 'unavailable')
      const manifest = await loadManifest(
        location(options.stateDirectory ?? '', tenant.value, request.batch.id),
      )
      if (manifest === 'absent') return reject(request.requestId, 'notFound')
      if (manifest === 'unreadable') return unknown(request.requestId)
      if (!isBatchOf(manifest, tenant.value, request.batch))
        return reject(request.requestId, 'notFound')
      return recognize(options, request, manifest)
    },
  }
}
