import { z } from 'zod'
import { goalReconcilingKey, goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { goalPersistenceParticipant, goalPolicySchema } from '@omne-harness/goal-local'
import { createGoalLocalPlugin } from '@omne-harness/goal-local/cordis'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
  type TenantDomains,
} from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { instantTextOf, runTimeOf } from '../../entry/time.ts'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { GOAL_COMPONENT } from '../authorization/grants.ts'
import { installRowGrant } from '../authorization/row-grants.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { createDomainBindings, type Combination } from '../storage/tenant-bindings.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { goalHolder } from './holder.ts'
import { createGoalAuthority, lateCalls, lateCards, lateSessions } from './ports.ts'

export const goalConfig = z.strictObject({ policy: goalPolicySchema })
const PARTICIPANTS = [goalPersistenceParticipant]

/** The storage combination of the goal participant, from the catalogue of the running code. */
export async function goalCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('goal combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-goal/${digest.slice(0, 16)}`, manifestDigest: digest }
}

export const goalRow = defineRow({
  row: 'goal',
  implementation: 'real',
  manifest: {
    provides: [goalsKey, goalReconcilingKey],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: goalConfig,
  async body(ctx, raw) {
    const { policy } = goalConfig.parse(raw)
    const logger = ctx.logger('goal')
    const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
    const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
    installRowGrant(ctx, GOAL_COMPONENT)
    const holder = goalHolder(ctx)
    const bindings = createDomainBindings<string>(
      {
        storage: ctx.get(storageKey) as SqlStorage,
        lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
        registration: () =>
          ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
        combination: goalCombination,
        listing: () => directory.enumerate({ principal: scanner }),
        report: (tenant, reason) =>
          logger.warn('no goal storage for tenant %s: %s', tenant, reason),
      },
      PARTICIPANTS,
      text => text,
    )
    const provider = ctx.plugin(createGoalLocalPlugin(), {
      policy,
      sql: bindings,
      ports: {
        authority: createGoalAuthority({ verifier: () => toolRuntimeHolder(ctx).verifier() }),
        sessions: lateSessions(holder),
        cards: lateCards(holder),
        calls: lateCalls(holder),
      },
      clock: { now: () => instantTextOf(ctx, 'goal') },
      timers: runTimeOf(ctx),
      report: error => logger.warn('goal work failed: %s', String(error)),
    })
    await provider.await()
    return {
      async stop() {
        await provider.dispose()
        return { kind: 'settled' }
      },
    }
  },
})
