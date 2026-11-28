import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createMcpAuthorization, type McpAuthorization } from '@omne-harness/mcp-authorization'
import type {
  AuthorizationRecords,
  CallbackReceiver,
  GrantConnector,
  GrantKey,
} from '@omne-harness/mcp-contract/provider'
import {
  CallbackReceiverService,
  GrantConnectorService,
  mcpAuthorizationRecordsKey,
} from '@omne-harness/mcp-cordis-contract/cordis'
import { createOAuthFetch } from '@omne-harness/mcp-host-local'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'
import { createCallbackReceiver } from './callback-receiver.ts'
import { endpointItemKey } from './credential.ts'
import { createGrantSecrets } from './grant-secrets.ts'

export type McpOAuthConfig = Readonly<{
  callbackPort: number
  pendingMs: number
  refreshLeadMs: number
  requestMs: number
}>

const away = () => Promise.resolve(fail('unavailable' as const))

// The records are read at each call: while the storage row is away the answer is unavailable.
function recordsOf(ctx: Context): AuthorizationRecords {
  const port = () => ctx.get(mcpAuthorizationRecordsKey, false)
  return {
    begin: pending => port()?.begin(pending) ?? away(),
    take: (tenant, state) => port()?.take(tenant, state) ?? away(),
    void: key => port()?.void(key) ?? away(),
    read: key => port()?.read(key) ?? away(),
    write: (key, facts, expected) => port()?.write(key, facts, expected) ?? away(),
    remove: key => port()?.remove(key) ?? away(),
    registration: (tenant, issuer) => port()?.registration(tenant, issuer) ?? away(),
    register: (tenant, issuer, registration) =>
      port()?.register(tenant, issuer, registration) ?? away(),
  }
}

async function tenantsOf(ctx: Context): Promise<Outcome<readonly TenantId[], 'unavailable'>> {
  const directory = ctx.get(tenantDomainsKey, false) as TenantDomains<unknown> | undefined
  const listed = await directory
    ?.enumerate({ principal: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY) })
    .catch(() => undefined)
  if (listed?.kind !== 'ready') return fail('unavailable')
  return succeed(
    listed.entries.flatMap(entry => {
      const tenant = tenantCodec.parse(entry.tenant)
      return tenant.ok ? [tenant.value] : []
    }),
  )
}

/** The client secret the person set on the endpoint; absent when there is none. */
function configuredSecretOf(ctx: Context) {
  return async (key: GrantKey): Promise<Outcome<string | 'absent', 'unavailable'>> => {
    const custody = ctx.get(settingsSecretCustodyKey, false)
    if (custody === undefined) return fail('unavailable')
    try {
      const used = custody.use(endpointItemKey(key.tenant, key.endpoint, 'client-secret'))
      if (used === 'missing') return succeed('absent')
      return typeof used === 'object' ? succeed(used.value) : fail('unavailable')
    } catch {
      return fail('unavailable')
    }
  }
}

class Connector extends GrantConnectorService {
  readonly begin: GrantConnector['begin']
  readonly disconnect: GrantConnector['disconnect']
  readonly standing: GrantConnector['standing']
  constructor(
    ctx: Context,
    grants: McpAuthorization,
    secretOf: ReturnType<typeof configuredSecretOf>,
  ) {
    super(ctx)
    this.begin = async input => {
      if (input.configured === undefined) return grants.begin(input)
      const secret = await secretOf(input.key)
      if ('failure' in secret) return fail('unavailable')
      const configured =
        secret.ok === 'absent' ? input.configured : { ...input.configured, secret: secret.ok }
      return grants.begin({ ...input, configured })
    }
    this.disconnect = key => grants.disconnect(key)
    this.standing = key => grants.standing(key)
  }
}

class Receiver extends CallbackReceiverService {
  readonly open: CallbackReceiver['open']
  readonly address: () => string | undefined
  constructor(ctx: Context, receiver: CallbackReceiver) {
    super(ctx)
    this.open = until => receiver.open(until)
    this.address = () => receiver.address?.()
  }
}

/** The OAuth grants of the release: the grants themselves, their connector for the core, and the loopback receiver. */
export function mountMcpOAuth(ctx: Context, config: McpOAuthConfig): McpAuthorization {
  const configuredSecret = configuredSecretOf(ctx)
  const grants = createMcpAuthorization({
    records: recordsOf(ctx),
    secrets: createGrantSecrets(() => ctx.get(settingsSecretCustodyKey, false)),
    fetch: createOAuthFetch(),
    now: () =>
      /* wall-clock: clock-source -- the clock of the grants: token expiry and how long a connection waits. */ Date.now(),
    random: bytes => randomBytes(bytes),
    pendingMs: config.pendingMs,
    refreshLeadMs: config.refreshLeadMs,
    requestMs: config.requestMs,
    configuredSecret,
    tenants: () => tenantsOf(ctx),
  })
  const receiver = createCallbackReceiver({
    port: config.callbackPort,
    now: () =>
      /* wall-clock: clock-source -- the clock of the receiver: when it may close. */ Date.now(),
    awaiting: () => grants.awaiting(),
    answer: query => grants.callback(query, AbortSignal.timeout(config.requestMs)),
  })
  ctx.effect(() => () => receiver.close(), 'mcp.oauth.receiver')
  new Connector(ctx, grants, configuredSecret)
  new Receiver(ctx, receiver)
  return grants
}
