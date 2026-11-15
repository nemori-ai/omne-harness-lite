import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import type { SessionDirectory, SessionManagement } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionObservation } from '@omne-harness/session-observation'
import { sessionObservationKey } from '@omne-harness/session-observation/cordis'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { createSessionContribution } from './contribution.ts'
import type {
  DefinitionResolver,
  PrincipalFacts,
  RequestJournal,
  SessionAccessFaces,
  SessionAccessSettings,
  SessionListing,
  TargetTenantPrincipals,
} from './ports.ts'
import { createRequestDrain } from './request-drain.ts'
import { admitRequest } from './send-input.ts'

export type SessionCreateInput = Parameters<SessionManagement<Principal>['create']>[0]

export type SessionAccessPluginInput<S = SessionAccessSettings> = Readonly<{
  journal: (settings: S) => Promise<RequestJournal>
  principals: (ctx: Context) => TargetTenantPrincipals
  facts: PrincipalFacts
  definitions: (ctx: Context) => DefinitionResolver | undefined
  listing: (directory: SessionDirectory<Principal>) => SessionListing
  prepareCreation?: (input: SessionCreateInput) => SessionCreateInput
}>

const SESSION_ACCESS_PLUGIN = 'session-access'

function sessionOf(ctx: Context, caller: 'intake' | 'reader'): SessionService | undefined {
  return ctx.intercept(sessionKey, { caller }).get(sessionKey)
}

function facesOf(
  ctx: Context,
  prepare: SessionAccessPluginInput['prepareCreation'],
): SessionAccessFaces | undefined {
  const intake = sessionOf(ctx, 'intake')
  const reader = sessionOf(ctx, 'reader')
  if (intake === undefined || reader === undefined) return undefined
  const { management, work } = intake
  const { history } = reader
  return {
    management: {
      create: creation => management.create(prepare === undefined ? creation : prepare(creation)),
    },
    work,
    history,
  }
}

export function createSessionAccessPlugin<S extends SessionAccessSettings>(
  input: SessionAccessPluginInput<S>,
): Plugin.Object {
  return {
    name: SESSION_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    async apply(ctx: Context, settings: S) {
      const principals = input.principals(ctx)
      const faces = () => facesOf(ctx, input.prepareCreation)
      const journal = await input.journal(settings)
      const requests = createRequestDrain({
        journal,
        admit: request => admitRequest({ principals, facts: input.facts, faces }, request),
        limit: settings.requestQueueLimit,
        retryDelaysMs: settings.requestRetryDelaysMs,
      })
      ctx.effect(() => async () => {
        requests.stop()
        await journal.close()
      })
      ctx.plugin(
        defineAccessPlugin({
          name: `${SESSION_ACCESS_PLUGIN}.contribution`,
          protocol: sessionProtocol,
          handlers: provide =>
            createSessionContribution({
              faces,
              observation: () =>
                provide(sessionObservationKey) as SessionObservation<Principal> | undefined,
              definitions: () => input.definitions(ctx),
              listing: () => {
                const directory = sessionOf(ctx, 'reader')?.directory
                return directory === undefined ? undefined : input.listing(directory)
              },
              principals,
              facts: input.facts,
              settings,
              requests,
            }),
        }),
      )
    },
  }
}
