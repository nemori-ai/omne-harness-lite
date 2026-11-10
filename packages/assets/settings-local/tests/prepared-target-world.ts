import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createStandaloneSettingsOwner } from '../src/index.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import { definition } from './world.ts'

type Action = 'set' | 'clear' | 'lock' | 'unlock'

/**
 * A prepared service over a real independent target. The target owner is the real standalone
 * owner; a value is written through preparation and commit. A test adds its own participants and
 * registers its own combinations over the same catalog.
 */
export async function openPreparedTargetWorld(
  options: {
    extraMaterials?: Partial<
      Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
    >
    /** The scope and the principal of a real Identity, when the test has one. */
    bound?: { scopeRef: string; principalRef: string }
    actions?: Action[]
    /** An existing database and its scope, to open the same world again. */
    reopen?: { root: string; scopeRef: string }
  } = {},
) {
  const w = await openPreparedServiceWorld(undefined, {
    sourceCapture: true,
    ...(options.extraMaterials ? { extraMaterials: options.extraMaterials } : {}),
    ...options.bound,
    ...options.reopen,
  })
  const { domain } = w.input.identity
  async function register(name: string, participants: string[]) {
    const manifest = combinationManifest({ catalog: w.world.materials, participants })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    const registration = {
      combinationVersion: `prepared-target-${name}/1`,
      manifestDigest: manifestDigest(manifest.manifest),
    }
    const result = await w.world.storage.registerCombination({
      ...domain,
      ...registration,
      participants,
    })
    if (result.kind !== 'registered') throw new Error(JSON.stringify(result))
    return registration
  }
  // The writers of the stored state and of the source gate, as the owner of a target needs them.
  const ownerParticipants = [
    ...w.world.participants.filter(
      name => name !== 'fixture.recovery-rollback' && name !== 'settings.source-finalization',
    ),
    'settings.source-snapshot',
    'settings.targets',
  ]
  const ownerOptions = {
    storage: w.world.storage,
    domain,
    ...(await register('owner', ownerParticipants)),
  }
  const owner = createStandaloneSettingsOwner(ownerOptions)
  const { target } = w.command
  const record = {
    publicationRef: null,
    target,
    definition,
    sources: w.input.plan.sources.map(({ sourceId, ownerRef, scope }) => ({
      sourceId,
      ownerRef,
      scope,
    })),
    grants: [{ sourceId: 'tenant', actions: options.actions ?? ['set', 'clear'] }],
  }
  let revision = 0
  return {
    service: w.service,
    /** The options of the service, for a test that builds its own service over the same world. */
    options: w.options,
    updateCurrent: w.updateCurrent,
    updateDefinition: w.updateDefinition,
    updateGrants: w.updateGrants,
    context: w.context,
    command: w.command,
    storage: w.world.storage,
    root: w.root,
    domain,
    target,
    owner,
    /** What `createStandaloneSettingsOwner` took, for a test that builds another owner. */
    ownerOptions,
    record,
    ownerParticipants,
    register,
    close: () => w.close(),
    /** The row counts of the stored states, the operations and the changes. */
    counts() {
      const database = new DatabaseSync(
        join(w.root, 'domains', `${Buffer.from(domain.transactionDomain).toString('hex')}.sqlite`),
        { readOnly: true },
      )
      try {
        return ['st_states', 'st_operations', 'st_changes'].map(table =>
          Number(database.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.['count']),
        )
      } finally {
        database.close()
      }
    },
    provision() {
      return owner.mutate({
        kind: 'provision',
        operationId: 'provision',
        expectedRevision: null,
        record,
      })
    },
    /** One change written through preparation and commit, on the revision of the last write. */
    async write(change: Partial<typeof w.command> = {}) {
      w.updateCurrent(current => ({
        ...current,
        basis: { ...current.basis, valueRevision: revision },
      }))
      const command = { ...w.command, expectedRevision: revision, ...change }
      const prepared = await w.service.prepareChange(w.context, command)
      if (prepared.kind !== 'prepared') return prepared
      const result = await w.service.commitChange(w.context, {
        requestId: `commit-${command.operationId}`,
        preparation: prepared.preparation,
      })
      if (result.kind === 'committed') revision = result.revision
      return result
    },
  }
}
