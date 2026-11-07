import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  GovernanceScopeSchema,
  GovernanceIdSchema,
  type GovernanceScope,
  type GovernanceDefinitionSource,
  type GovernanceContributions,
} from '@omne-harness/governance-contract'
import type {
  ActingForTenantPrincipal,
  PrincipalVerifier,
  TenantStandingSource,
  StandingReservations,
} from '@omne-harness/identity'
import type { SqlStorage, DomainRef } from '@omne-harness/sql-contract'
import { GovernanceAdmission } from './admission.ts'
import type { AdmissionGrant } from './admission-schema.ts'
import { SqlOperationCoordinator } from './sql-coordinator.ts'
import {
  GovernanceStandingCoordinator,
  GovernanceStandingDestination,
} from './standing-coordinator.ts'
import { GovernanceScopeLifecycle } from './scope-lifecycle.ts'
import { GovernanceProviderLifetime } from './provider-lifetime.ts'
import { GovernanceContributionLifetime } from './contribution-lifetime.ts'
import { GovernanceContributionCleanup } from './contribution-cleanup.ts'
import { GovernanceRegistrar } from './registrar.ts'
import { createGovernanceCatalog } from './catalog.ts'
import type { CatalogCaptureOptions } from './catalog-capture.ts'
import {
  mutationCombinationSchema,
  type MutationCombination,
  type AdoptionProjection,
} from './registrar-execution.ts'

type Principal = ActingForTenantPrincipal
export type GovernanceLocalCoordination = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  metadata: MutationCombination
  destination: string
}>
export type GovernanceLocalOptions = GovernanceLocalCoordination &
  Readonly<{
    scope: GovernanceScope
    identity: Readonly<{
      verifier: PrincipalVerifier
      standing: TenantStandingSource
      reservations: StandingReservations
    }>
    grants: readonly AdmissionGrant[]
    definitions: GovernanceDefinitionSource
    combinations: Readonly<{
      mutation: MutationCombination
      adoption: MutationCombination
      catalog: MutationCombination
    }>
    current: Readonly<{ adoption: AdoptionProjection; catalog: CatalogCaptureOptions['current'] }>
    recoveryPagesPerPass: number
    closeTimeoutMs: number
  }>

export function createGovernanceLocalDestination(options: GovernanceLocalCoordination) {
  return new GovernanceStandingDestination(new SqlOperationCoordinator(options), {
    destination: GovernanceIdSchema.parse(options.destination),
    transactionDomain: options.domain.transactionDomain,
  })
}

async function recoverHistory(lifecycle: GovernanceScopeLifecycle, budget: number) {
  let cursor: Parameters<GovernanceScopeLifecycle['recoverHistoricalPage']>[0] = null
  let unsettled = 0
  for (let page = 0; page < budget; page++) {
    const result = await lifecycle.recoverHistoricalPage(cursor)
    if (result.kind !== 'page') return false
    unsettled += result.unsettled
    if (result.next === null) return unsettled === 0
    cursor = result.next
  }
  return false
}

function services(
  registrar: GovernanceRegistrar,
  catalog: ReturnType<typeof createGovernanceCatalog>,
  lifetime: GovernanceProviderLifetime,
): GovernanceContributions<Principal, Principal, Principal> {
  return Object.freeze<GovernanceContributions<Principal, Principal, Principal>>({
    contribute: (access, command) => lifetime.invoke(() => registrar.contribute(access, command)),
    withdraw: (access, command) => lifetime.invoke(() => registrar.withdraw(access, command)),
    adopt: (access, command) => lifetime.invoke(() => registrar.adopt(access, command)),
    readCatalog: (access, request) => lifetime.invoke(() => catalog(access, request)),
    queryOperation: (access, query) =>
      lifetime.invoke(() => registrar.queryOperation(access, query)),
  })
}

export async function createGovernanceRuntime(input: GovernanceLocalOptions) {
  const options = {
    ...input,
    scope: GovernanceScopeSchema.parse(input.scope),
    domain: structuredClone(input.domain),
    destination: GovernanceIdSchema.parse(input.destination),
    current: { ...input.current },
    closeTimeoutMs: z.number().int().min(0).max(60_000).parse(input.closeTimeoutMs),
    combinations: {
      mutation: mutationCombinationSchema.parse(input.combinations.mutation),
      adoption: mutationCombinationSchema.parse(input.combinations.adoption),
      catalog: mutationCombinationSchema.parse(input.combinations.catalog),
    },
  }
  const epoch = randomUUID()
  const sql = new SqlOperationCoordinator(options)
  const admission = new GovernanceAdmission({
    tenantRef: options.scope.tenantRef,
    ...options.identity,
    grants: options.grants,
  })
  const standing = new GovernanceStandingCoordinator(sql, options.identity.reservations)
  const lifecycle = new GovernanceScopeLifecycle({ ...options, epoch, sql, standing })
  const registrarOptions = {
    ...options,
    epoch,
    sql,
    standing,
    admission,
    transactionDomain: options.domain.transactionDomain,
    mutation: options.combinations.mutation,
    adoption: options.combinations.adoption,
    current: options.current.adoption,
  }
  const registrar = new GovernanceRegistrar(registrarOptions)
  const lifetime = new GovernanceProviderLifetime({
    lifecycle,
    stopAccepting: () => {
      registrar.stopAccepting()
      contributions.stopAccepting()
    },
    recoveryPagesPerPass: options.recoveryPagesPerPass,
  })
  const contributions = new GovernanceContributionLifetime({
    registrar: () => new GovernanceRegistrar(registrarOptions),
    invoke: call => lifetime.invoke(call),
    cleanup: new GovernanceContributionCleanup(sql, standing),
    closeTimeoutMs: options.closeTimeoutMs,
    retryDelayMs: 100,
    retryBatchSize: 8,
  })
  const catalog = createGovernanceCatalog({
    ...options,
    epoch,
    sql,
    standing,
    admission,
    combination: options.combinations.catalog,
    current: options.current.catalog,
    accepting: () => lifetime.accepting,
  })
  try {
    const previous = await lifecycle.observeEpoch()
    if (previous.kind !== 'epoch' || (await lifecycle.open(previous.epoch)).kind !== 'opened')
      return { kind: 'unavailable' as const, owner: 'governance-startup' }
    if (
      !(await recoverHistory(lifecycle, options.recoveryPagesPerPass)) ||
      (await lifecycle.open(previous.epoch)).kind !== 'opened'
    ) {
      await lifetime.close(options.closeTimeoutMs)
      return { kind: 'unavailable' as const, owner: 'governance-startup' }
    }
    return {
      kind: 'created' as const,
      epoch,
      service: services(registrar, catalog, lifetime),
      contributions,
      async close() {
        const [provider, callers] = await Promise.all([
          lifetime.close(options.closeTimeoutMs),
          contributions.close(),
        ])
        if (provider.kind !== 'closed') return provider
        return callers.kind === 'closed'
          ? provider
          : {
              kind: 'pending' as const,
              phase: 'contributions' as const,
              inFlight: contributions.pending,
            }
      },
    }
  } catch {
    await lifetime.close(options.closeTimeoutMs)
    return { kind: 'unavailable' as const, owner: 'governance-startup' }
  }
}

export async function createGovernanceLocal(input: GovernanceLocalOptions) {
  const runtime = await createGovernanceRuntime(input)
  if (runtime.kind !== 'created') return runtime
  return {
    kind: runtime.kind,
    epoch: runtime.epoch,
    service: runtime.service,
    close: runtime.close,
  }
}
