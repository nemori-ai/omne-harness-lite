import { Service, type Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createSessionTelemetry } from '@omne-harness/session'
import {
  SessionProvider,
  createSessionProviderPlugin,
  type SessionProviderConfig,
} from '@omne-harness/session-cordis/cordis'
import {
  SessionTenantSourceService,
  sessionAccessCheckKey,
  sessionDelegatedTransactionsKey,
  sessionKey,
  sessionPrincipalsKey,
  sessionTenantsKey,
  sessionWorkPrincipalsKey,
  type SessionTenantSource,
} from '@omne-harness/session-cordis-contract/cordis'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { S0_ASSEMBLY_LIFECYCLE_KEY } from '../../lifecycle.ts'
import { defineRow } from '../../row.ts'
import type { LifecycleHandle } from '../../types.ts'
import { processInstance } from '../telemetry/instance.ts'

type Registered = Pick<LifecycleHandle, 'phase' | 'row' | 'start' | 'stop'>

function collector(sink: { handle?: Registered }) {
  return class HandleCollector extends Service {
    constructor(ctx: Context) {
      super(ctx, S0_ASSEMBLY_LIFECYCLE_KEY)
    }
    register(handle: Registered): void {
      sink.handle = handle
    }
  }
}

export function deployedTenants(
  directory: TenantDomains<unknown>,
  scanner: unknown,
): SessionTenantSource['enumerate'] {
  return async () => {
    const listing = await directory.enumerate({ principal: scanner })
    if (listing.kind === 'denied')
      return { failure: { kind: 'denied', diagnostic: 'the scanner may not enumerate tenants' } }
    if (listing.kind === 'unavailable')
      return { failure: { kind: 'unavailable', diagnostic: listing.diagnostic } }
    const tenants: TenantId[] = []
    for (const entry of listing.entries) {
      const parsed = tenantCodec.parse(entry.tenant)
      if (!parsed.ok)
        return {
          failure: { kind: 'unavailable', diagnostic: 'a directory entry names no tenant' },
        }
      tenants.push(parsed.value)
    }
    return { ok: tenants }
  }
}

function tenantSource(enumerate: SessionTenantSource['enumerate']) {
  return class DeployedTenants extends SessionTenantSourceService {
    readonly enumerate = enumerate
  }
}

export const sessionProviderRealRow = defineRow({
  row: 'session-provider',
  implementation: 'real',
  manifest: {
    provides: [sessionKey],
    injects: [
      sessionAccessCheckKey,
      sessionDelegatedTransactionsKey,
      sessionPrincipalsKey,
      sessionWorkPrincipalsKey,
      telemetryKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'business' },
  Config: SessionProvider.Config,
  async body(ctx, config) {
    const telemetry = createSessionTelemetry(ctx.telemetry, { instance: processInstance })
    const Plugin = createSessionProviderPlugin({
      measure: telemetry.measure,
      diagnose: telemetry.diagnose,
    })
    const sink: { handle?: Registered } = {}
    const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown>
    const scanner: unknown = ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY)
    const scope = ctx.isolate(S0_ASSEMBLY_LIFECYCLE_KEY).isolate(sessionTenantsKey)
    await scope.plugin(collector(sink))
    await scope.plugin(tenantSource(deployedTenants(directory, scanner)))
    await scope.plugin(Plugin, config as SessionProviderConfig | undefined)
    if (sink.handle === undefined)
      throw new Error('the session provider registered no shutdown handle')
    return {
      start: async () => {
        await sink.handle?.start?.()
      },
      stop: deadline => {
        const live = sink.handle
        return live === undefined
          ? Promise.resolve({ kind: 'settled' as const })
          : live.stop(deadline)
      },
    }
  },
})
