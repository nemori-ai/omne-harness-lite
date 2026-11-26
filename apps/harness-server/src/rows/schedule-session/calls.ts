import type { Context } from '@deepseek-ai/cordis'
import { goalsKey, type GoalsService } from '@omne-harness/goal-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Created, ExecutorCalls, SessionStanding } from '@omne-harness/schedule-session'
import type {
  RunId,
  SessionCreation,
  SessionFailure,
  SessionId,
  SessionOperationId,
  SessionWorkPrincipals,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { contextInitialization } from '../../assembly/session-context-initialization.ts'
import {
  definitionMappingsKey,
  mappedDefinitionFor,
} from '../agent-adoptions/definition-mappings.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const
/** Results that say nothing of whether the call was committed: the same call is made again later. */
const UNSETTLED = new Set<SessionFailure['kind']>(['commit-unknown', 'unavailable', 'quarantined'])

export type ScheduleSessionPorts = Readonly<{
  /** The system principal of schedule: it creates the session of a Job and owns the goal it sets there. */
  system: unknown
  workPrincipals(): SessionWorkPrincipals<unknown> | undefined
}>

/** No run going, no input waiting and no call in the background: nothing will move the session by itself. */
export function standingOf(
  work: Pick<WorkSnapshot, 'run' | 'pending' | 'backgroundPlaceholders' | 'definition'>,
): SessionStanding {
  const run = work.run.kind === 'active' ? work.run.run : null
  const still = work.pending.length === 0 && (work.backgroundPlaceholders ?? []).length === 0
  const { name, adopted } = work.definition
  return { quiet: run === null && still, run, adopted: { name, version: adopted.revision } }
}

export function refusedBy(failure: SessionFailure): Created {
  if (UNSETTLED.has(failure.kind)) return UNKNOWN
  const reason =
    failure.kind === 'invalid' ? `invalid: ${failure.field}: ${failure.reason}` : failure.kind
  return { kind: 'refused', recoverable: failure.kind === 'denied', reason }
}

/** The calls a Job makes of Session and Goal as this release makes them. A tenant text that names no tenant reads as nothing there. */
export function executorCallsOf(ctx: Context, ports: ScheduleSessionPorts): ExecutorCalls {
  const faceOf = (caller: 'intake' | 'maintainer') => {
    const scope = ctx.intercept(sessionKey, { caller })
    return () => scope.get(sessionKey, false) as SessionService | undefined
  }
  const [intake, maintainer] = [faceOf('intake'), faceOf('maintainer')]
  const { system } = ports
  const legal = (text: string): TenantId | undefined => {
    const parsed = tenantCodec.parse(text)
    return parsed.ok ? parsed.value : undefined
  }
  const goals = () => ctx.get(goalsKey) as GoalsService | undefined
  const asSession = async (tenant: TenantId, session: SessionId) =>
    ports.workPrincipals()?.forSession({ actor: 'maintainer', tenant, session })

  async function creationOf(
    tenant: TenantId,
    creation: Parameters<ExecutorCalls['sessions']['create']>[0]['creation'],
  ): Promise<SessionCreation | Created> {
    const mappings = ctx.get(definitionMappingsKey)
    if (mappings === undefined) return UNKNOWN
    const resolved = await mappedDefinitionFor(mappings, { tenant }, creation.agent)
    if (resolved === 'unavailable') return UNKNOWN
    if (resolved === undefined)
      return { kind: 'refused', recoverable: true, reason: `no Agent definition ${creation.agent}` }
    const { tenantDefaults, ...mapped } = resolved
    const fixed = mappings.modesFor(creation.agent)?.modes
    const { permission, collaboration } = creation.modes
    return {
      ...mapped,
      definition: { name: creation.agent, candidate: resolved.candidate },
      purpose: 'schedule',
      workspace: null,
      workspaceAttachment: null,
      modes:
        fixed === undefined
          ? { kind: 'tenant-default', source: tenantDefaults }
          : { kind: 'explicit', value: { ...fixed, permission, collaboration } },
      initial: null,
      attendance: 'unattended',
    }
  }

  return {
    sessions: {
      async definition({ tenant: text, agent }) {
        const tenant = legal(text)
        const mappings = ctx.get(definitionMappingsKey)
        if (tenant === undefined) return { kind: 'read', value: false }
        if (mappings === undefined) return UNAVAILABLE
        const resolved = await mappedDefinitionFor(mappings, { tenant }, agent)
        return resolved === 'unavailable'
          ? UNAVAILABLE
          : { kind: 'read', value: resolved !== undefined }
      },
      async create(input) {
        const tenant = legal(input.tenant)
        if (tenant === undefined)
          return { kind: 'refused', recoverable: false, reason: 'not-a-tenant' }
        const service = intake()
        const creation = await creationOf(tenant, input.creation)
        if ('kind' in creation) return creation
        if (service === undefined) return UNKNOWN
        const request = {
          principal: system,
          tenant,
          session: input.session as SessionId,
          operation: input.operation as SessionOperationId,
          creation,
        }
        const { initialization } = contextInitialization(request)
        const answer = await service.management.create({
          ...request,
          creation: { ...creation, initialization },
        })
        return 'ok' in answer ? { kind: 'created' } : refusedBy(answer.failure)
      },
      async standing(at) {
        const tenant = legal(at.tenant)
        if (tenant === undefined) return { kind: 'read', value: null }
        const session = at.session as SessionId
        const issued = await asSession(tenant, session)
        const service = maintainer()
        if (issued === undefined || service === undefined) return UNAVAILABLE
        if (!('ok' in issued))
          return issued.failure.kind === 'denied' ? { kind: 'read', value: null } : UNAVAILABLE
        const read = await service.work.readWork({ principal: issued.ok, tenant, session })
        return 'ok' in read ? { kind: 'read', value: standingOf(read.ok) } : UNAVAILABLE
      },
      async cancelRun(input) {
        const tenant = legal(input.tenant)
        const session = input.session as SessionId
        const issued = tenant === undefined ? undefined : await asSession(tenant, session)
        const service = maintainer()
        if (tenant === undefined || issued === undefined || !('ok' in issued)) return 'unknown'
        if (service === undefined) return 'unknown'
        const answer = await service.work.cancelRun({
          principal: issued.ok,
          tenant,
          session,
          operation: input.operation as SessionOperationId,
          run: input.run as RunId,
          urgency: input.urgency === 'forced' ? 'force' : 'graceful',
        })
        return 'ok' in answer ? 'requested' : 'unknown'
      },
    },
    goals: {
      read: async ({ tenant, session }) =>
        (await goals()?.read({ tenant, subject: system }, session)) ?? {
          kind: 'basis-unavailable',
        },
      set: async ({ tenant, session, operation, by, draft }) =>
        (await goals()?.write(
          { tenant, subject: system },
          {
            session,
            operation,
            by,
            proposal: { kind: 'set', draft },
            words: null,
            draftedBy: 'creator',
          },
        )) ?? { kind: 'basis-unavailable' },
      command: async ({ tenant, session, command }) =>
        (await goals()?.command(
          { tenant, subject: system },
          { session, command: { kind: command } },
        )) ?? { kind: 'basis-unavailable' },
    },
  }
}
