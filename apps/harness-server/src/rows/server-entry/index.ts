// The `server-entry` row: the loopback HTTP entry of the two public locations, carried by the row
// body in the `entry` phase. The body builds the member's server from the tree and returns a
// handle: `start` listens (the assembly calls it after every row is ACTIVE) and `stop` closes the
// entry first in the planned stop. Nothing listens before `start`.
import type { Context } from '@deepseek-ai/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createServerEntry, type ServerEntryDependencies } from '@omne-harness/server-entry'
import { definitionMappingsKey, definitionResolverOf } from '@omne-harness/server-entry/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow, type RowHandle } from '../../row.ts'
import { serverEntryConfig } from './config.ts'
import { identityOfCall } from './identity.ts'

const LOOPBACK = '127.0.0.1'

/**
 * The Session faces by caller class. The assembly page names two classes for this row: `intake`
 * for the management and work operations, `reader` for the history. A plugin has one `inject`
 * entry per service, so the two classes come from two intercept contexts of the row fiber.
 */
function sessionFaces(ctx: Context): ServerEntryDependencies['session'] {
  const intake = ctx.intercept(sessionKey, { caller: 'intake' }).session
  const reader = ctx.intercept(sessionKey, { caller: 'reader' }).session
  return { management: intake.management, work: intake.work, history: reader.history }
}

async function build(ctx: Context, raw: unknown): Promise<RowHandle> {
  // `defineRow` hands over the output of `Config`; parsing it again only narrows the type.
  const config = serverEntryConfig.parse(raw)
  const entry = createServerEntry({
    config: { listenAddress: LOOPBACK, ...config },
    dependencies: {
      identity: identityOfCall(ctx),
      issuer: ctx.principalIssuer,
      session: sessionFaces(ctx),
      resolveDefinition: definitionResolverOf(ctx.definitionMappings),
    },
  })
  // A fiber that unloads while the tree runs (a provider change) closes the listener too.
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

export const serverEntryRow = defineRow({
  row: 'server-entry',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [sessionKey, principalIssuerKey, definitionMappingsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'entry' },
  Config: serverEntryConfig,
  body: build,
})
