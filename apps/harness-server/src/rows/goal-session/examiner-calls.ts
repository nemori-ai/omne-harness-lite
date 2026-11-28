import type { Context } from '@deepseek-ai/cordis'
import type { Examiner } from '@omne-harness/goal-local'
import type { ExaminerCalls } from '@omne-harness/goal-session'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  workspaceSelection,
  type Modes,
  type RunId,
  type SessionCreation,
  type SessionFailure,
  type SessionId,
  type SessionWorkPrincipals,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { contextInitialization } from '../../assembly/session-context-initialization.ts'
import {
  definitionMappingsKey,
  mappedDefinitionFor,
} from '../agent-adoptions/definition-mappings.ts'

const OWNER = 'harness-server/goal-session'
const absent = (what: string): { failure: SessionFailure } => ({
  failure: { kind: 'unavailable', owner: OWNER, diagnostic: `${what} is not available` },
})
/** What an examining session is created for. It is in the log. */
export const EXAMINATION_PURPOSE = 'goal-examination'

export type ExaminerCallPorts = Readonly<{
  /** The system principal of goals: it creates the sessions that examine for them. */
  system: unknown
  workPrincipals(): SessionWorkPrincipals<unknown> | undefined
  /** The Agent definition and the model an examination of this tenant runs as; undefined when that cannot be read now. */
  examiner(tenant: TenantId): Promise<Examiner | undefined>
}>
type Create = Parameters<ExaminerCalls['create']>[0]
type Resolved = Awaited<ReturnType<typeof mappedDefinitionFor>>

/** What an examining session is created with: nobody attends it, it asks nobody, it does not drive itself, and it is placed where the work it examines is placed now. Undefined: the definition cannot be used now. */
export function examinerCreation(
  { definition: agent, model }: Examiner,
  resolved: Resolved,
  fixed: Modes | undefined,
  work: Pick<WorkSnapshot, 'creation' | 'changes'>,
): SessionCreation | undefined {
  if (resolved === undefined || resolved === 'unavailable' || fixed === undefined) return undefined
  const { tenantDefaults: _defaults, initialModelSelection: first, ...mapped } = resolved
  const placed = workspaceSelection(work)
  return {
    ...mapped,
    ...(first === undefined ? {} : { initialModelSelection: { ...first, name: model } }),
    definition: { name: agent, candidate: resolved.candidate },
    purpose: EXAMINATION_PURPOSE,
    workspace: placed?.workspace ?? null,
    workspaceAttachment: placed?.attachment ?? null,
    modes: {
      kind: 'explicit',
      value: { ...fixed, permission: 'bypass-permissions', collaboration: 'co-work' },
    },
    initial: null,
    attendance: 'unattended',
  }
}

/** The calls of Session only the examining side of goals makes. A session is created as the system principal of goals; its run is stopped and it is archived as the session itself. */
export function examinerCallsOf(
  ctx: Context,
  ports: ExaminerCallPorts,
  reminderWith: ExaminerCalls['reminderWith'],
): ExaminerCalls {
  const faceOf = (caller: 'intake' | 'maintainer') => {
    const scope = ctx.intercept(sessionKey, { caller })
    return () => scope.get(sessionKey, false) as SessionService | undefined
  }
  const [intake, maintainer] = [faceOf('intake'), faceOf('maintainer')]
  const asSession = async (tenant: TenantId, session: SessionId) => {
    const issued = await ports
      .workPrincipals()
      ?.forSession({ actor: 'maintainer', tenant, session })
    const service = maintainer()
    if (issued === undefined || service === undefined || !('ok' in issued)) return undefined
    return { service, at: { principal: issued.ok, tenant, session } }
  }

  async function creationOf({ tenant, beside }: Create): Promise<SessionCreation | string> {
    const mappings = ctx.get(definitionMappingsKey)
    const worker = await asSession(tenant, beside)
    if (mappings === undefined || worker === undefined) return 'the session of the goal'
    const work = await worker.service.work.readWork(worker.at)
    if (!('ok' in work)) return 'the session of the goal'
    const examiner = await ports.examiner(tenant)
    if (examiner === undefined) return 'the settings of examinations'
    const agent = examiner.definition
    const resolved = await mappedDefinitionFor(mappings, { tenant }, agent)
    const made = examinerCreation(examiner, resolved, mappings.modesFor(agent)?.modes, work.ok)
    return made ?? `the Agent definition ${agent}`
  }

  return {
    reminderWith,
    async create(input) {
      const service = intake()
      const creation = await creationOf(input)
      if (service === undefined) return absent('the Session service')
      if (typeof creation === 'string') return absent(creation)
      const { tenant, session, operation } = input
      const request = { principal: ports.system, tenant, session, operation, creation }
      const { initialization } = contextInitialization(request)
      return service.management.create({ ...request, creation: { ...creation, initialization } })
    },
    async cancelRun({ tenant, session, operation, run }) {
      const own = await asSession(tenant, session)
      await own?.service.work.cancelRun({
        ...own.at,
        operation,
        run: run as RunId,
        urgency: 'graceful',
      })
    },
    async archive({ tenant, session, operation }) {
      const own = await asSession(tenant, session)
      await own?.service.work.control({ ...own.at, operation, intent: { kind: 'archive' } })
    },
  }
}
