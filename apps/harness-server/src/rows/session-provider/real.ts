// The `session-provider` row as the real Session provider (`implementation: 'real'`): the plugin
// of `SessionProvider` of `@omne-harness/session-cordis/cordis`, which provides `session`, the four
// faces and the coordinator and scheduler behind them.
//
// Telemetry. The row injects `telemetry` (D04: required, so a tree without the row does not serve)
// and builds the Session telemetry facade over it in the row body: `measure` turns each face
// operation into a segment `omne.session.<operation>` and each `run.terminal` this Session instance
// commits into the event `omne.session.round-complete` (a terminal that `session-ad02` commits from
// Agent facts emits none, Session SPEC「测量事件」), `diagnose` turns a coordinator step that stopped on a failure into
// the event `omne.session.diagnostic` (no detail text). Every record is scoped to the tenant of the
// access and names the session as its work. The plugin factory hands the two observers to the
// Session instance; the member does not know the telemetry key.
//
// Shutdown. The plugin registers its own handle (row `session-provider`, phase `business`) in the
// plugin body, from the private service `s0.assemblyLifecycle`. `defineRow` gives a phased row only
// two carriers (a row body or an entry object) and registers the handle itself, so a plugin that
// registers by itself cannot be wrapped as it stands: its literal `inject` carries the private key,
// which a manifest may not name, and a second registration for the row would be refused as a
// duplicate. This row therefore uses the row body. The body loads the plugin in a child scope where
// `s0.assemblyLifecycle` is a one-handle collector, takes the handle the plugin registered there,
// and returns it as the handle of the row. `defineRow` registers that one handle on the row fiber,
// so the ordered shutdown has one `business` handle for the row, and the plugin itself is unchanged.
// A later generation of the plugin registers a new handle in the same collector; the row's handle
// follows the latest one, so a change of one of the plugin's providers re-runs the plugin without
// the registry reading it as a second registration of the row.
//
// Startup scan. The plugin binds a recovery scanner for each tenant of the deployment when the
// ordered start reaches the row (session-cordis SPEC property 7). The row gives it the tenants:
// it injects `tenantDomains` and the entry object `tenantDomainScannerPrincipal`, and provides
// `sessionTenants` in the child scope only, so the plugin holds no principal and no storage type,
// and no other row sees the key.
//
// The manifest equals the `session-provider` row of `src/s0/stubs.ts`, phase `business` included.
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

/** The one-handle collector that stands in for `s0.assemblyLifecycle` inside the plugin's scope. */
function collector(sink: { handle?: Registered }) {
  return class HandleCollector extends Service {
    constructor(ctx: Context) {
      super(ctx, S0_ASSEMBLY_LIFECYCLE_KEY)
    }
    register(handle: Registered): void {
      // A new generation of the plugin registers again; the latest handle is the live one.
      sink.handle = handle
    }
  }
}

/**
 * The tenants of the deployment, from the tenant directory asked as the scanner of the deployment.
 * A directory that does not answer, or an entry whose text names no tenant, is a failure: the
 * startup scan then covers no tenant from here, and the plugin says so.
 */
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
      // The ordered start reaches the plugin through the row's handle: the plugin scans the
      // tenants of the deployment there.
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
