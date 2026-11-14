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

export async function openPreparedTargetWorld(
  options: {
    extraMaterials?: Partial<
      Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
    >
    bound?: { scopeRef: string; principalRef: string }
    actions?: Action[]
    reopen?: { root: string; scopeRef: string }
  } = {},
) {
  const w = await openPreparedServiceWorld(undefined, {
    withTargets: true,
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
    ownerOptions,
    record,
    ownerParticipants,
    register,
    close: () => w.close(),
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
