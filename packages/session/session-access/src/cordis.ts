import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import type { SessionDirectory, SessionManagement } from '@omne-harness/session-contract'
import {
  sessionInputSourcesKey,
  sessionKey,
  sessionSearchKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import type { SessionObservation } from '@omne-harness/session-observation'
import { sessionObservationKey } from '@omne-harness/session-observation/cordis'
import { sessionProtocol } from '@omne-harness/session-protocol'
import type { HistorySearch } from '@omne-harness/session-search'
import { createSessionContribution } from './contribution.ts'
import { MEMBER_INPUT_SOURCE } from './member-source.ts'
import type {
  DefinitionResolver,
  PrincipalFacts,
  RequestJournal,
  ModelTargets,
  WorkspaceSelections,
  WorkspaceTargets,
  RunFailureCauses,
  SessionAccessFaces,
  SessionAccessSettings,
  SessionListing,
  SessionPermissionModes,
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
  causes?: (ctx: Context) => RunFailureCauses | undefined
  /** How a model route resolves for a selection; the release adapts Model's profiles to it. */
  modelTargets?: (ctx: Context) => ModelTargets | undefined
  /** Whether an instance may be attached; the release adapts Workspace's verification to it. */
  workspaceTargets?: (ctx: Context) => WorkspaceTargets | undefined
  /** The workspace a session stands at and its working directory; the release reads them. */
  workspaceSelections?: (ctx: Context) => WorkspaceSelections | undefined
  permissionModes?: (ctx: Context) => SessionPermissionModes | undefined
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
      interrupt: urgent => management.interrupt(urgent),
      change: declared => management.change(declared),
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
      // The source registers when the point is there; until then an input answers unavailable.
      ctx.plugin({
        name: `${SESSION_ACCESS_PLUGIN}.member-source`,
        inject: [sessionInputSourcesKey],
        apply: scope => scope.sessionInputSources.register(MEMBER_INPUT_SOURCE),
      })
      const principals = input.principals(ctx)
      const faces = () => facesOf(ctx, input.prepareCreation)
      const opening = input.journal(settings)
      let drain: ReturnType<typeof createRequestDrain> | undefined
      ctx.effect(() => async () => {
        drain?.stop()
        const opened = await opening.catch(() => undefined)
        await opened?.close()
      })
      const journal = await opening
      if (ctx.fiber.uid === null) return
      const requests = createRequestDrain({
        journal,
        admit: request => admitRequest({ principals, facts: input.facts, faces }, request),
        limit: settings.requestQueueLimit,
        retryDelaysMs: settings.requestRetryDelaysMs,
      })
      drain = requests
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
              searching: () => provide(sessionSearchKey) as HistorySearch<Principal> | undefined,
              causes: () => input.causes?.(ctx),
              modelTargets: () => input.modelTargets?.(ctx),
              workspaceTargets: () => input.workspaceTargets?.(ctx),
              workspaceSelections: () => input.workspaceSelections?.(ctx),
              permissionModes: () => input.permissionModes?.(ctx),
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
