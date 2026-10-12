import { link, mkdir, rename, rm, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  captureFileArguments,
  type FileTransferRequest,
  type FileRemoveRequest,
  type FileMkdirRequest,
} from '@omne-harness-lite/execution-environments'
import {
  absoluteHostPath,
  fileFailure,
  hostFileVersion,
  inspectHostPath,
  syncHostDirectory,
  HostFileFailure,
} from './file-path.ts'
import { captureHostNativePolicy, type HostNativePolicy } from './native-policy.ts'
import { readHostFile } from './file-query.ts'
import {
  planHostFileBatch,
  prepareHostFileBatch,
  publishHostFileBatch,
  clearHostBatchStages,
  type HostBatchManifest,
  type HostBatchReceipts,
  type HostStageOwnership,
} from './file-batch.ts'
import type { FacilityFailure } from '@omne-harness-lite/execution-environments'

async function transferInput(request: FileTransferRequest, method: 'move' | 'copy') {
  const args = captureFileArguments(method, [request])
  if (!args) throw new HostFileFailure('invalidInput')
  const copied = args[0] as FileTransferRequest
  const source = absoluteHostPath(copied.source),
    target = absoluteHostPath(copied.target)
  if (source === target) throw new HostFileFailure('invalidInput')
  const stat = await inspectHostPath(source),
    existing = await inspectHostPath(target, true)
  if (!stat?.isFile() || (existing && !existing.isFile())) throw new HostFileFailure('unsupported')
  if (copied.expectedVersion !== undefined && copied.expectedVersion !== hostFileVersion(stat))
    throw new HostFileFailure('conflict')
  if (existing && !copied.replace) throw new HostFileFailure('conflict')
  return { source, target, stat, existing }
}
export async function moveHostFile(request: FileTransferRequest, rawPolicy: HostNativePolicy) {
  captureHostNativePolicy(rawPolicy)
  let attempted = false
  try {
    const { source, target, stat, existing } = await transferInput(request, 'move')
    const directory = await inspectHostPath(dirname(target))
    if (directory?.dev !== stat.dev) throw new HostFileFailure('unsupported')
    attempted = true
    if (existing) await rename(source, target)
    else {
      await link(source, target)
      await unlink(source)
    }
    await syncHostDirectory(dirname(source))
    await syncHostDirectory(dirname(target))
    return { kind: 'moved' as const, source, target }
  } catch (error) {
    return attempted
      ? { kind: 'rejected' as const, reason: 'effectUnknown' as const }
      : fileFailure(error)
  }
}
export async function captureHostCopy(request: FileTransferRequest, policy: HostNativePolicy) {
  const { source, target, stat, existing } = await transferInput(request, 'copy')
  const read = await readHostFile(
    { path: source, limitBytes: Math.min(policy.fileReadBytes, policy.fileWriteBytes) },
    policy,
  )
  if (read.kind !== 'read') throw new HostFileFailure(read.reason)
  if (!read.eof) throw new HostFileFailure('capacity')
  if (read.version !== hostFileVersion(stat)) throw new HostFileFailure('conflict')
  return {
    source,
    target,
    entries: [
      {
        path: target,
        data: read.data,
        expectedVersion: existing ? hostFileVersion(existing) : null,
      },
    ],
  }
}
export interface HostCopyUnknown {
  readonly kind: 'unknown'
  readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable'
  readonly manifest: HostBatchManifest
  readonly stages: readonly HostStageOwnership[]
  readonly receipts: HostBatchReceipts
}
export async function copyHostFile(
  request: FileTransferRequest,
  rawPolicy: HostNativePolicy,
): Promise<
  | { readonly kind: 'copied'; readonly source: string; readonly target: string }
  | FacilityFailure
  | HostCopyUnknown
> {
  const policy = captureHostNativePolicy(rawPolicy)
  try {
    const copy = await captureHostCopy(request, policy),
      manifest = planHostFileBatch(copy.entries)
    const prepared = await prepareHostFileBatch(manifest, copy.entries, policy)
    if (prepared.kind === 'rejected') return prepared
    if (prepared.kind === 'unknown')
      return {
        kind: 'unknown',
        manifest,
        stages: prepared.stages,
        reason: 'effectUnknown',
        receipts: { published: [], complete: false },
      }
    const publication = await publishHostFileBatch(manifest, policy)
    const receipts = {
      published: publication.published,
      complete: publication.kind === 'committed',
    }
    if (publication.kind === 'unknown')
      return {
        kind: 'unknown',
        manifest,
        stages: prepared.stages,
        reason: publication.reason,
        receipts,
      }
    if ((await clearHostBatchStages(manifest, policy, prepared.stages)) !== 'cleared')
      return {
        kind: 'unknown',
        manifest,
        stages: prepared.stages,
        reason: 'effectUnknown',
        receipts,
      }
    return { kind: 'copied', source: copy.source, target: copy.target }
  } catch (error) {
    return fileFailure(error)
  }
}
async function inspectTree(path: string, budget: { remaining: number }): Promise<void> {
  if (--budget.remaining < 0) throw new HostFileFailure('capacity')
  const stat = await inspectHostPath(path)
  if (!stat?.isDirectory()) return
  const { opendir } = await import('node:fs/promises')
  const directory = await opendir(path)
  for await (const item of directory) await inspectTree(`${path}/${item.name}`, budget)
}
export async function removeHostPath(rawRequest: FileRemoveRequest, rawPolicy: HostNativePolicy) {
  const args = captureFileArguments('remove', [rawRequest]),
    policy = captureHostNativePolicy(rawPolicy)
  if (!args) return { kind: 'rejected' as const, reason: 'invalidInput' as const }
  let attempted = false
  try {
    const request = args[0] as FileRemoveRequest,
      path = absoluteHostPath(request.path),
      stat = await inspectHostPath(path)
    if (!stat) throw new HostFileFailure('notFound')
    if (!stat.isFile() && !stat.isDirectory()) throw new HostFileFailure('unsupported')
    if (request.expectedVersion !== undefined && request.expectedVersion !== hostFileVersion(stat))
      throw new HostFileFailure('conflict')
    if (request.recursive) await inspectTree(path, { remaining: policy.searchNodes })
    attempted = true
    await rm(path, { recursive: request.recursive, force: false })
    await syncHostDirectory(dirname(path))
    return { kind: 'removed' as const, path }
  } catch (error) {
    return attempted
      ? { kind: 'rejected' as const, reason: 'effectUnknown' as const }
      : fileFailure(error)
  }
}
async function existingDirectory(path: string, parents: boolean) {
  try {
    return await inspectHostPath(path, true)
  } catch (error) {
    if (parents && fileFailure(error).reason === 'notFound') return undefined
    throw error
  }
}
async function checkAncestor(path: string) {
  let parent = dirname(path)
  while (true) {
    try {
      await inspectHostPath(parent)
      return
    } catch (error) {
      if (fileFailure(error).reason !== 'notFound' || parent === dirname(parent)) throw error
      parent = dirname(parent)
    }
  }
}
export async function mkdirHostPath(rawRequest: FileMkdirRequest, rawPolicy: HostNativePolicy) {
  const args = captureFileArguments('mkdir', [rawRequest])
  captureHostNativePolicy(rawPolicy)
  if (!args) return { kind: 'rejected' as const, reason: 'invalidInput' as const }
  let attempted = false
  try {
    const request = args[0] as FileMkdirRequest,
      path = absoluteHostPath(request.path)
    const existing = await existingDirectory(path, Boolean(request.parents))
    if (existing) {
      if (!existing.isDirectory()) throw new HostFileFailure('conflict')
      return { kind: 'created' as const, path }
    }
    if (request.parents) await checkAncestor(path)
    attempted = true
    await mkdir(path, { recursive: request.parents, mode: 0o700 })
    await inspectHostPath(path)
    await syncHostDirectory(dirname(path))
    return { kind: 'created' as const, path }
  } catch (error) {
    return attempted
      ? { kind: 'rejected' as const, reason: 'effectUnknown' as const }
      : fileFailure(error)
  }
}
