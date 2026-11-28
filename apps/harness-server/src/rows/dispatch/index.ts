import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  instantSchema,
  tenantIdSchema,
  type Instant,
  type TenantId,
} from '@omne-harness/dispatch-contract'
import {
  dispatchReconcilingKey,
  dispatchingKey,
} from '@omne-harness/dispatch-cordis-contract/cordis'
import { dispatchPersistenceParticipant, dispatchPolicySchema } from '@omne-harness/dispatch-local'
import { createDispatchLocalPlugin } from '@omne-harness/dispatch-local/cordis'
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
import { DISPATCH_PRINCIPAL_KEY } from '../../entry/dispatch-principal.ts'
import { instantTextOf, runTimeOf } from '../../entry/time.ts'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { agentDefinitionCatalogKey } from '../agent-adoptions/definition-catalog.ts'
import { DISPATCH_COMPONENT } from '../authorization/grants.ts'
import { installRowGrant } from '../authorization/row-grants.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { createDomainBindings, type Combination } from '../storage/tenant-bindings.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { dispatchHolder } from './holder.ts'
import {
  lateCopies,
  createDispatchAuthority,
  definitionsOf,
  lateSessions,
  lateWaits,
} from './ports.ts'

export const dispatchConfig = z.strictObject({ policy: dispatchPolicySchema })
const PARTICIPANTS = [dispatchPersistenceParticipant]

const nowOf = (ctx: Context) => (): Instant => instantSchema.parse(instantTextOf(ctx, 'dispatch'))

/** The storage combination of the dispatch participant, from the catalogue of the running code. */
export async function dispatchCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('dispatch combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-dispatch/${digest.slice(0, 16)}`, manifestDigest: digest }
}

export const dispatchRow = defineRow({
  row: 'dispatch',
  implementation: 'real',
  manifest: {
    provides: [dispatchingKey, dispatchReconcilingKey],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      DISPATCH_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: dispatchConfig,
  async body(ctx, raw) {
    const { policy } = dispatchConfig.parse(raw)
    const logger = ctx.logger('dispatch')
    const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
    const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
    const system: unknown = ctx.get(DISPATCH_PRINCIPAL_KEY)
    installRowGrant(ctx, DISPATCH_COMPONENT)
    const holder = dispatchHolder(ctx)
    const bindings = createDomainBindings<TenantId>(
      {
        storage: ctx.get(storageKey) as SqlStorage,
        lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
        registration: () =>
          ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
        combination: dispatchCombination,
        listing: () => directory.enumerate({ principal: scanner }),
        report: (tenant, reason) =>
          logger.warn('no dispatch storage for tenant %s: %s', tenant, reason),
      },
      PARTICIPANTS,
      text => tenantIdSchema.parse(text),
    )
    const provider = ctx.plugin(createDispatchLocalPlugin(), {
      policy,
      sql: bindings,
      ports: {
        authority: createDispatchAuthority({
          verifier: () => toolRuntimeHolder(ctx).verifier(),
          system: () => system,
        }),
        sessions: lateSessions(holder),
        waits: lateWaits(holder),
        copies: lateCopies(holder),
        definitions: definitionsOf(
          () => ctx.get(agentDefinitionCatalogKey),
          () => holder.turns,
        ),
      },
      clock: { now: nowOf(ctx) },
      timers: runTimeOf(ctx),
      report: error => logger.warn('dispatch work failed: %s', String(error)),
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
