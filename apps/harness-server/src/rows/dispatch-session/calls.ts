import type { Context } from '@deepseek-ai/cordis'
import type { Called, SessionCalls } from '@omne-harness/dispatch-session'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SessionCreation,
  SessionFailure,
  SessionId,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { contextInitialization } from '../../assembly/session-context-initialization.ts'
import {
  definitionMappingsKey,
  definitionResolverOf,
} from '../agent-adoptions/definition-mappings.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'
import { readModelViewTo } from './model-view.ts'

const OWNER = 'harness-server/dispatch-session'
const absent = (what: string): { failure: SessionFailure } => ({
  failure: { kind: 'unavailable', owner: OWNER, diagnostic: `${what} is not available` },
})
const UNAVAILABLE = { kind: 'unavailable' } as const

export type SessionCallPorts = Readonly<{
  /** The system principal of dispatch: it creates sessions, sends inputs and reads their fate. */
  system: unknown
  workPrincipals(): SessionWorkPrincipals<unknown> | undefined
}>

/** The calls of Session as this release makes them: the system principal through the intake caller class,
 * the work principal of the session itself through the maintainer and reader classes. */
export function sessionCallsOf(ctx: Context, ports: SessionCallPorts): SessionCalls {
  const faceOf = (caller: 'intake' | 'maintainer' | 'reader') => {
    const scope = ctx.intercept(sessionKey, { caller })
    return () => scope.get(sessionKey, false) as SessionService | undefined
  }
  const [intake, maintainer, reader] = [faceOf('intake'), faceOf('maintainer'), faceOf('reader')]
  const { system } = ports

  type Issued = Readonly<{ principal: unknown }> | 'none' | 'unavailable'
  async function asSession(tenant: TenantId, session: SessionId): Promise<Issued> {
    const issued = await ports
      .workPrincipals()
      ?.forSession({ actor: 'maintainer', tenant, session })
    if (issued === undefined) return 'unavailable'
    if ('ok' in issued) return { principal: issued.ok }
    return issued.failure.kind === 'denied' ? 'none' : 'unavailable'
  }

  function creationOf(input: Parameters<SessionCalls['create']>[0]): SessionCreation | undefined {
    const mappings = ctx.get(definitionMappingsKey)
    const resolved =
      mappings === undefined ? undefined : definitionResolverOf(mappings)(input.creation.agent)
    if (resolved === undefined) return undefined
    const { tenantDefaults, ...mapped } = resolved
    const { agent, workspace, modes, standing } = input.creation
    return {
      ...mapped,
      definition: { name: agent, candidate: resolved.candidate },
      purpose: 'dispatch',
      workspace: workspace?.workspace ?? null,
      workspaceAttachment: workspace?.attachment ?? null,
      modes:
        modes === null
          ? { kind: 'tenant-default', source: tenantDefaults }
          : { kind: 'explicit', value: modes },
      ...standing,
    }
  }

  return {
    async create(input): Promise<Called<unknown>> {
      const service = intake()
      const creation = creationOf(input)
      if (service === undefined) return absent('the Session service')
      if (creation === undefined) return absent(`the definition ${input.creation.agent}`)
      const { tenant, session, operation } = input
      const request = { principal: system, tenant, session, operation, creation }
      const { initialization } = contextInitialization(request)
      return service.management.create({ ...request, creation: { ...creation, initialization } })
    },
    async accept({ tenant, session, operation, value }) {
      const service = intake()
      if (service === undefined) return absent('the Session service')
      return service.work.accept({ principal: system, tenant, session, operation, value })
    },
    async fate({ tenant, session, input }) {
      const service = intake()
      if (service === undefined) return absent('the Session service')
      return service.work.readInputFate({ principal: system, tenant, session, input })
    },
    async work({ tenant, session }) {
      const as = await asSession(tenant, session)
      if (as === 'none') return { kind: 'read', value: null }
      const service = maintainer()
      if (as === 'unavailable' || service === undefined) return UNAVAILABLE
      const read = await service.work.readWork({ principal: as.principal, tenant, session })
      return 'ok' in read ? { kind: 'read', value: read.ok } : UNAVAILABLE
    },
    async modes({ tenant, session }) {
      const as = await asSession(tenant, session)
      const installation = ctx.get(sessionModesInstallationKey)
      if (typeof as === 'string' || installation === undefined) return UNAVAILABLE
      const read = await installation.readModes({ principal: as.principal, tenant, session })
      return read.kind === 'read' ? { kind: 'read', value: read.modes } : UNAVAILABLE
    },
    async cancelRun({ tenant, session, operation, run }) {
      const as = await asSession(tenant, session)
      const service = maintainer()
      if (typeof as === 'string' || service === undefined) return absent('the session to stop')
      const access = { principal: as.principal, tenant, session, operation }
      return service.work.cancelRun({ ...access, run, urgency: 'graceful' })
    },
    async history({ tenant, session, kinds, cursor, pageBytes }) {
      const as = await asSession(tenant, session)
      const service = reader()
      if (typeof as === 'string' || service === undefined)
        return absent('the history of the session')
      const access = { principal: as.principal, tenant, session }
      return cursor === null
        ? service.history.begin({ ...access, kinds, from: null, direction: 'backward', pageBytes })
        : service.history.next({ ...access, cursor })
    },
    async view({ tenant, session, moment }) {
      const as = await asSession(tenant, session)
      const service = reader()
      if (typeof as === 'string' || service === undefined) return UNAVAILABLE
      const access = { principal: as.principal, tenant, session }
      return readModelViewTo(input => service.history.readModelView(input), access, moment)
    },
  }
}
