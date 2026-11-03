import { expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  ScheduleListResultSchema,
  ScheduleManagementResultSchema,
} from '@omne-harness/schedule-contract'
import {
  createScheduleToolEnvironment,
  createScheduleToolModule,
  scheduleToolArgumentsSchema,
  scheduleToolParameterCodec,
  scheduleToolResultSchema,
  renderScheduleToolSummary,
} from '@omne-harness/schedule-tools'
import { original, baseEnvironment } from './recovery.ts'
import {
  access,
  context,
  adoption,
  evidence,
  author,
  argumentsOf,
  definition,
  scheduleId,
  services,
  value,
  run,
  view,
} from './world.ts'
const filter = {
  agentRef: null,
  control: null,
  standing: null,
  createdBy: null,
  targetDeviceRef: null,
  calendarId: null,
  purpose: null,
}
const commandMeta = { expectedRevision: 1, consentRef: null }
const readInputs = [
  {
    action: 'queryOperation',
    input: { kind: 'ref', operationRef: '00000000-0000-4000-8000-000000000009' },
  },
  { action: 'list', input: { ...filter, cursor: null, limit: 20 } },
  { action: 'get', input: { scheduleId } },
  { action: 'revisions', input: { scheduleId, cursor: null, limit: 20 } },
  { action: 'executions', input: { scheduleId, from: null, to: null, cursor: null, limit: 20 } },
  {
    action: 'agenda',
    input: {
      from: '2026-11-04T00:00:00',
      to: '2026-11-05T00:00:00',
      timezone: 'UTC',
      filter,
      cursor: null,
      limit: 20,
    },
  },
  {
    action: 'preview',
    input: { source: { kind: 'inline', definition }, after: '2026-11-04T00:00:00.000Z', count: 2 },
  },
]
const commands = [
  { action: 'update', patch: { kind: 'label', label: 'new' } },
  { action: 'reviseDraft', definition, reason: 'revise' },
  { action: 'reconfirmConsent', newConsentRef: 'consent', reason: 'renew' },
  ...['pause', 'resume', 'stop', 'promote', 'discard'].map(action => ({ action, reason: null })),
  { action: 'replace', successor: definition, reason: 'replace' },
].map(command => ({ action: 'execute', input: { ...command, scheduleId, meta: commandMeta } }))
const create = {
  action: 'create',
  input: {
    definition,
    initial: { kind: 'draft', reason: 'consent' },
    meta: { expectedRevision: null, consentRef: null },
  },
}
it('routes all nine actions and every command variant through the public author using fixed context', async () => {
  const calls: unknown[] = []
  const commandServices = {
    create: vi.fn(services.commands.create),
    execute: vi.fn(services.commands.execute),
    queryOperation: vi.fn(services.commands.queryOperation),
  }
  const queryServices = {
    list: vi.fn(services.queries.list),
    get: vi.fn(services.queries.get),
    revisions: vi.fn(services.queries.revisions),
    executions: vi.fn(services.queries.executions),
    agenda: vi.fn(services.queries.agenda),
    preview: vi.fn(services.queries.preview),
  }
  for (const input of [create, ...commands, ...readInputs]) {
    const { recovery, preparation } = await original(input)
    const environment = createScheduleToolEnvironment(baseEnvironment(), {
      commands: { loadRecovery: async () => succeed(recovery) },
      contexts: {
        restore: async () =>
          succeed({
            ...access(),
            admission: recovery.admission,
            context,
            adapter: adoption,
            source: evidence('context'),
          }),
      },
    })
    const prepared = value(await environment.prepare({ ...access(), preparation }))
    if (prepared.kind !== 'prepared') throw new Error('missing prepared')
    const returned = await run(input, prepared.environment.value, {
      commands: commandServices,
      queries: queryServices,
    })
    expect(returned.returned).toMatchObject({ kind: 'result', action: input.action })
    expect(returned.rendered).toHaveProperty('ok.data.kind', 'json')
    calls.push(returned.returned)
  }
  expect(commandServices.create).toHaveBeenCalledOnce()
  expect(commandServices.execute).toHaveBeenCalledTimes(commands.length)
  expect(commandServices.queryOperation).toHaveBeenCalledOnce()
  for (const method of Object.values(queryServices)) {
    expect(method).toHaveBeenCalledOnce()
    expect(method.mock.calls[0]?.[0]).toEqual(context)
  }
  expect(calls).toHaveLength(17)
})
it('rejects forged identity/key, omitted initial and metadata, duplicate JSON, and action/result mismatches', async () => {
  for (const key of ['owner', 'principal', 'actor', 'session', 'operationKey']) {
    expect(scheduleToolArgumentsSchema.safeParse({ ...create, [key]: 'forged' }).success).toBe(
      false,
    )
    expect(
      scheduleToolArgumentsSchema.safeParse({
        ...create,
        input: { ...create.input, [key]: 'forged' },
      }).success,
    ).toBe(false)
    expect(
      scheduleToolArgumentsSchema.safeParse({
        ...create,
        input: { ...create.input, meta: { ...create.input.meta, [key]: 'forged' } },
      }).success,
    ).toBe(false)
  }
  for (const meta of [{ expectedRevision: null }, { consentRef: null }])
    expect(
      scheduleToolArgumentsSchema.safeParse({ ...create, input: { ...create.input, meta } })
        .success,
    ).toBe(false)
  expect(
    scheduleToolArgumentsSchema.safeParse({
      ...create,
      input: { definition, meta: create.input.meta },
    }).success,
  ).toBe(false)
  expect(
    scheduleToolParameterCodec.parse({
      complete: true,
      original: '',
      effective: '{"action":"get","action":"list"}',
    }),
  ).toHaveProperty('failure.kind', 'invalid')
  expect(
    scheduleToolParameterCodec.parse({ ...argumentsOf(create), complete: false }),
  ).toHaveProperty('failure.kind', 'incomplete')
  expect(
    createScheduleToolModule(services).createAuthor({
      kind: 'object',
      entries: [{ key: 'owner', value: { kind: 'string', value: 'forged' } }],
    }),
  ).toHaveProperty('failure')
  const module = await author()
  const args = value(module.author.parameters.parse(argumentsOf(readInputs[2])))
  expect(
    module.author.output.check({
      arguments: args,
      value: {
        kind: 'result',
        action: 'list',
        operation: null,
        result: { kind: 'ok', value: view },
      },
    }),
  ).toHaveProperty('failure')
})
it('keeps exact totals, pagination, control and errors in bounded summaries and fails explicitly when metadata or full data exceeds its budget', async () => {
  const result = scheduleToolResultSchema.parse({
    kind: 'result',
    action: 'list',
    operation: null,
    result: ScheduleListResultSchema.parse({
      kind: 'ok',
      value: {
        items: Array.from({ length: 3 }, () => ({
          ...view,
          definition: {
            ...definition,
            purpose: { ...definition.purpose, content: { title: null, body: 'x'.repeat(15_000) } },
          },
        })),
        nextCursor: 'page-two',
        observationRevision: 'snapshot',
        complete: false,
        total: { kind: 'exact', value: 501 },
      },
    }),
  })
  const summary = value(renderScheduleToolSummary(result))
  expect(Buffer.byteLength(summary)).toBeLessThanOrEqual(32768)
  expect(summary).toContain('"value":501')
  expect(summary).toContain('page-two')
  expect(summary).toContain('"control":"draft"')
  expect(summary).toContain('"complete":false')
  expect(summary).toContain('"truncated":true')
  const module = await author()
  expect(module.author.codec.encode(result)).toHaveProperty('ok')
  const hugeError = {
    kind: 'result',
    action: 'create',
    operation: {
      kind: 'identity',
      identity: {
        protocol: 'omne.calendar-schedule/1',
        operation: 'schedule.create',
        aggregate: { kind: 'create' },
        operationKey: 'fixed',
      },
      expectedFingerprint: 'a'.repeat(64),
    },
    result: ScheduleManagementResultSchema.parse({
      kind: 'rejected',
      error: {
        code: 'forbidden',
        message: 'x'.repeat(40_000),
        retryable: false,
        requestId: 'request',
        details: {},
      },
    }),
  }
  expect(renderScheduleToolSummary(scheduleToolResultSchema.parse(hugeError))).toHaveProperty(
    'failure.reason',
    'output_limit',
  )
  expect(
    module.author.codec.encode({
      ...hugeError,
      result: {
        ...hugeError.result,
        error: {
          code: 'forbidden',
          message: 'x'.repeat(1_048_577),
          retryable: false,
          requestId: 'request',
          details: {},
        },
      },
    }),
  ).toHaveProperty('failure.reason', 'output_limit')
})
