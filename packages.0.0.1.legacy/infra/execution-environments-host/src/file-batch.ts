import { createHash, randomUUID } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import { link, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  captureFileArguments,
  type FacilityFailure,
  type FileBatchEntry,
} from '@omne-harness-lite/execution-environments'
import {
  absoluteHostPath,
  fileFailure,
  hostFileVersion,
  inspectHostPath,
  openHostRegularFile,
  syncHostDirectory,
  HostFileFailure,
} from './file-path.ts'
import { captureHostNativePolicy, type HostNativePolicy } from './native-policy.ts'

export interface HostBatchTarget {
  readonly path: string
  readonly stage: string
  readonly expectedVersion: string | null
  readonly preparedDigest: string
}
export interface HostBatchManifest {
  readonly id: string
  readonly targets: readonly HostBatchTarget[]
}
export interface HostStageOwnership {
  readonly stage: string
  readonly identity: string
}
const stageIdentity = (stat: BigIntStats) => `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`
export interface HostBatchReceipts {
  readonly published: readonly string[]
  readonly complete: boolean
}
export type HostBatchEvent =
  { readonly kind: 'published'; readonly path: string } | { readonly kind: 'completed' }
export type HostBatchPublication =
  | { readonly kind: 'committed'; readonly published: readonly string[] }
  | {
      readonly kind: 'unknown'
      readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable'
      readonly published: readonly string[]
    }
function hasTargetAncestor(path: string, paths: ReadonlySet<string>) {
  let parent = dirname(path)
  while (parent !== path) {
    if (paths.has(parent)) return true
    path = parent
    parent = dirname(path)
  }
  return false
}
function distinctTargets(targets: readonly HostBatchTarget[]) {
  const paths = new Set(targets.map(target => target.path))
  return (
    paths.size === targets.length && targets.every(target => !hasTargetAncestor(target.path, paths))
  )
}
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/** Chooses every physical coordinate without filesystem effects. */
export function planHostFileBatch(rawEntries: readonly FileBatchEntry[]): HostBatchManifest {
  const args = captureFileArguments('commitBatch', [{ entries: rawEntries }])
  if (!args) throw new HostFileFailure('invalidInput')
  const entries = (args[0] as { entries: FileBatchEntry[] }).entries,
    id = randomUUID()
  const targets = entries.map((entry, index) => {
    const path = absoluteHostPath(entry.path)
    return Object.freeze({
      path,
      stage: join(dirname(path), `.omne-stage-${id}-${index}`),
      expectedVersion: entry.expectedVersion,
      preparedDigest: digest(entry.data),
    })
  })
  if (!targets.length || !distinctTargets(targets)) throw new HostFileFailure('invalidInput')
  return Object.freeze({ id, targets: Object.freeze(targets) })
}
function validBatchTarget(target: HostBatchTarget, id: string, index: number) {
  const path = absoluteHostPath(target.path)
  return (
    path === target.path &&
    target.stage === join(dirname(path), `.omne-stage-${id}-${index}`) &&
    /^[a-f0-9]{64}$/.test(target.preparedDigest) &&
    (target.expectedVersion === null || typeof target.expectedVersion === 'string')
  )
}
export function captureHostBatchManifest(input: HostBatchManifest): HostBatchManifest {
  const value = structuredClone(input)
  if (!/^[0-9a-f-]{36}$/.test(value.id) || !Array.isArray(value.targets) || !value.targets.length)
    throw new HostFileFailure('invalidInput')
  if (!value.targets.every((target, index) => validBatchTarget(target, value.id, index)))
    throw new HostFileFailure('invalidInput')
  if (!distinctTargets(value.targets)) throw new HostFileFailure('invalidInput')
  return value
}
async function checkTarget(target: HostBatchTarget): Promise<void> {
  const stat = await inspectHostPath(target.path, true)
  if (stat && !stat.isFile()) throw new HostFileFailure('unsupported')
  const actual = stat ? hostFileVersion(stat) : null
  if (actual !== target.expectedVersion) throw new HostFileFailure('conflict')
}
async function writeStage(
  target: HostBatchTarget,
  data: Uint8Array,
  observer?: (ownership: HostStageOwnership) => Promise<'recorded' | 'unavailable'>,
): Promise<void> {
  await inspectHostPath(target.stage, true)
  const handle = await open(
    target.stage,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    const ownership = {
      stage: target.stage,
      identity: stageIdentity(await handle.stat({ bigint: true })),
    }
    if (observer && (await observer(ownership)) !== 'recorded')
      throw new HostFileFailure('unavailable')
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await syncHostDirectory(dirname(target.stage))
}
async function precheckEntries(
  manifest: HostBatchManifest,
  entries: readonly FileBatchEntry[],
  policy: HostNativePolicy,
) {
  if (
    entries.length !== manifest.targets.length ||
    entries.length > policy.maxBatchEntries ||
    entries.reduce((sum, entry) => sum + entry.data.length, 0) > policy.maxBatchBytes
  )
    throw new HostFileFailure('capacity')
  for (const [index, entry] of entries.entries()) {
    const target = manifest.targets[index]!
    if (entry.data.length > policy.fileWriteBytes) throw new HostFileFailure('capacity')
    if (
      absoluteHostPath(entry.path) !== target.path ||
      entry.expectedVersion !== target.expectedVersion ||
      digest(entry.data) !== target.preparedDigest
    )
      throw new HostFileFailure('invalidInput')
    await checkTarget(target)
  }
}
export async function prepareHostFileBatch(
  rawManifest: HostBatchManifest,
  rawEntries: readonly FileBatchEntry[],
  rawPolicy: HostNativePolicy,
  observer?: (ownership: HostStageOwnership) => Promise<'recorded' | 'unavailable'>,
): Promise<
  | {
      readonly kind: 'prepared' | 'unknown'
      readonly manifest: HostBatchManifest
      readonly stages: readonly HostStageOwnership[]
    }
  | FacilityFailure
> {
  const policy = captureHostNativePolicy(rawPolicy),
    stages: HostStageOwnership[] = []
  const registerStage = async (ownership: HostStageOwnership) => {
    stages.push(Object.freeze({ ...ownership }))
    return observer ? observer(ownership) : ('recorded' as const)
  }
  let manifest: HostBatchManifest, entries: readonly FileBatchEntry[]
  try {
    manifest = captureHostBatchManifest(rawManifest)
    const args = captureFileArguments('commitBatch', [{ entries: rawEntries }])
    if (!args) throw new HostFileFailure('invalidInput')
    entries = (args[0] as { entries: FileBatchEntry[] }).entries
    await precheckEntries(manifest, entries, policy)
  } catch (error) {
    return fileFailure(error)
  }
  try {
    for (const [index, entry] of entries.entries())
      await writeStage(manifest.targets[index]!, entry.data, registerStage)
    return { kind: 'prepared', manifest, stages: Object.freeze(stages) }
  } catch {
    return { kind: 'unknown', manifest, stages: Object.freeze(stages) }
  }
}
async function digestFile(path: string, maximum: number): Promise<string> {
  const { handle, stat } = await openHostRegularFile(path)
  try {
    if (stat.size > BigInt(maximum)) throw new HostFileFailure('capacity')
    const hash = createHash('sha256'),
      buffer = Buffer.alloc(Math.min(maximum, 65536))
    let offset = 0
    while (offset < Number(stat.size)) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, Number(stat.size) - offset),
        offset,
      )
      if (!bytesRead) throw new HostFileFailure('conflict')
      hash.update(buffer.subarray(0, bytesRead))
      offset += bytesRead
    }
    if (hostFileVersion(await handle.stat({ bigint: true })) !== hostFileVersion(stat))
      throw new HostFileFailure('conflict')
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}
async function precheckPublication(manifest: HostBatchManifest, policy: HostNativePolicy) {
  if (manifest.targets.length > policy.maxBatchEntries) throw new HostFileFailure('capacity')
  for (const target of manifest.targets) {
    await checkTarget(target)
    if ((await digestFile(target.stage, policy.fileWriteBytes)) !== target.preparedDigest)
      throw new HostFileFailure('conflict')
  }
}
async function publishTarget(target: HostBatchTarget) {
  await checkTarget(target)
  if (target.expectedVersion === null) {
    await link(target.stage, target.path)
    await unlink(target.stage)
  } else await rename(target.stage, target.path)
  await syncHostDirectory(dirname(target.path))
}
export async function publishHostFileBatch(
  rawManifest: HostBatchManifest,
  rawPolicy: HostNativePolicy,
  observer?: {
    readonly open: () => boolean
    readonly record: (event: HostBatchEvent) => Promise<'recorded' | 'unavailable'>
  },
): Promise<HostBatchPublication> {
  const policy = captureHostNativePolicy(rawPolicy),
    published: string[] = []
  try {
    const manifest = captureHostBatchManifest(rawManifest)
    await precheckPublication(manifest, policy)
    for (const target of manifest.targets) {
      if (observer && !observer.open()) return { kind: 'unknown', reason: 'closed', published }
      await publishTarget(target)
      if (
        observer &&
        (await observer.record({ kind: 'published', path: target.path })) !== 'recorded'
      )
        return { kind: 'unknown', reason: 'unavailable', published }
      published.push(target.path)
    }
    if (observer && (await observer.record({ kind: 'completed' })) !== 'recorded')
      return { kind: 'unknown', reason: 'unavailable', published }
    return { kind: 'committed', published }
  } catch (error) {
    return {
      kind: 'unknown',
      reason: fileFailure(error).reason === 'conflict' ? 'conflict' : 'effectUnknown',
      published,
    }
  }
}
async function recognizeTarget(target: HostBatchTarget, policy: HostNativePolicy) {
  const stat = await inspectHostPath(target.path, true)
  if (
    stat &&
    stat.isFile() &&
    (await digestFile(target.path, policy.fileWriteBytes)) === target.preparedDigest
  )
    return 'matching'
  return (stat ? hostFileVersion(stat) : null) === target.expectedVersion
    ? 'unchanged'
    : 'conflicting'
}
function recognizedState(
  manifest: HostBatchManifest,
  receipts: HostBatchReceipts,
  matching: readonly string[],
  conflicting: readonly string[],
) {
  if (conflicting.length) return 'conflict' as const
  if (
    receipts.complete &&
    receipts.published.length === manifest.targets.length &&
    matching.length === manifest.targets.length
  )
    return 'complete' as const
  return matching.length ? ('partial' as const) : ('interrupted' as const)
}
export async function recognizeHostFileBatch(
  rawManifest: HostBatchManifest,
  receipts: HostBatchReceipts,
  rawPolicy: HostNativePolicy,
) {
  const policy = captureHostNativePolicy(rawPolicy),
    matchingPrepared: string[] = [],
    conflicting: string[] = []
  try {
    const manifest = captureHostBatchManifest(rawManifest)
    for (const target of manifest.targets) {
      const state = await recognizeTarget(target, policy)
      if (state === 'matching') matchingPrepared.push(target.path)
      if (state === 'conflicting') conflicting.push(target.path)
    }
    return {
      state: recognizedState(manifest, receipts, matchingPrepared, conflicting),
      matchingPrepared,
      conflicting,
    }
  } catch {
    return { state: 'pending' as const, matchingPrepared, conflicting }
  }
}
export async function clearHostBatchStages(
  rawManifest: HostBatchManifest,
  rawPolicy: HostNativePolicy,
  ownership: readonly HostStageOwnership[] = [],
): Promise<'cleared' | 'pending'> {
  try {
    const manifest = captureHostBatchManifest(rawManifest),
      policy = captureHostNativePolicy(rawPolicy)
    for (const target of manifest.targets) {
      const stat = await inspectHostPath(target.stage, true)
      if (!stat) continue
      if (!stat.isFile()) return 'pending'
      const owned = ownership.some(
        receipt => receipt.stage === target.stage && receipt.identity === stageIdentity(stat),
      )
      if (!owned) return 'pending'
      const current = await inspectHostPath(target.stage, true)
      if (!current || hostFileVersion(current) !== hostFileVersion(stat)) return 'pending'
      await unlink(target.stage)
      await syncHostDirectory(dirname(target.stage))
    }
    return 'cleared'
  } catch {
    return 'pending'
  }
}
