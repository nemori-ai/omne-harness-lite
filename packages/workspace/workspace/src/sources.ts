import type { Access, WorkspaceId } from '@omne-harness/legal-identity'
import {
  decide,
  standingOf,
  type InstanceId,
  type SourceAdoption,
  type SourceDigests,
  type SourceEntry,
  type SourceFile,
  type SourceFileAt,
  type SourceFiles,
  type SourcePackage,
  type SourceReading,
  type WorkspaceSources,
} from '@omne-harness/workspace-contract'
import type { WorkspaceDependencies } from './dependencies.ts'
import {
  admitted,
  NOT_PERMITTED,
  tenantText,
  unavailable,
  workspaceText,
  type Blocked,
} from './gate.ts'
import { createInstances } from './instances.ts'
import { directoryOfRoot, readSources } from './source-reading.ts'
import type { SourcesRead, StoredAdoption } from './transactions/sources.ts'

export type SourcesDependencies<P> = WorkspaceDependencies<P> &
  Readonly<{ files: SourceFiles; digests: SourceDigests }>

type Named = Readonly<{ tenant: string; workspace: string }>

function adoptionOf(workspace: WorkspaceId, stored: StoredAdoption): SourceAdoption {
  const { adoption, reading } = stored
  const read: SourceReading = {
    workspace,
    instance: reading?.instance ?? adoption.instance,
    revision: adoption.revision,
    packages: reading?.packages ?? [],
  }
  return { kind: 'adopted', reading: read, fresh: adoption.fresh, reason: adoption.reason }
}

type FileIn = Readonly<{ instance: InstanceId; pkg: SourcePackage; entry: SourceEntry }>

/** The file of a package of the reading the key points at, as it was recorded. */
function fileIn(stored: StoredAdoption | null, at: SourceFileAt): FileIn | null {
  const reading = stored?.reading ?? null
  if (reading === null) return null
  const pkg = reading.packages.find(
    item => item.category === at.category && item.name === at.name && item.root === at.root,
  )
  const entry = pkg?.entries.find(item => item.path === at.path && item.digest === at.digest)
  return pkg === undefined || entry === undefined
    ? null
    : { instance: reading.instance, pkg, entry }
}

/** The bytes of the file now, when they are still the ones recorded. */
async function bytesOf(
  ports: Pick<SourcesDependencies<unknown>, 'files' | 'digests'>,
  directory: string,
  { pkg, entry }: FileIn,
): Promise<SourceFile> {
  const path = [directoryOfRoot(pkg.root), pkg.namespace, pkg.name, ...entry.path.split('/')]
  const read = await ports.files.file(directory, path, entry.bytes)
  if (read.kind === 'unreadable') return unavailable('files')
  if (read.kind !== 'bytes') return { kind: 'changed' }
  return ports.digests.file(read.bytes) === entry.digest ? read : { kind: 'changed' }
}

/** The source roots of instances: read once for a key, recorded, and checked again on each read. */
export function createSources<P>(deps: SourcesDependencies<P>): WorkspaceSources<P> {
  const instances = createInstances(deps)

  /** Every read asks again: a relation that ended reads nothing, whatever was recorded before. */
  async function related(access: Access<P>, workspace: WorkspaceId): Promise<Named | Blocked> {
    const tenant = tenantText(access)
    const text = workspaceText(workspace)
    if (tenant === null || text === null) return NOT_PERMITTED
    const blocked = await admitted(deps.authority, access, 'workspace.attach', text)
    if (blocked !== null) return blocked
    const state = await deps.store.state(tenant, text)
    if (state.kind === 'unavailable') return unavailable('store')
    if (state.value === null || decide(standingOf(state.value.relation), 'attach') !== 'allow')
      return NOT_PERMITTED
    return { tenant, workspace: text }
  }

  async function recorded(
    access: Access<P>,
    workspace: WorkspaceId,
    key: string,
  ): Promise<Readonly<{ named: Named; stored: StoredAdoption | null }> | Blocked> {
    const named = await related(access, workspace)
    if ('kind' in named) return named
    const found = await deps.store.adoption(named.tenant, named.workspace, key)
    return found.kind === 'read' ? { named, stored: found.value } : unavailable('store')
  }

  async function sourcesOf(
    access: Access<P>,
    input: Parameters<WorkspaceSources<P>['adopt']>[1],
  ): Promise<SourcesRead | Blocked> {
    const verified = await instances.verify(access, input)
    if (verified.kind === 'not-permitted' || verified.kind === 'unavailable') return verified
    if (verified.kind === 'instance-unavailable')
      return { kind: 'kept', reason: `the instance cannot be used now: ${verified.reason}` }
    const read = await readSources(deps, verified.directory, input.layouts)
    return 'unreadable' in read
      ? { kind: 'kept', reason: read.unreadable }
      : { kind: 'read', packages: read.packages }
  }

  return {
    async adopt(access, input) {
      const found = await recorded(access, input.workspace, input.key)
      if ('kind' in found) return found
      if (found.stored !== null) return adoptionOf(input.workspace, found.stored)
      const read = await sourcesOf(access, input)
      if (read.kind === 'not-permitted' || read.kind === 'unavailable') return read
      const committed = await deps.store.adopt({
        ...found.named,
        key: input.key,
        instance: input.instance,
        read,
      })
      // An unknown answer is taken back by the same key: the next adoption of it reads the record.
      if (committed.kind !== 'committed') return unavailable('store')
      const result = committed.value
      return result.kind === 'adopted' ? adoptionOf(input.workspace, result) : NOT_PERMITTED
    },

    async adopted(access, input) {
      const found = await recorded(access, input.workspace, input.key)
      if ('kind' in found) return found
      return found.stored === null ? { kind: 'none' } : adoptionOf(input.workspace, found.stored)
    },

    async open(access, input): Promise<SourceFile> {
      const found = await recorded(access, input.workspace, input.key)
      if ('kind' in found) return found
      const file = fileIn(found.stored, input.at)
      if (file === null) return { kind: 'not-found' }
      const { workspace } = input
      const verified = await instances.verify(access, { workspace, instance: file.instance })
      if (verified.kind === 'not-permitted' || verified.kind === 'unavailable') return verified
      // The instance it was read from is gone: what was adopted cannot be read as it was.
      if (verified.kind !== 'attachable') return { kind: 'changed' }
      return bytesOf(deps, verified.directory, file)
    },
  }
}
