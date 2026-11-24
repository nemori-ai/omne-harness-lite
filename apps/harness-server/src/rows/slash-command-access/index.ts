import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { SlashCommandAccessPorts } from '@omne-harness/slash-command-access'
import { createSlashCommandAccessPlugin } from '@omne-harness/slash-command-access/cordis'
import {
  type CommandCatalogService,
  commandCatalogKey,
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

function portsOf(ctx: Context): SlashCommandAccessPorts {
  const actFor = memberActingOfCall(ctx)
  const intake = ctx.intercept(sessionKey, { caller: 'intake' })
  return {
    // A login reads a session's list only when the session itself lets it read that session.
    async admit(login, tenant, session) {
      const text = tenantCodec.encode(tenant)
      if (!text.ok) return DENIED
      const acting = await actFor(login, text.value)
      if (acting.outcome !== 'issued') return acting.outcome === 'denied' ? DENIED : UNAVAILABLE
      const work = intake.get(sessionKey)?.work
      if (work === undefined) return UNAVAILABLE
      const access = { principal: acting.principal, tenant, session: session as SessionId }
      const read = await work.readPending({ ...access, after: null, limit: 1 })
      if ('ok' in read) return { asker: access }
      return read.failure.kind === 'denied' ? DENIED : UNAVAILABLE
    },
    catalog: () => ctx.get(commandCatalogKey) as CommandCatalogService<Principal> | undefined,
    watch(asker, changed) {
      const sources = ctx.get(commandEntrySourcesKey) as
        | CommandEntrySourcesService<Principal>
        | undefined
      if (sources === undefined) return undefined
      const stops = sources.sources().map(slot => slot.source.watch?.(asker.tenant, changed))
      return () => {
        for (const stop of stops) stop?.()
      }
    },
  }
}

/** `slash-command/1`: the list a session can name, its public half, and a frame when it may have changed. */
export const slashCommandAccessRow = defineRow({
  row: 'slash-command-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...createSlashCommandAccessPlugin(portsOf),
    inject: [accessRegistryKey, principalIssuerKey],
  },
})
