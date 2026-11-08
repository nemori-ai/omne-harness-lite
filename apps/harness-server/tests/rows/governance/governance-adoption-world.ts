import { randomUUID } from 'node:crypto'
import { settingsValueProjectionMaterials } from '@omne-harness/settings-local'
import type { FactCommandV2, SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  targetSnapshotParticipant,
  targetSnapshotCommands,
  targetSnapshotSchema,
  TARGET_SNAPSHOT,
} from '../../../dist/rows/governance/target-snapshot.js'
import { Context } from '@deepseek-ai/cordis'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type StandingDestinationResolver,
} from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  standingDestinationResolverKey,
} from '@omne-harness/identity/cordis'
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import { IdentitySqlPlugin } from '@omne-harness/identity-sql/cordis'
import { access, tenantCodec } from '@omne-harness/legal-identity'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { combinationManifest, manifestDigest, type SqlStorage } from '@omne-harness/sql-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import {
  createGovernanceLocal,
  createGovernanceLocalDestination,
  governanceSqlMaterials,
  governanceTargetProjectionCommand,
  governanceTargetProjectionParticipant,
  GovernanceTargetProjectionSchema,
  type GovernanceTargetBinding,
  type GovernancePermissionOptions,
  type PermissionProjection,
  type GovernanceLocalOptions,
  type GovernanceExternalWriteOptions,
} from '@omne-harness/governance-local'
import {
  governanceCatalogCurrentParticipant,
  governanceCatalogProjection,
} from '../../../dist/rows/governance/catalog-current.js'
import { createGovernanceAdoptionProjection } from '../../../dist/rows/governance/adoption-current.js'
import { createToolGovernanceDefinitionSource } from '../../../src/rows/governance/tool-definition-source.ts'
import { toolAssetsWorld } from './tool-assets-world.ts'
import type { SessionPermissionWriteContext } from '../../../src/rows/governance/session-permission-commit.ts'
import { releaseIdentityConfig } from '../identity/fixtures.ts'

export async function governanceAdoptionWorld(
  options: {
    sessionWork?: string
    release?: NonNullable<Parameters<typeof toolAssetsWorld>[1]>['release']
    releaseParticipant?: NonNullable<Parameters<typeof toolAssetsWorld>[1]>['releaseParticipant']
    sourceReservations?: GovernanceLocalOptions['sourceReservations']
    preparedSettings?: boolean
    extraParticipants?: SqlMaterialCatalog['participants']
    extraMigrations?: SqlMaterialCatalog['migrations']
    extraReadHandlers?: SqlMaterialCatalog['readHandlers']
    externalWrites?: (input: {
      register: (
        name: string,
        participants: string[],
      ) => Promise<PermissionProjection['combination']>
      snapshotParticipants: string[]
      scope: import('@omne-harness/governance-contract').GovernanceScope
    }) => Promise<GovernanceExternalWriteOptions<SessionPermissionWriteContext>>
    permission?: (input: {
      register: (
        name: string,
        participants: string[],
      ) => Promise<PermissionProjection['combination']>
      snapshotParticipants: string[]
      declaration: import('@omne-harness/governance-contract').GovernanceDefinitionBundle
      target: GovernanceTargetBinding['target']
    }) => Promise<GovernancePermissionOptions>
  } = {},
) {
  const ctx = new Context()
  const authority = inProcessPrincipalAuthority()
  const identity = identitySqlMaterials(),
    governance = governanceSqlMaterials()
  const instant = parseInstant('2026-11-07T00:00:00Z')
  if (!instant.ok) throw new Error('test instant')
  let principal: ActingForTenantPrincipal | undefined
  let destination: ReturnType<typeof createGovernanceLocalDestination> | undefined
  let settingsDestination: StandingDestinationResolver | undefined
  let catalogDestination: StandingDestinationResolver | undefined
  let disposeIdentity: (() => Promise<void>) | undefined
  const w = await toolAssetsWorld(undefined, {
    preparedSettings: options.preparedSettings ?? false,
    ...(options.release === undefined ? {} : { release: options.release }),
    ...(options.releaseParticipant === undefined
      ? {}
      : { releaseParticipant: options.releaseParticipant }),
    extraMaterials: {
      participants: [
        ...identity.participants,
        ...governance.participants,
        governanceCatalogCurrentParticipant(),
        ...settingsValueProjectionMaterials(),
        targetSnapshotParticipant(),
        ...(options.extraParticipants ?? []),
      ],
      migrations: [
        ...identity.migrations,
        ...governance.migrations,
        ...(options.extraMigrations ?? []),
      ],
      readHandlers: [
        ...identity.readHandlers,
        ...governance.readHandlers,
        ...(options.extraReadHandlers ?? []),
      ],
    },
    async initialize(storage) {
      const base = await ctx.plugin({
        name: 'governance-identity-inputs',
        apply(scope) {
          scope.provide(storageKey, storage)
          scope.provide(identityClockKey, {
            now: async () => ({ kind: 'read', instant: instant.value }),
          })
          scope.provide(principalVerifierKey, authority.verifier)
          scope.provide(standingDestinationResolverKey, {
            seal: (reservation: Parameters<StandingDestinationResolver['seal']>[0]) =>
              reservation.binding.destination === 'settings.catalog' && catalogDestination
                ? catalogDestination.seal(reservation)
                : reservation.binding.destination === 'settings.preparation' && settingsDestination
                  ? settingsDestination.seal(reservation)
                  : destination === undefined
                    ? Promise.resolve({ kind: 'unavailable', diagnostic: 'destination-not-ready' })
                    : destination.seal(reservation),
          })
        },
      })
      const provider = await ctx.plugin(IdentitySqlPlugin, releaseIdentityConfig())
      disposeIdentity = async () => {
        await provider.dispose()
        await base.dispose()
      }
      const registered = await ctx.identityOperations.registerAndActivate({
        loginIdentifier: 'governance-user',
        credential: 'test-secret',
      })
      if (registered.kind !== 'succeeded') throw new Error(JSON.stringify(registered))
      const actor = authority.issuer.issueSystem({
        component:
          options.sessionWork === undefined ? 'tool-governance-test' : 'sessionWorkPrincipals',
      })
      if (!('ok' in actor)) throw new Error('system principal')
      const issued = authority.issuer.issueActingForTenant({
        actor: actor.ok,
        tenant: registered.tenant,
        work:
          options.sessionWork === undefined
            ? { owner: 'governance', work: 'adoption' }
            : { owner: 'session', work: options.sessionWork },
      })
      if (!('ok' in issued)) throw new Error('work principal')
      principal = issued.ok
      const encoded = tenantCodec.encode(registered.tenant)
      if (!encoded.ok) throw new Error('tenant encoding')
      return encoded.value
    },
  })
  if (principal === undefined) throw new Error('principal not issued')
  const principalRef = standingPrincipalRef(principal)
  const scope = {
    tenantRef: w.domain.scope.tenant,
    deploymentId: 'test',
    logicalServiceId: 'tools',
    visibility: { kind: 'tenant' as const, tenantRef: w.domain.scope.tenant },
  }
  async function register(name: string, participants: string[]) {
    const checked = combinationManifest({ catalog: w.materials, participants })
    if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
    const combination = {
      ...w.domain,
      participants,
      combinationVersion: `test-governance-${name}/1`,
      manifestDigest: manifestDigest(checked.manifest),
    }
    const registered = await w.storage.registerCombination(combination)
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    return {
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
    }
  }
  const metadata = await register('metadata', ['governance.metadata-plan', 'governance.activation'])
  const mutation = await register('mutation', ['governance.mutation-plan', 'governance.activation'])
  const adoption = await register('adoption', [
    ...w.combination.participants,
    'governance.adoption-plan',
    'governance.activation',
  ])
  const catalog = await register('catalog', [
    ...w.combination.participants.filter(value => value !== 'harness.governance-current'),
    'harness.governance-catalog-current',
    'governance.catalog-snapshot',
    'governance.activation',
  ])
  const targetProjection = await register('target-projection', [
    'governance.metadata-plan',
    'governance.activation',
    governanceTargetProjectionParticipant.participant,
  ])
  const snapshotParticipants = [
    ...w.combination.participants,
    'governance.metadata-plan',
    'governance.activation',
    governanceTargetProjectionParticipant.participant,
    'settings.value-projection',
    TARGET_SNAPSHOT.participant,
  ]
  const snapshot = await register('target-snapshot', snapshotParticipants)
  const failures: unknown[] = []
  const observedStorage: SqlStorage = {
    registerCombination: input => w.storage.registerCombination(input),
    commit: async (...args) => {
      const result = await w.storage.commit(...args)
      if (result.kind !== 'committed') failures.push(result)
      return result
    },
    query: input => w.storage.query(input),
    read: async (...args) => {
      const result = await w.storage.read(...args)
      if (result.kind !== 'read') failures.push(result)
      return result
    },
  }
  const coordination = {
    storage: observedStorage,
    domain: w.domain,
    metadata,
    destination: 'governance-contributions',
  }
  destination = createGovernanceLocalDestination(coordination)
  const declaration = w.entry.governance.declaration
  const made = await createGovernanceLocal<ActingForTenantPrincipal, SessionPermissionWriteContext>(
    {
      ...(options.externalWrites === undefined
        ? {}
        : {
            externalWrites: await options.externalWrites({ register, snapshotParticipants, scope }),
          }),
      ...coordination,
      ...(options.sourceReservations === undefined
        ? {}
        : { sourceReservations: options.sourceReservations }),
      ...(options.permission === undefined
        ? {}
        : {
            permission: await options.permission({
              register,
              snapshotParticipants,
              declaration,
              target: w.target,
            }),
          }),
      scope,
      identity: {
        verifier: authority.verifier,
        standing: ctx.tenantStanding,
        reservations: ctx.standingReservations,
      },
      grants: [
        {
          principalRef,
          scope,
          action: 'contribute',
          required: [],
          owners: [
            {
              ownerId: declaration.reference.ownerId,
              enforcementBindings: declaration.enforcementBindings,
            },
          ],
        },
        ...(
          ['adopt', 'withdraw', 'operation-read', 'catalog-management', 'catalog-runtime'] as const
        ).map(action => ({
          principalRef,
          scope,
          action,
          required: [],
        })),
      ],
      definitions: createToolGovernanceDefinitionSource(() => w.release),
      combinations: { mutation, adoption, catalog },
      current: {
        adoption: createGovernanceAdoptionProjection(w.domain.transactionDomain),
        catalog: governanceCatalogProjection,
      },
      recoveryPagesPerPass: 4,
      closeTimeoutMs: 3000,
    },
  )
  if (made.kind !== 'created') {
    await disposeIdentity?.()
    await w.close()
    throw new Error(JSON.stringify({ made, failures }))
  }
  return {
    ...w,
    coordination,
    service: made.service,
    externalWrites: made.externalWrites,
    issuer: authority.issuer,
    identityOperations: ctx.identityOperations,
    identityGovernance: ctx.identityGovernance,
    permissionBasis: made.permissionBasis,
    scope,
    declaration,
    access: access(principal, principal.tenant),
    principal,
    principalRef,
    identity: {
      verifier: authority.verifier,
      standing: ctx.tenantStanding,
      reservations: ctx.standingReservations,
    },
    register,
    snapshotParticipants,
    setSettingsCatalogDestination(resolver: StandingDestinationResolver) {
      catalogDestination = resolver
    },
    setSettingsDestination(resolver: StandingDestinationResolver) {
      settingsDestination = resolver
    },
    async captureTarget(
      epoch: string,
      mode: 'management' | 'runtime' = 'runtime',
      patch: Partial<GovernanceTargetBinding> = {},
    ) {
      const binding: GovernanceTargetBinding = {
        scope,
        epoch,
        mode,
        principalRef,
        captureId: randomUUID(),
        transactionDomain: w.domain.transactionDomain,
        definition: declaration.reference,
        target: w.target,
        ...patch,
      }
      const result = await w.storage.commit({
        identity: {
          ...w.domain,
          operation: 'test.governance-target',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        ...targetProjection,
        commands: [governanceTargetProjectionCommand(binding)],
      })
      if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
      return GovernanceTargetProjectionSchema.parse(
        result.responses.find(
          value => value.participant === governanceTargetProjectionParticipant.participant,
        )?.reply.response,
      )
    },
    async captureSnapshot(
      epoch: string,
      mode: 'management' | 'runtime' = 'runtime',
      transform?: (commands: readonly FactCommandV2[]) => readonly FactCommandV2[],
    ) {
      const binding: GovernanceTargetBinding = {
        scope,
        epoch,
        mode,
        principalRef,
        captureId: randomUUID(),
        transactionDomain: w.domain.transactionDomain,
        definition: declaration.reference,
        target: w.target,
      }
      const commands = targetSnapshotCommands(binding)
      const result = await w.storage.commit({
        identity: {
          ...w.domain,
          operation: 'test.governance-snapshot',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        ...snapshot,
        commands: transform ? transform(commands) : commands,
      })
      return result.kind === 'committed'
        ? targetSnapshotSchema.parse(
            result.responses.find(value => value.participant === TARGET_SNAPSHOT.participant)?.reply
              .response,
          )
        : result
    },
    async close() {
      const closed = await made.close()
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
      await disposeIdentity?.()
      await w.close()
    },
  }
}
