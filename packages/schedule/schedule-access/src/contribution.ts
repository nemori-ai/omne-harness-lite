import { createHash } from 'node:crypto'
import type {
  AccessContribution,
  BodyOf,
  LoginIdentity,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  ScheduleIdSchema,
  ScheduleOperationKeySchema,
  ScheduleReasonSchema,
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
  type ScheduleCallContext,
  type ScheduleCommand,
  type ScheduleCommandResult,
  type ScheduleCreateRequest,
  type ScheduleDomainError,
  type ScheduleOperationView,
  type ScheduleQueryResult,
  type ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ScheduleAccessClock, ScheduleFaces, SchedulePrincipals } from './ports.ts'
import {
  cardOf,
  definitionOf,
  detailOf,
  instantOf,
  refusalOf,
  revisionOf,
  upcomingOf,
} from './projection.ts'

export type ScheduleContributionInput = Readonly<{
  principals: SchedulePrincipals
  faces: () => ScheduleFaces | undefined
  requestId: () => string
  clock: ScheduleAccessClock
}>

type Operations = ScheduleProtocol['operations']
type Handlers = AccessContribution<ScheduleProtocol>['operations']
type Manage = BodyOf<Operations['manage-schedule']>
type Create = BodyOf<Operations['create-schedule']>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const invalid = (code: string) => ({ outcome: 'invalid', body: { code } }) as const
const MANUAL_DRAFT = '由人建的草稿'
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
  return (
    'code' in refusal
      ? { outcome: refusal.outcome, body: { code: refusal.code } }
      : { outcome: refusal.outcome, body: {} }
  ) as never
}

/** The business identity of a write is derived from the tenant and the client's id, so a resend is the same write. */
function operationKey(tenant: string, kind: string, id: string) {
  return ScheduleOperationKeySchema.parse(
    `${kind}:${createHash('sha256')
      .update(JSON.stringify([tenant, kind, id]))
      .digest('hex')}`,
  )
}

function createRequestOf(tenant: string, body: Create): ScheduleCreateRequest | undefined {
  const definition = definitionOf(body.definition)
  if (definition === undefined) return undefined
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

function commandOf(tenant: string, body: Manage): ScheduleCommand | undefined {
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
    case 'edit':
      return {
        ...common,
        action: 'update',
        patch: { kind: 'executionText', instruction: action.instruction, label: null },
      } as ScheduleCommand
    case 'revise':
    case 'replace': {
      const definition = definitionOf(action.definition)
      if (definition === undefined) return undefined
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

  /** A recorded rejection committed nothing; resending the same ids answers the refusal itself. */
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

  return { prepare, read, commit, recall }
}
type Steps = ReturnType<typeof stepsOf>

function readHandlers(
  { prepare, read }: Steps,
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
        const definition = definitionOf(body.source.definition)
        if (definition === undefined) return invalid('invalid_input')
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
}: Steps): Pick<
  Handlers,
  'create-schedule' | 'query-create-schedule' | 'manage-schedule' | 'query-manage-schedule'
> {
  return {
    async 'create-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const request = createRequestOf(ready.tenantText, body)
      if (request === undefined) return invalid('invalid_input')
      return commit(
        () => ready.faces.commands.create(ready.context, request),
        ['invalid', 'unsupported', 'conflict', 'limited'],
      )
    },
    async 'query-create-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const request = createRequestOf(ready.tenantText, body)
      if (request === undefined) return { outcome: 'not-committed', body: {} }
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
      const command = commandOf(ready.tenantText, body)
      if (command === undefined) return invalid('invalid_input')
      return commit(
        () => ready.faces.commands.execute(ready.context, command),
        ['invalid', 'unsupported', 'conflict', 'limited', 'not-visible'],
      )
    },
    async 'query-manage-schedule'(call, body) {
      const ready = await prepare(call.principal, body.tenant)
      if (ready.outcome !== null) return ready
      const command = commandOf(ready.tenantText, body)
      if (command === undefined) return { outcome: 'not-visible', body: {} }
      return recall(
        ready.context,
        ready.faces,
        { kind: 'execute', owner: ready.context.owner, input: command },
        ['not-visible'],
      )
    },
  }
}

export function createScheduleContribution(
  input: ScheduleContributionInput,
): Omit<AccessContribution<ScheduleProtocol>, 'protocol'> {
  const steps = stepsOf(input)
  return {
    operations: { ...readHandlers(steps, input), ...writeHandlers(steps) },
    observations: {},
  }
}
