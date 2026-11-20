import type { InstanceId, SourcePackage } from '@omne-harness/workspace-contract'
import type { AdoptionRecord, ReadingRecord, WorkspaceTxn } from '../txn.ts'

/** What was read outside the transaction: the packages, or why none could be read now. */
export type SourcesRead =
  | Readonly<{ kind: 'read'; packages: readonly SourcePackage[] }>
  | Readonly<{ kind: 'kept'; reason: string }>

export type AdoptCommand = Readonly<{
  tenant: string
  workspace: string
  key: string
  instance: InstanceId
  read: SourcesRead
}>

/** An adoption and the reading it points at; no reading when it points at the empty one. */
export type StoredAdoption = Readonly<{ adoption: AdoptionRecord; reading: ReadingRecord | null }>

export type AdoptResult =
  | Readonly<{ kind: 'adopted' } & StoredAdoption>
  | Readonly<{ kind: 'not-permitted' }>

const sameReading = (
  latest: ReadingRecord,
  instance: InstanceId,
  packages: readonly SourcePackage[],
) => latest.instance === instance && JSON.stringify(latest.packages) === JSON.stringify(packages)

// One commit for one key: a key recorded before answers what it was given then. A reading that
// could not be made keeps the last one, or the empty one.
export function adoptSources(txn: WorkspaceTxn, command: AdoptCommand): AdoptResult {
  const { workspace, tenant, key, instance, read } = command
  if (txn.relation(workspace, tenant) === null) return { kind: 'not-permitted' }
  const recorded = txn.adoption(workspace, tenant, key)
  if (recorded !== null)
    return {
      kind: 'adopted',
      adoption: recorded,
      reading: recorded.revision === 0 ? null : txn.reading(workspace, tenant, recorded.revision),
    }
  const reading = readingFor(txn, command)
  const adoption: AdoptionRecord = {
    workspace,
    tenant,
    key,
    instance,
    revision: reading?.revision ?? 0,
    fresh: read.kind === 'read',
    reason: read.kind === 'kept' ? read.reason : null,
  }
  txn.insertAdoption(adoption)
  return { kind: 'adopted', adoption, reading }
}

/** The last reading, unless a new one was read that differs: that one is recorded and counted. */
function readingFor(txn: WorkspaceTxn, command: AdoptCommand): ReadingRecord | null {
  const { workspace, tenant, instance, read } = command
  const latest = txn.latestReading(workspace, tenant)
  if (read.kind === 'kept' || (latest !== null && sameReading(latest, instance, read.packages)))
    return latest
  txn.bumpSource(workspace, tenant)
  const revision = txn.sourceRevision(workspace, tenant)
  const reading = { workspace, tenant, revision, instance, packages: read.packages }
  txn.insertReading(reading)
  return reading
}
