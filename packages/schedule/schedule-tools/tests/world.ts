import type {
  ScheduleCallContext,
  ScheduleCommandResult,
  ScheduleCommands,
  ScheduleQueries,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import { createIndependentToolScope } from '@omne-harness/tool'
import type { ToolDecision } from '@omne-harness/tool-contract'
import {
  attachSchedules,
  bindSchedules,
  schedulesExecutor,
  schedulesParameterCodec,
  type SchedulesArguments,
  type SchedulesCommandName,
} from '@omne-harness/schedule-tools'

export const ID = '7d1c2c0e-3b1f-4a52-9c1b-8f3e2a6d5b40'
export const TENANT = 'tenant/o/a'
export const CALL = 'call-1'
export const NOW = '2026-11-17T00:00:00.000Z'
export const DEFINITION = {
  label: '交月报',
  recurrence: {
    kind: 'position',
    period: 'month',
    interval: 1,
    begin: '2026-11-01T00:00:00',
    until: null,
    ordinal: 'last',
    selector: { kind: 'workingDay' },
    times: ['17:00:00'],
  },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  purpose: {
    kind: 'reminder',
    content: { title: '月报', body: '交本月的月报' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
}

export const context = {
  principalRef: 'principal/1/p',
  owner: { kind: 'tenant', tenantId: TENANT, ownerId: 'acc-a' },
  actor: { kind: 'agent', actorRef: 'principal/1/p' },
  authContextRef: 'tool/Schedules',
  requestId: CALL,
  originatingSessionRef: 'session-1',
} as unknown as ScheduleCallContext

export const view = (control = 'active', extra: object = {}) =>
  ({
    scheduleId: ID,
    owner: context.owner,
    author: { kind: 'agent', actorRef: 'principal/1/p', originatingSessionRef: 'session-1' },
    definition: {
      ...DEFINITION,
      binding: { kind: 'followUserEnvironment' },
      calendarOverlay: null,
    },
    revision: 1,
    control,
    standing: { kind: 'ready' },
    nextOccurrence: null,
    consentAdoption: null,
    createdAt: NOW,
    ...extra,
  }) as unknown as ScheduleView

export const committed = (value: ScheduleView): ScheduleCommandResult<ScheduleView> => ({
  kind: 'committed',
  operationRef: 'op-1' as never,
  value,
  replayed: false,
})
export const rejected = (code: string, details: object = {}): ScheduleCommandResult<ScheduleView> =>
  ({
    kind: 'rejected',
    error: { code, message: code, retryable: false, requestId: CALL, details },
  }) as ScheduleCommandResult<ScheduleView>

/** A schedule service whose writes answer in turn, recording what it was asked. */
export function services(writes: readonly (ScheduleCommandResult<ScheduleView> | Error)[]) {
  const asked: { kind: 'create' | 'execute'; input: any }[] = []
  let turn = 0
  const next = async (kind: 'create' | 'execute', input: unknown) => {
    asked.push({ kind, input })
    const answer = writes[turn++]
    if (answer === undefined) throw new Error('no scripted answer')
    if (answer instanceof Error) throw answer
    return answer
  }
  const commands = {
    create: (_c: unknown, input: unknown) => next('create', input),
    execute: (_c: unknown, input: unknown) => next('execute', input),
    queryOperation: async () => ({
      kind: 'ok',
      value: { kind: 'committed', result: view(), operationRef: 'op-1' },
    }),
  } as unknown as ScheduleCommands
  const queries = {
    preview: async () => ({
      kind: 'ok',
      value: {
        candidates: [
          {
            adjustedLocal: '2026-11-30T17:00:00',
            scheduledAt: '2026-11-30T09:00:00.000Z',
            basis: { calendarId: 'cn-legal-holidays', calendarVersionId: 'v1' },
          },
        ],
        complete: true,
      },
    }),
    get: async () => ({ kind: 'ok', value: view() }),
    list: async () => ({ kind: 'ok', value: { items: [view()], nextCursor: null } }),
    revisions: async () => ({ kind: 'ok', value: { items: [], nextCursor: null } }),
  } as unknown as ScheduleQueries
  return { commands, queries, asked }
}

export function scope(bound?: ReturnType<typeof bindSchedules>) {
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  return bound === undefined ? created.ok : attachSchedules(created.ok, bound)
}

export function bound(
  service: ReturnType<typeof services>,
  overrides: Partial<Parameters<typeof bindSchedules>[0]> = {},
) {
  return bindSchedules({
    tenant: TENANT,
    call: CALL,
    commands: () => service.commands,
    queries: () => service.queries,
    context: async () => context,
    now: () => NOW as never,
    ...overrides,
  })
}

export function parse(command: SchedulesCommandName, params: unknown): SchedulesArguments {
  const text = JSON.stringify(params)
  const parsed = schedulesParameterCodec(command).parse({
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
  return parsed.ok
}

const segment = (execution: ReturnType<typeof scope>) => ({
  emit: () => undefined,
  signal: execution.context.signal,
})

export async function first(args: SchedulesArguments, execution: ReturnType<typeof scope>) {
  const answer = await schedulesExecutor.initial(args, null, segment(execution) as never)
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

export async function second(
  state: Uint8Array,
  decision: ToolDecision<unknown>,
  execution: ReturnType<typeof scope>,
) {
  const answer = await schedulesExecutor.resume(
    { checkpoint: state, response: decision },
    null,
    segment(execution) as never,
  )
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

export const selected = (cardId: string, optionId: string): ToolDecision<unknown> => ({
  kind: 'answer',
  value: { answers: [{ cardId, kind: 'selection', optionId }] },
})
