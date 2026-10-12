import { readHostProcessStat } from './process-observation.ts'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { copyJsonValue, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { narrow, StorageDefect, type Storage } from '@omne-harness-lite/storage'
import type { ManagedResource } from '@omne-harness-lite/execution-environments'
import { ownResources, ownScope } from './values.ts'
import {
  captureHostBatchManifest,
  type HostBatchManifest,
  type HostBatchReceipts,
  type HostStageOwnership,
} from './file-batch.ts'

export interface HostCreator {
  readonly pid: number
  readonly ticks: string
  readonly boot: string
}
export interface NativeRecord {
  readonly resource: ManagedResource
  readonly creator: HostCreator
  readonly kind: 'command' | 'terminal' | 'leg' | 'batch' | 'mutation'
  readonly generation: string
  readonly scope: string
  readonly manifest?: HostBatchManifest
  readonly stageOwners?: readonly HostStageOwnership[]
  readonly terminal?: string
  readonly receipts?: HostBatchReceipts
  readonly completed?: boolean
  readonly adopted?: boolean
  readonly cleanupPending?: boolean
  readonly stopped?: boolean
}
interface Row {
  provider: string
  resource_key: string
  scope: string
  generation: string
  receipt: string
  data: string
}
interface Tables {
  host_environment_resources: Row
}
function validCreator(value: HostCreator) {
  return (
    Number.isSafeInteger(value?.pid) &&
    value.pid > 0 &&
    /^\d+$/.test(value.ticks) &&
    /^[0-9a-f-]{36}$/.test(value.boot)
  )
}
function validReceiptFlags(value: NativeRecord) {
  return ['stopped', 'completed', 'adopted', 'cleanupPending'].every(key => {
    const flag = value[key as 'stopped']
    return flag === undefined || typeof flag === 'boolean'
  })
}
function originalReference(value: NativeRecord) {
  const copied = copyJsonValue(value.resource.reference)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok) ||
    !('kind' in copied.ok)
  )
    return false
  return (
    copied.ok.kind === value.kind &&
    copied.ok.generation === value.generation &&
    writeJsonLossless(copied.ok.creator) === writeJsonLossless(value.creator)
  )
}
function originalRow(data: NativeRecord, row: Row) {
  return (
    data.resource.provider === row.provider &&
    data.resource.key === row.resource_key &&
    data.scope === row.scope &&
    data.generation === row.generation
  )
}
function validPublished(receipts: HostBatchReceipts | undefined, paths: readonly string[]) {
  if (!receipts || !Array.isArray(receipts.published) || typeof receipts.complete !== 'boolean')
    return false
  if (receipts.published.some((path, index) => path !== paths[index])) return false
  return !receipts.complete || receipts.published.length === paths.length
}
function validStageOwners(owners: NativeRecord['stageOwners'], manifest: HostBatchManifest) {
  return (
    owners === undefined ||
    (Array.isArray(owners) &&
      owners.every(
        owner =>
          manifest.targets.some(target => target.stage === owner.stage) &&
          /^\d+:\d+:\d+$/.test(owner.identity),
      ))
  )
}
function emptyBatchEvidence(data: NativeRecord) {
  return !data.manifest && !data.receipts && !data.stageOwners
}
function validBatchEvidence(data: NativeRecord) {
  if (data.kind !== 'batch') return emptyBatchEvidence(data)
  if (!data.manifest) return false
  const manifest = captureHostBatchManifest(data.manifest)
  const reference = data.resource.reference as { manifest?: unknown }
  if (writeJsonLossless(manifest) !== writeJsonLossless(reference.manifest)) return false
  return (
    validPublished(
      data.receipts,
      manifest.targets.map(target => target.path),
    ) && validStageOwners(data.stageOwners, manifest)
  )
}
function decode(row: Row): NativeRecord {
  const data = JSON.parse(row.data) as NativeRecord
  if (
    !ownResources([data.resource]) ||
    !ownScope(JSON.parse(data.scope)) ||
    !validCreator(data.creator) ||
    !validReceiptFlags(data)
  )
    throw new StorageDefect('Invalid host resource data')
  if (!originalRow(data, row)) throw new StorageDefect('Host resource identity mismatch')
  if (
    !['command', 'terminal', 'leg', 'batch', 'mutation'].includes(data.kind) ||
    !originalReference(data) ||
    !validBatchEvidence(data)
  )
    throw new StorageDefect('Invalid original host resource reference')
  return data
}
async function startTicks(pid: number): Promise<string | undefined> {
  const stat = await readHostProcessStat(pid)
  if (stat === undefined) return undefined
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  return fields[0] === 'Z' ? undefined : fields[19]
}

export async function hostCreatorIdentity(): Promise<HostCreator> {
  const ticks = await startTicks(process.pid)
  if (!ticks) throw new Error('Host creator identity unavailable')
  return {
    pid: process.pid,
    ticks,
    boot: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  }
}
/** Observation only. Never use this PID as process-stop authority. */
export async function hostCreatorIsGone(original: HostCreator): Promise<boolean> {
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  return boot !== original.boot || (await startTicks(original.pid)) !== original.ticks
}
export function createNativeStore(storage: Storage, provider: string) {
  function query(tx: Parameters<typeof narrow<Tables>>[0], key: string) {
    return narrow<Tables>(tx)
      .selectFrom('host_environment_resources')
      .selectAll()
      .where('provider', '=', provider)
      .where('resource_key', '=', key)
  }
  async function load(key: string) {
    return storage.read(async tx => {
      const row = await query(tx, key).executeTakeFirst()
      return row && decode(row)
    })
  }
  async function change(key: string, update: (basis: NativeRecord | undefined) => NativeRecord) {
    const receipt = randomUUID()
    try {
      return await storage.write(async tx => {
        await tx.lockSentinel(`host-resource:${provider}:${key}`)
        const row = await query(tx, key).executeTakeFirst(),
          value = update(row && decode(row))
        if (value.resource.key !== key || value.resource.provider !== provider)
          throw new StorageDefect('Host update changed identity')
        const next: Row = {
          provider,
          resource_key: key,
          scope: value.scope,
          generation: value.generation,
          receipt,
          data: JSON.stringify(value),
        }
        const db = narrow<Tables>(tx)
        if (row)
          await db
            .updateTable('host_environment_resources')
            .set(next)
            .where('provider', '=', provider)
            .where('resource_key', '=', key)
            .execute()
        else await db.insertInto('host_environment_resources').values(next).execute()
        return value
      })
    } catch (error) {
      // Recognize only this exact committed write after an ambiguous return.
      const row = await storage.read(tx => query(tx, key).executeTakeFirst())
      if (row?.receipt === receipt) return decode(row)
      throw error
    }
  }
  return {
    load,
    change,
    async create(value: NativeRecord) {
      return change(value.resource.key, basis => {
        if (basis && writeJsonLossless(basis.resource) !== writeJsonLossless(value.resource))
          throw new StorageDefect('Host resource key reused')
        return basis ?? value
      })
    },
    async list(scope?: string) {
      return storage.read(async tx => {
        let selected = narrow<Tables>(tx)
          .selectFrom('host_environment_resources')
          .selectAll()
          .where('provider', '=', provider)
        if (scope !== undefined) selected = selected.where('scope', '=', scope)
        return (await selected.orderBy('resource_key').execute()).map(decode)
      })
    },
    async verify() {
      await storage.read(tx =>
        narrow<Tables>(tx)
          .selectFrom('host_environment_resources')
          .select('resource_key')
          .limit(0)
          .execute(),
      )
    },
  }
}
