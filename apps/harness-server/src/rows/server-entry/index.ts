import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { createServerEntry } from '@omne-harness/server-entry'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { defineRow, type RowHandle } from '../../row.ts'
import { serverEntryConfig } from './config.ts'
import { governanceOfCall, identityOfCall } from './identity.ts'
import { entryAccess } from './access.ts'

const LOOPBACK = '127.0.0.1'

async function build(ctx: Context, raw: unknown): Promise<RowHandle> {
  const config = serverEntryConfig.parse(raw)
  const entry = createServerEntry({
    config: { listenAddress: LOOPBACK, ...config },
    access: entryAccess(
      ctx,
      ctx.telemetry,
      createAccessIdentity({
        operations: identityOfCall(ctx),
        governance: governanceOfCall(ctx),
        issuer: ctx.principalIssuer,
      }),
    ),
  })
  ctx.effect(() => () => entry.stop(), 'server-entry.listener')
  return {
    async start() {
      await entry.start()
    },
    async stop() {
      await entry.stop()
      return { kind: 'settled' }
    },
  }
}

const INJECT = [principalIssuerKey, telemetryKey] as const

export const serverEntryRow = defineRow({
  row: 'server-entry',
  implementation: 'real',
  manifest: {
    provides: [accessRegistryKey],
    injects: [...INJECT],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'entry' },
  Config: serverEntryConfig,
  body: build,
})
