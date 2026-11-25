import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import {
  accessCallsKey,
  type AccessCallsService,
} from '@omne-harness/access-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSessionCommandSource } from '@omne-harness/session-adapters'
import type { PrincipalFacts } from '@omne-harness/session-access'
import {
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'

const SESSION = Object.freeze({ name: 'session', major: 1 })

/** The commands the session brings, put on the command entry sources as an official source. */
export function sessionCommandsPlugin(facts: PrincipalFacts): Plugin.Object {
  return {
    name: 'session-access.commands',
    inject: [commandEntrySourcesKey],
    apply(ctx: Context) {
      const source = createSessionCommandSource<unknown>({
        // A read the operation refuses gives no revision: the change is then refused by the operation itself.
        async permissionRevision(asker) {
          const fact = facts.describe(asker.principal as Principal)
          const calls = ctx.get(accessCallsKey) as AccessCallsService | undefined
          const tenant = fact === undefined ? undefined : tenantCodec.encode(fact.tenant)
          if (fact === undefined || calls === undefined || tenant === undefined || !tenant.ok)
            return fail('unavailable')
          const answer = await calls.call({
            protocol: SESSION,
            operation: 'read-permission-mode',
            body: { tenant: asker.tenant, session: asker.session },
            login: fact.login,
            tenant: tenant.value,
            id: 'command:read-permission-mode',
          })
          if (answer.kind !== 'answered' || answer.outcome === 'basis-unavailable')
            return fail('unavailable')
          const read = answer.body as { revision?: unknown } | undefined
          return succeed(typeof read?.revision === 'string' ? read.revision : '')
        },
      })
      const sources = ctx.get(commandEntrySourcesKey) as CommandEntrySourcesService<unknown>
      sources.contribute(source, { official: true })
    },
  }
}
