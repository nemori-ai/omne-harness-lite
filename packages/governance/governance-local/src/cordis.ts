import { CordisError, type Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  principalVerifierKey,
  tenantStandingKey,
  standingReservationsKey,
} from '@omne-harness/identity/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { GovernanceContributionsService } from '@omne-harness/governance-contract/cordis'
import type { GovernanceContributions } from '@omne-harness/governance-contract'
import { createGovernanceRuntime, type GovernanceLocalOptions } from './provider.ts'
import type { GovernanceProviderClose } from './provider-lifetime.ts'
import { retainGovernanceShutdown } from './cordis-shutdown.ts'

type Principal = ActingForTenantPrincipal
type Services = GovernanceContributions<Principal, Principal, Principal>
type Runtime = Extract<Awaited<ReturnType<typeof createGovernanceRuntime>>, { kind: 'created' }>
export type GovernanceLocalConfiguration<ReadContext = Principal, WriteContext = Principal> = Omit<
  GovernanceLocalOptions<ReadContext, WriteContext>,
  'storage' | 'identity'
> &
  Readonly<{
    observeClose: (report: GovernanceProviderClose) => void | Promise<void>
  }>

class LocalGovernanceService extends GovernanceContributionsService<
  Principal,
  Principal,
  Principal
> {
  readonly contribute: Services['contribute']
  readonly withdraw: Services['withdraw']
  readonly adopt: Services['adopt']
  readonly readCatalog: Services['readCatalog']
  readonly queryOperation: Services['queryOperation']

  constructor(ctx: Context, runtime: Pick<Runtime, 'service' | 'contributions'>) {
    super(ctx)
    this.contribute = function (this: LocalGovernanceService, access, command) {
      const caller = this.ctx
      return runtime.contributions
        .contribute(
          dispose => {
            caller.effect(
              () => async () => {
                const outcome = await dispose()
                if (outcome.kind === 'pending')
                  caller.logger.warn('Governance contribution cleanup remains pending')
              },
              'governance-contribution',
            )
          },
          access,
          command,
        )
        .catch(error => {
          if (error instanceof CordisError && error.code === 'INACTIVE_EFFECT')
            return { kind: 'unavailable' as const, owner: 'governance-caller' }
          throw error
        })
    }
    this.withdraw = runtime.service.withdraw
    this.adopt = runtime.service.adopt
    this.readCatalog = runtime.service.readCatalog
    this.queryOperation = runtime.service.queryOperation
  }
}

export function createGovernanceLocalPlugin<ReadContext = Principal, WriteContext = Principal>() {
  return {
    name: 'governance-local',
    inject: [storageKey, principalVerifierKey, tenantStandingKey, standingReservationsKey],
    async apply(ctx: Context, config: GovernanceLocalConfiguration<ReadContext, WriteContext>) {
      let closing = false
      let close: ReturnType<typeof retainGovernanceShutdown> | undefined
      ctx.effect(
        () => async () => {
          closing = true
          await close?.()
        },
        'governance-provider',
      )
      const runtime = await createGovernanceRuntime({
        ...config,
        storage: ctx.storage,
        identity: {
          verifier: ctx.principalVerifier,
          standing: ctx.tenantStanding,
          reservations: ctx.standingReservations,
        },
      })
      if (runtime.kind !== 'created') throw new Error('Governance startup unavailable')
      close = retainGovernanceShutdown({
        close: runtime.close,
        observe: config.observeClose,
        onError: error => ctx.logger.error('Governance shutdown failed; cleanup retained', error),
      })
      if (closing || ctx.fiber.uid === null) {
        await close()
        return
      }
      try {
        new LocalGovernanceService(ctx, runtime)
      } catch (error) {
        await close()
        throw error
      }
    },
  }
}
