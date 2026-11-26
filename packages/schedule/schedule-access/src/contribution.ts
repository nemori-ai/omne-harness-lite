import { createHash } from 'node:crypto'
import type {
  AccessContribution,
  BodyOf,
  LoginIdentity,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  ScheduleIdSchema,
  ScheduleJobIdSchema,
  ScheduleOperationKeySchema,
  ScheduleReasonSchema,
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
  type ScheduleCallContext,
  type ScheduleCommand,
  type ScheduleCommandResult,
  type ScheduleCreateRequest,
  type ScheduleDomainError,
  type ScheduleJobRecall,
  type ScheduleJobWrite,
  type ScheduleOperationView,
  type ScheduleQueryResult,
  type ScheduleSessionDefaults,
  type ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type {
  ScheduleAccessClock,
  ScheduleFaces,
  ScheduleNewSessionDefaults,
  SchedulePrincipals,
} from './ports.ts'
import { createJobObservation } from './observe-jobs.ts'
import {
  cardOf,
  definitionOf,
  instructionOf,
  detailOf,
  historyRowOf,
  instantOf,
  jobDetailOf,
  workOf,
  refusalOf,
  type Unread,
  revisionOf,
  upcomingOf,
} from './projection.ts'

export type ScheduleContributionInput = Readonly<{
  principals: SchedulePrincipals
  faces: () => ScheduleFaces | undefined
  requestId: () => string
  clock: ScheduleAccessClock
  newSessionDefaults: ScheduleNewSessionDefaults
}>

type Operations = ScheduleProtocol['operations']
type Handlers = AccessContribution<ScheduleProtocol>['operations']
type Manage = BodyOf<Operations['manage-schedule']>
type Create = BodyOf<Operations['create-schedule']>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const invalid = (code: string) => ({ outcome: 'invalid', body: { code } }) as const
const MANUAL_DRAFT = '由人建的草稿'
const SESSION_JOBS = 20
/** Stopped, used up, discarded or replaced: kept with their history, hidden from the default list. */
const TERMINAL = new Set(['stopped', 'exhausted', 'discarded', 'superseded'])

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('schedule-access: tenant is not a minted TenantId')
  return encoded.value
}

/** A domain refusal in the outcomes the operation declares; the rest is an unavailable basis. */
function refused(error: ScheduleDomainError, declared: readonly string[]): never {
  const refusal = refusalOf(error)
  if (refusal.outcome === 'not-visible' && !declared.includes('not-visible')) return DENIED as never
  if (refusal.outcome === 'denied' || refusal.outcome === 'basis-unavailable')
    return refusal as never
  if (!declared.includes(refusal.outcome)) return UNAVAILABLE as never
  const { outcome, ...body } = refusal
  return { outcome, body } as never
}

/** The business identity of a write is derived from the tenant and the client's id, so a resend is the same write. */
function operationKey(tenant: string, kind: string, id: string) {
  return ScheduleOperationKeySchema.parse(
    `${kind}:${createHash('sha256')
      .update(JSON.stringify([tenant, kind, id]))
      .digest('hex')}`,
  )
}

type Read<T> = T | Unread | undefined
const isUnread = (read: unknown): read is Unread | undefined =>
  read === undefined || (typeof read === 'object' && read !== null && 'unread' in read)
/** The answer for what was not read: invalid with the reason when there is one, no basis when its defaults could not be read. A recall of it: never committed, or no basis. A person is in no session, so nothing is `current` and a new session takes what the release defaults to. */
const unreadAnswer = (read: Unread | undefined) =>
  read === undefined
    ? invalid('invalid_input')
    : read.unread === 'refused'
      ? ({ outcome: 'invalid', body: { code: 'invalid_input', reason: read.reason } } as const)
      : UNAVAILABLE
const unreadRecall = (read: Unread | undefined) =>
  read !== undefined && read.unread === 'basis-unavailable'
    ? UNAVAILABLE
    : ({ outcome: 'not-committed', body: {} } as const)

function createRequestOf(
  tenant: string,
  body: Create,
  defaults: ScheduleSessionDefaults,
): Read<ScheduleCreateRequest> {
  const definition = definitionOf(body.definition, defaults)
  if (isUnread(definition)) return definition
  const reason = ScheduleReasonSchema.safeParse(body.reason ?? MANUAL_DRAFT)
  if (!reason.success) return undefined
  return {
    definition,
    initial: body.state === 'active' ? { kind: 'active' } : { kind: 'draft', reason: reason.data },
    meta: {
      operationKey: operationKey(tenant, 'create', body.createId),
      expectedRevision: null,
    },
  }
}

function commandOf(
  tenant: string,
  body: Manage,
  defaults: ScheduleSessionDefaults,
): Read<ScheduleCommand> {
  const scheduleId = ScheduleIdSchema.safeParse(body.schedule)
  if (!scheduleId.success) return undefined
  const common = {
    scheduleId: scheduleId.data,
    meta: {
      operationKey: operationKey(tenant, 'manage', body.actionId),
      expectedRevision: body.revision,
    },
  }
  const { action } = body
  switch (action.kind) {
    case 'rename':
      return {
        ...common,
        action: 'update',
        patch: { kind: 'label', label: action.label },
      } as ScheduleCommand
    case 'edit': {
      const instruction = instructionOf(action.instruction)
      if (instruction === undefined) return undefined
      return {
        ...common,
        action: 'update',
        patch: { kind: 'executionText', instruction, label: null },
      } as ScheduleCommand
    }
    case 'revise':
    case 'replace': {
      const definition = definitionOf(action.definition, defaults)
      if (isUnread(definition)) return definition
      return (
        action.kind === 'revise'
          ? { ...common, action: 'reviseDraft', definition, reason: action.reason }
          : { ...common, action: 'replace', successor: definition, reason: action.reason }
      ) as ScheduleCommand
    }
    default:
      return { ...common, action: action.kind, reason: action.reason } as ScheduleCommand
  }
}

/** Steps one to four of every operation: act for the tenant, take the principal and the faces, call. */
function stepsOf(input: ScheduleContributionInput) {
  const { principals } = input
  const defaultsOf = async (tenant: string): Promise<ScheduleSessionDefaults> => {
    const forNew = await Promise.resolve()
      .then(() => input.newSessionDefaults(tenant))
      .catch(() => undefined)
    return { current: null, forNew: forNew ?? null }
  }

  async function prepare(login: LoginIdentity, tenant: TenantId) {
    const tenantText = tenantTextOf(tenant)
    let issued: Awaited<ReturnType<SchedulePrincipals['actingFor']>>
    try {
      issued = await principals.actingFor(login, tenantText)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const context = principals.contextOf(issued.ok, tenantText, input.requestId())
    return { outcome: null, faces, context, tenantText }
  }

  async function read<T>(call: () => Promise<ScheduleQueryResult<T>>) {
    try {
      return await call()
    } catch {
      return undefined
    }
  }

  /** Step four for writes: a throw or an unknown answer is unknown, never success or failure. */
  async function commit(
    call: () => Promise<ScheduleCommandResult<ScheduleView>>,
    declared: readonly string[],
  ) {
    let result: ScheduleCommandResult<ScheduleView>
    try {
      result = await call()
    } catch {
      return { outcome: 'unknown' } as const
    }
    if (result.kind === 'unknown') return { outcome: 'unknown' } as const
    if (result.kind === 'rejected') return refused(result.error, declared)
    return { outcome: 'succeeded', body: detailOf(result.value) } as const
  }

  function recalled(view: ScheduleOperationView, declared: readonly string[]) {
    if (view.kind === 'committed' || view.kind === 'noChange')
      return { outcome: 'succeeded', body: detailOf(view.result) } as const
    if (view.kind === 'rejected' && refusalOf(view.error).outcome === 'not-visible')
      return refused(view.error, declared)
    if (view.kind === 'rejected' || view.kind === 'notCommitted')
      return { outcome: 'not-committed', body: {} } as const
    return UNAVAILABLE
  }

  async function recall(
    context: ScheduleCallContext,
    faces: ScheduleFaces,
    intent: Parameters<typeof createScheduleOperationIntent>[0],
    declared: readonly string[],
  ) {
    const { address } = createScheduleOperationIntent(intent)
    const found = await read(() =>
      faces.commands.queryOperation(context, {
        kind: 'identity',
        identity: address,
        expectedFingerprint: fingerprintScheduleOperation(intent),
      }),
    )
    if (found === undefined) return UNAVAILABLE
    if (found.kind === 'error') return refused(found.error, declared)
    return recalled(found.value, declared)
  }

  return { prepare, read, commit, recall, defaultsOf }
}
type Steps = ReturnType<typeof stepsOf>

function readHandlers(
  { prepare, read, defaultsOf }: Steps,
  input: ScheduleContributionInput,
): Pick<
  Handlers,
  'list-schedules' | 'read-schedule' | 'read-revisions' | 'read-agenda' | 'preview'
> {
  return {
    async 'list-schedules'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const listed = await read(() =>
        ready.faces.queries.list(ready.context, {
          agentRef: null,
          control: body.control,
          standing: null,
          createdBy: null,
          targetDeviceRef: null,
          calendarId: null,
          purpose: null,
          cursor: body.cursor,
          limit: Math.min(body.limit, 200),
        }),
      )
      if (listed === undefined) return UNAVAILABLE
      if (listed.kind === 'error') return refused(listed.error, ['invalid'])
      const shown =
        body.terminal || body.control !== null
          ? listed.value.items
          : listed.value.items.filter(view => !TERMINAL.has(view.control))
      return {
        outcome: 'succeeded',
        body: { items: shown.map(cardOf), next: listed.value.nextCursor },
      }
    },
    async 'read-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const scheduleId = ScheduleIdSchema.safeParse(body.schedule)
      if (!scheduleId.success) return { outcome: 'not-visible', body: {} }
      const found = await read(() =>
        ready.faces.queries.get(ready.context, { scheduleId: scheduleId.data }),
      )
      if (found === undefined) return UNAVAILABLE
      if (found.kind === 'error') return refused(found.error, ['not-visible'])
      return { outcome: 'succeeded', body: detailOf(found.value) }
    },
    async 'read-revisions'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const scheduleId = ScheduleIdSchema.safeParse(body.schedule)
      if (!scheduleId.success) return { outcome: 'not-visible', body: {} }
      const page = await read(() =>
        ready.faces.queries.revisions(ready.context, {
          scheduleId: scheduleId.data,
          cursor: body.cursor,
          limit: Math.min(body.limit, 500),
        }),
      )
      if (page === undefined) return UNAVAILABLE
      if (page.kind === 'error') return refused(page.error, ['not-visible'])
      return {
        outcome: 'succeeded',
        body: { items: page.value.items.map(revisionOf), next: page.value.nextCursor },
      }
    },
    async 'read-agenda'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const agenda = await read(() =>
        ready.faces.queries.agenda(ready.context, {
          from: `${body.from}T00:00:00`,
          to: `${body.to}T00:00:00`,
          timezone: body.timezone,
          filter: {
            agentRef: null,
            control: null,
            standing: null,
            createdBy: null,
            targetDeviceRef: null,
            calendarId: null,
            purpose: null,
          },
          cursor: body.cursor,
          limit: 5000,
        } as never),
      )
      if (agenda === undefined) return UNAVAILABLE
      if (agenda.kind === 'error') return refused(agenda.error, ['invalid', 'unsupported'])
      return {
        outcome: 'succeeded',
        body: {
          items: agenda.value.items.map(item => ({
            schedule: item.scheduleId,
            at: instantOf(item.scheduledAt),
            local: item.displayLocal,
            kind: item.kind,
          })),
          next: agenda.value.nextCursor,
        },
      }
    },
    async preview(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      let source
      if (body.source.kind === 'schedule') {
        const scheduleId = ScheduleIdSchema.safeParse(body.source.schedule)
        if (!scheduleId.success) return { outcome: 'not-visible', body: {} }
        source = { kind: 'schedule' as const, scheduleId: scheduleId.data }
      } else {
        const definition = definitionOf(body.source.definition, await defaultsOf(ready.tenantText))
        if (isUnread(definition)) return unreadAnswer(definition)
        source = { kind: 'inline' as const, definition }
      }
      const previewed = await read(() =>
        ready.faces.queries.preview(ready.context, {
          source,
          after: input.clock.now(),
          count: Math.min(body.count, 100),
        }),
      )
      if (previewed === undefined) return UNAVAILABLE
      if (previewed.kind === 'error')
        return refused(previewed.error, ['invalid', 'unsupported', 'not-visible'])
      return {
        outcome: 'succeeded',
        body: {
          upcoming: previewed.value.candidates.map(upcomingOf),
          complete: previewed.value.complete,
        },
      }
    },
  }
}

function writeHandlers({
  prepare,
  commit,
  recall,
  defaultsOf,
}: Steps): Pick<
  Handlers,
  'create-schedule' | 'query-create-schedule' | 'manage-schedule' | 'query-manage-schedule'
> {
  return {
    async 'create-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const request = createRequestOf(ready.tenantText, body, await defaultsOf(ready.tenantText))
      if (isUnread(request)) return unreadAnswer(request)
      return commit(
        () => ready.faces.commands.create(ready.context, request),
        ['invalid', 'unsupported', 'conflict', 'limited'],
      )
    },
    async 'query-create-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const request = createRequestOf(ready.tenantText, body, await defaultsOf(ready.tenantText))
      if (isUnread(request)) return unreadRecall(request)
      return recall(
        ready.context,
        ready.faces,
        { kind: 'create', owner: ready.context.owner, input: request },
        [],
      )
    },
    async 'manage-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const command = commandOf(ready.tenantText, body, await defaultsOf(ready.tenantText))
      if (isUnread(command)) return unreadAnswer(command)
      return commit(
        () => ready.faces.commands.execute(ready.context, command),
        ['invalid', 'unsupported', 'conflict', 'limited', 'not-visible'],
      )
    },
    async 'query-manage-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const command = commandOf(ready.tenantText, body, await defaultsOf(ready.tenantText))
      if (isUnread(command))
        return command?.unread === 'basis-unavailable'
          ? UNAVAILABLE
          : { outcome: 'not-visible', body: {} }
      return recall(
        ready.context,
        ready.faces,
        { kind: 'execute', owner: ready.context.owner, input: command },
        ['not-visible'],
      )
    },
  }
}

const JOB_REFUSALS = ['invalid', 'conflict', 'not-visible'] as const

function jobHandlers({
  prepare,
  read,
  defaultsOf,
}: Steps): Pick<
  Handlers,
  | 'list-jobs'
  | 'read-job'
  | 'read-session-jobs'
  | 'cancel-job'
  | 'query-cancel-job'
  | 'start-job'
  | 'query-start-job'
> {
  const scheduleOf = (text: string | null) =>
    text === null ? null : (ScheduleIdSchema.safeParse(text).data ?? undefined)
  const jobIdOf = (text: string) => ScheduleJobIdSchema.safeParse(text).data
  const written = async (call: () => Promise<ScheduleQueryResult<ScheduleJobWrite>>) => {
    let result: ScheduleQueryResult<ScheduleJobWrite>
    try {
      result = await call()
    } catch {
      return { outcome: 'unknown' } as const
    }
    if (result.kind === 'error') return refused(result.error, JOB_REFUSALS)
    const { outcome, detail } = result.value
    if (outcome === 'unknown' || detail === null) return { outcome: 'unknown' } as const
    return { committed: outcome === 'committed', detail }
  }
  const recalled = (found: ScheduleQueryResult<ScheduleJobRecall> | undefined) => {
    if (found === undefined) return UNAVAILABLE
    if (found.kind === 'error') return refused(found.error, JOB_REFUSALS)
    return found.value.committed && found.value.detail !== null
      ? ({ outcome: 'succeeded', body: jobDetailOf(found.value.detail) } as const)
      : ({ outcome: 'not-committed', body: {} } as const)
  }
  return {
    async 'list-jobs'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const scheduleId = scheduleOf(body.schedule)
      if (scheduleId === undefined) return { outcome: 'not-visible', body: {} }
      const page = await read(() =>
        ready.faces.queries.executions(ready.context, {
          scheduleId,
          from: null,
          to: null,
          cursor: body.cursor,
          limit: Math.min(body.limit, 200),
        }),
      )
      if (page === undefined) return UNAVAILABLE
      if (page.kind === 'error') return refused(page.error, ['invalid', 'not-visible'])
      return {
        outcome: 'succeeded',
        body: { items: page.value.items.map(historyRowOf), next: page.value.nextCursor },
      }
    },
    async 'read-job'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const jobId = jobIdOf(body.job)
      if (jobId === undefined) return { outcome: 'not-visible', body: {} }
      const found = await read(() => ready.faces.jobs.get(ready.context, { jobId }))
      if (found === undefined) return UNAVAILABLE
      if (found.kind === 'error') return refused(found.error, ['not-visible'])
      return { outcome: 'succeeded', body: jobDetailOf(found.value) }
    },
    async 'read-session-jobs'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const request = { executionRef: body.session, limit: SESSION_JOBS }
      const found = await read(() => ready.faces.jobs.ofExecution(ready.context, request))
      if (found === undefined || found.kind === 'error') return UNAVAILABLE
      return { outcome: 'succeeded', body: { items: found.value.map(jobDetailOf) } }
    },
    async 'cancel-job'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const jobId = jobIdOf(body.job)
      if (jobId === undefined) return { outcome: 'not-visible', body: {} }
      const key = operationKey(ready.tenantText, 'cancel-job', `${body.actionId}:${jobId}`)
      const answer = await written(() =>
        ready.faces.jobs.cancel(ready.context, { jobId, operationKey: key }),
      )
      if (!('detail' in answer)) return answer
      return {
        outcome: 'succeeded',
        body: { changed: answer.committed === true, job: jobDetailOf(answer.detail) },
      }
    },
    async 'query-cancel-job'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const jobId = jobIdOf(body.job)
      if (jobId === undefined) return { outcome: 'not-visible', body: {} }
      const key = operationKey(ready.tenantText, 'cancel-job', `${body.actionId}:${jobId}`)
      return recalled(
        await read(() => ready.faces.jobs.queryCancel(ready.context, { jobId, operationKey: key })),
      )
    },
    async 'start-job'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const work = workOf(body.work, await defaultsOf(ready.tenantText))
      if (isUnread(work)) return unreadAnswer(work)
      const key = operationKey(ready.tenantText, 'start-job', body.startId)
      const answer = await written(() =>
        ready.faces.jobs.start(ready.context, { work, operationKey: key }),
      )
      if (!('detail' in answer)) return answer
      return { outcome: 'succeeded', body: jobDetailOf(answer.detail) }
    },
    async 'query-start-job'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const work = workOf(body.work, await defaultsOf(ready.tenantText))
      if (isUnread(work)) return unreadRecall(work)
      const key = operationKey(ready.tenantText, 'start-job', body.startId)
      return recalled(
        await read(() => ready.faces.jobs.queryStart(ready.context, { work, operationKey: key })),
      )
    },
  }
}

export function createScheduleContribution(
  input: ScheduleContributionInput,
): Omit<AccessContribution<ScheduleProtocol>, 'protocol'> {
  const steps = stepsOf(input)
  return {
    operations: { ...readHandlers(steps, input), ...writeHandlers(steps), ...jobHandlers(steps) },
    observations: { 'observe-jobs': createJobObservation(input) },
  }
}
