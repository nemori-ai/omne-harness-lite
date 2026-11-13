// The Cordis binding: the access plugin of `session/v1`. It depends on the access registry only and
// mounts the contribution on its own scope (`defineAccessPlugin`). It takes the Session faces, the
// session observation and the definitions at every call, so a Session provider that is reloaded
// makes the calls of that moment answer `basis-unavailable` and does not take the protocol down.
//
// Session tells its callers apart by the caller class of the intercept configuration: the
// management and work faces are read as `intake`, the history and the session list as `reader`
// (the history as the server entry's session location did). The class is a fact of this caller, so the plugin reads Session through two
// intercept contexts of its own scope rather than through a plain `provide`.
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
  SessionAccessFaces,
  SessionAccessSettings,
  SessionListing,
  TargetTenantPrincipals,
} from './ports.ts'

/** The input of one `create-session` call to Session's management face. */
export type SessionCreateInput = Parameters<SessionManagement<Principal>['create']>[0]

/** What only the application assembly can give the plugin. */
export type SessionAccessPluginInput = Readonly<{
  /** Built once when the plugin loads, over what the assembly's scope sees. */
  principals: (ctx: Context) => TargetTenantPrincipals
  facts: PrincipalFacts
  /** The deployment's definition mapping, read from the tree at every call. */
  definitions: (ctx: Context) => DefinitionResolver | undefined
  /** Adapts the session list face of Session to the port the handler asks for. */
  listing: (directory: SessionDirectory<Principal>) => SessionListing
  /** What the assembly adds to a creation before Session sees it. Absent: the creation as built. */
  prepareCreation?: (input: SessionCreateInput) => SessionCreateInput
}>

const SESSION_ACCESS_PLUGIN = 'session-access'

function sessionOf(ctx: Context, caller: 'intake' | 'reader'): SessionService | undefined {
  return ctx.intercept(sessionKey, { caller }).get(sessionKey)
}

/** The Session faces of this moment, or `undefined` while Session is not on the tree. */
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

/**
 * The access plugin of `session/v1`. Its configuration is the deployment values the handlers read;
 * the plugin defines no schema for it, the assembly row that loads it does.
 */
export function createSessionAccessPlugin(input: SessionAccessPluginInput): Plugin.Object {
  return {
    name: SESSION_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context, settings: SessionAccessSettings) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${SESSION_ACCESS_PLUGIN}.contribution`,
          protocol: sessionProtocol,
          handlers: provide =>
            createSessionContribution({
              faces: () => facesOf(ctx, input.prepareCreation),
              observation: () =>
                provide(sessionObservationKey) as SessionObservation<Principal> | undefined,
              definitions: () => input.definitions(ctx),
              listing: () => {
                const directory = sessionOf(ctx, 'reader')?.directory
                return directory === undefined ? undefined : input.listing(directory)
              },
              principals: input.principals(ctx),
              facts: input.facts,
              settings,
            }),
        }),
      )
    },
  }
}
