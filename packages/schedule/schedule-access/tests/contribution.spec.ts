import { describe, expect, it } from 'vitest'
import type { BodyOf, LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { ScheduleCallContext, ScheduleInstant } from '@omne-harness/schedule-contract'
import { createScheduleContribution, type ScheduleFaces } from '@omne-harness/schedule-access'
import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'

const tenantId = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return tenant(parsed.value.organization, parsed.value.account)
})()
const call = { principal: {} as LoginIdentity } as never
const context = {
  requestId: 'r-1',
  owner: { kind: 'tenant', tenantId: 't', ownerId: 'a' },
} as unknown as ScheduleCallContext
const at = '2026-11-17T00:00:00.000Z'
const ID = '7d1c2c0e-3b1f-4a52-9c1b-8f3e2a6d5b40'
const view = (control: string) => ({
  scheduleId: ID,
  owner: { kind: 'tenant', tenantId: 't', ownerId: 'a' },
  author: {
    kind: 'agent',
    actorRef: 'agent',
    originatingSessionRef: 'session-1',
    originatingCallRef: 'call-1',
  },
  createdBy: 'p',
  createdAt: at,
  definition: { label: control },
  revision: 2,
  control,
  standing: { kind: 'ready' },
  nextOccurrence: null,
})
const error = (code: string) => ({
  code,
  message: code,
  retryable: false,
  requestId: 'r-1',
  details: {},
})
const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65536,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('tree')
  return read.value
}

function world(
  faces: Partial<Record<string, unknown>> | null,
  refused?: 'denied' | 'basis-unavailable',
) {
  const asked: [string, unknown][] = []
  const watchers: { tenantText: string; listener: { changed(): void; closed(): void } }[] = []
  const unwatched = { count: 0 }
  const reply = (name: string) => async (_context: unknown, input: unknown) => {
    asked.push([name, input])
    const value = faces?.[name]
    if (value instanceof Error) throw value
    return value
  }
  const all = ['list', 'get', 'revisions', 'agenda', 'preview', 'executions']
  const built =
    faces === null
      ? undefined
      : ({
          queries: Object.fromEntries(all.map(name => [name, reply(name)])),
          commands: {
            create: reply('create'),
            execute: reply('execute'),
            queryOperation: reply('queryOperation'),
          },
          jobs: {
            get: reply('job.get'),
            cancel: reply('job.cancel'),
            queryCancel: reply('job.queryCancel'),
            start: reply('job.start'),
            queryStart: reply('job.queryStart'),
            watch: (tenantText: string, listener: { changed(): void; closed(): void }) => {
              watchers.push({ tenantText, listener })
              return () => {
                unwatched.count += 1
              }
            },
          },
        } as unknown as ScheduleFaces)
  const contribution = createScheduleContribution({
    principals: {
      async actingFor() {
        return refused === undefined ? { ok: {} as Principal } : { refused }
      },
      contextOf: () => context,
    },
    faces: () => built,
    requestId: () => 'r-1',
    clock: { now: () => at as ScheduleInstant },
  })
  return {
    ops: contribution.operations,
    observe: contribution.observations['observe-jobs'],
    asked,
    watchers,
    unwatched,
  }
}
const list = { tenant: tenantId, control: null, terminal: false, cursor: null, limit: 50 }
type ManageAction = BodyOf<ScheduleProtocol['operations']['manage-schedule']>['action']
const manage = (action: ManageAction) => ({
  tenant: tenantId,
  actionId: 'a-1',
  schedule: ID,
  revision: 2,
  action,
})

describe('the first three steps', () => {
  it.each([
    ['a refused login', {}, 'denied' as const, 'denied'],
    ['an unavailable identity', {}, 'basis-unavailable' as const, 'basis-unavailable'],
    ['no schedule row', null, undefined, 'basis-unavailable'],
  ])('%s stops before the domain', async (_label, faces, refused, outcome) => {
    const { ops, asked } = world(faces, refused)
    expect(await ops['list-schedules'](call, list)).toEqual({ outcome })
    expect(await ops['manage-schedule'](call, manage({ kind: 'pause', reason: null }))).toEqual({
      outcome,
    })
    expect(asked).toEqual([])
  })
})

describe('reads', () => {
  it('hides terminal schedules unless the caller asks for them', async () => {
    const page = {
      kind: 'ok',
      value: { items: [view('active'), view('stopped'), view('discarded')], nextCursor: null },
    }
    const shown = await world({ list: page }).ops['list-schedules'](call, list)
    expect(shown).toMatchObject({ outcome: 'succeeded', body: { items: [{ control: 'active' }] } })
    const all = await world({ list: page }).ops['list-schedules'](call, { ...list, terminal: true })
    expect(all).toMatchObject({ body: { items: [{}, {}, {}] } })
  })

  it('answers a schedule with who created it, and with no consent it took effect on', async () => {
    const { ops } = world({ get: { kind: 'ok', value: view('active') } })
    const answer = await ops['read-schedule'](call, { tenant: tenantId, schedule: ID })
    expect(answer).toMatchObject({
      outcome: 'succeeded',
      body: { author: { kind: 'agent', session: 'session-1' } },
    })
    expect((answer as { body: object }).body).not.toHaveProperty('basis')
  })

  it('answers another tenant and a missing schedule the same way', async () => {
    for (const code of ['forbidden', 'not_found'])
      expect(
        await world({ get: { kind: 'error', error: error(code) } }).ops['read-schedule'](call, {
          tenant: tenantId,
          schedule: ID,
        }),
      ).toEqual({ outcome: 'not-visible', body: {} })
  })

  it('answers an unavailable basis when a read throws', async () => {
    expect(await world({ list: new Error('down') }).ops['list-schedules'](call, list)).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('names a coverage gap of the agenda', async () => {
    const { ops } = world({ agenda: { kind: 'error', error: error('coverage_insufficient') } })
    expect(
      await ops['read-agenda'](call, {
        tenant: tenantId,
        from: '2026-11-01',
        to: '2026-12-01',
        timezone: 'Asia/Shanghai',
        cursor: null,
      }),
    ).toEqual({ outcome: 'unsupported', body: { code: 'coverage_insufficient' } })
  })
})

describe('writes', () => {
  it('turns a thrown or unknown write into unknown, never a success or a failure', async () => {
    for (const execute of [
      new Error('lost'),
      { kind: 'unknown', operationRef: 'o', retryAfterMs: 0 },
    ])
      expect(
        await world({ execute }).ops['manage-schedule'](
          call,
          manage({ kind: 'pause', reason: null }),
        ),
      ).toEqual({ outcome: 'unknown' })
  })

  it.each([
    ['revision_conflict', { outcome: 'conflict', body: { code: 'revision_conflict' } }],
    ['capacity_exceeded', { outcome: 'limited', body: {} }],
    ['invalid_transition', { outcome: 'invalid', body: { code: 'invalid_transition' } }],
    ['forbidden', { outcome: 'not-visible', body: {} }],
    ['provider_failure', { outcome: 'basis-unavailable' }],
  ])('maps the refusal %s', async (code, outcome) => {
    const { ops } = world({ execute: { kind: 'rejected', error: error(code) } })
    expect(await ops['manage-schedule'](call, manage({ kind: 'stop', reason: null }))).toEqual(
      outcome,
    )
  })

  it('derives the same operation key from the same client id, and refuses an invalid definition before the domain', async () => {
    const { ops, asked } = world({
      create: { kind: 'committed', operationRef: 'o', value: view('active'), replayed: false },
    })
    const body = {
      tenant: tenantId,
      createId: 'c-1',
      definition: tree({ label: 'x' }),
      state: 'active' as const,
      reason: null,
    }
    expect(await ops['create-schedule'](call, body)).toEqual({
      outcome: 'invalid',
      body: { code: 'invalid_input' },
    })
    expect(asked).toEqual([])
  })

  it('sends each human action as the domain command', async () => {
    const committed = {
      kind: 'committed',
      operationRef: 'o',
      value: view('paused'),
      replayed: false,
    }
    const { ops, asked } = world({ execute: committed })
    await ops['manage-schedule'](call, manage({ kind: 'rename', label: '新名字' }))
    await ops['manage-schedule'](call, manage({ kind: 'resume', reason: '回来' }))
    expect(asked.map(([, input]) => input)).toMatchObject([
      {
        action: 'update',
        patch: { kind: 'label', label: '新名字' },
        meta: { expectedRevision: 2 },
      },
      { action: 'resume', reason: '回来' },
    ])
    const [first, second] = asked.map(
      ([, input]) => (input as { meta: { operationKey: string } }).meta.operationKey,
    )
    expect(first).toBe(second)
  })
})

const DEFINITION = tree({
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
  binding: { kind: 'followUserEnvironment' },
  calendarOverlay: null,
  purpose: {
    kind: 'reminder',
    content: { title: '月报', body: '交本月的月报' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
})
const create = {
  tenant: tenantId,
  createId: 'c-1',
  definition: DEFINITION,
  state: 'active' as const,
  reason: null,
}

describe('preview', () => {
  const candidate = {
    scheduledAt: '2026-11-30T09:00:00.000Z',
    displayLocal: '2026-11-30T17:00:00',
    basis: { calendarId: 'cn-legal-holidays', calendarVersionId: 'v1' },
  }

  it('previews a definition, at most a hundred times, and names the calendar of each time', async () => {
    const { ops, asked } = world({
      preview: { kind: 'ok', value: { candidates: [candidate], complete: true } },
    })
    const answer = await ops.preview(call, {
      tenant: tenantId,
      source: { kind: 'definition', definition: DEFINITION },
      count: 500,
    })
    expect(answer).toMatchObject({ outcome: 'succeeded', body: { complete: true } })
    expect(asked).toMatchObject([
      ['preview', { source: { kind: 'inline' }, count: 100, after: at }],
    ])
  })

  it.each([
    [
      { kind: 'schedule' as const, schedule: 'not-an-id' },
      { outcome: 'not-visible', body: {} },
    ],
    [
      { kind: 'definition' as const, definition: tree({ label: 'x' }) },
      { outcome: 'invalid', body: { code: 'invalid_input' } },
    ],
  ])('refuses a source it cannot name before the domain: %j', async (source, outcome) => {
    const { ops, asked } = world({})
    expect(await ops.preview(call, { tenant: tenantId, source, count: 3 })).toEqual(outcome)
    expect(asked).toEqual([])
  })

  it('previews a saved schedule by its id, and maps a refusal and a throw', async () => {
    const source = { kind: 'schedule' as const, schedule: ID }
    const body = { tenant: tenantId, source, count: 3 }
    const refusedPreview = world({ preview: { kind: 'error', error: error('not_found') } })
    expect(await refusedPreview.ops.preview(call, body)).toEqual({
      outcome: 'not-visible',
      body: {},
    })
    expect(refusedPreview.asked).toMatchObject([
      ['preview', { source: { kind: 'schedule', scheduleId: ID } }],
    ])
    expect(await world({ preview: new Error('down') }).ops.preview(call, body)).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})

describe('revisions', () => {
  const body = { tenant: tenantId, schedule: ID, cursor: null, limit: 1000 }
  const revision = {
    scheduleId: ID,
    revision: 3,
    stateRevision: 2,
    definitionRevision: 1,
    actor: { kind: 'human', actorRef: 'a' },
    action: 'pause',
    occurredAt: at,
    reason: null,
  }

  it('shows each change with the schedule revision it made', async () => {
    const { ops, asked } = world({
      revisions: { kind: 'ok', value: { items: [revision], nextCursor: 'n' } },
    })
    expect(await ops['read-revisions'](call, body)).toMatchObject({
      outcome: 'succeeded',
      body: { items: [{ revision: 3, action: 'pause', actor: 'human' }], next: 'n' },
    })
    expect(asked).toMatchObject([['revisions', { limit: 500 }]])
  })

  it.each([
    ['an id that is not one', { ...body, schedule: 'x' }, {}, { outcome: 'not-visible', body: {} }],
    [
      'another tenant',
      body,
      { revisions: { kind: 'error', error: error('forbidden') } },
      { outcome: 'not-visible', body: {} },
    ],
    ['a throw', body, { revisions: new Error('down') }, { outcome: 'basis-unavailable' }],
  ])('answers %s', async (_, input, faces, outcome) => {
    expect(await world(faces).ops['read-revisions'](call, input)).toEqual(outcome)
  })
})

describe('recall', () => {
  const committed = {
    kind: 'ok',
    value: { kind: 'committed', operationRef: 'o', result: view('active'), replayed: true },
  }

  it('recalls a create by the same client id, with the same address the create used', async () => {
    const { ops, asked } = world({ queryOperation: committed })
    expect(await ops['query-create-schedule'](call, create)).toMatchObject({
      outcome: 'succeeded',
      body: { schedule: ID },
    })
    expect(asked).toMatchObject([['queryOperation', { kind: 'identity' }]])
  })

  it.each([
    [
      'not committed',
      { kind: 'ok', value: { kind: 'notCommitted' } },
      { outcome: 'not-committed', body: {} },
    ],
    ['still pending', { kind: 'ok', value: { kind: 'pending' } }, { outcome: 'basis-unavailable' }],
    [
      'rejected',
      { kind: 'ok', value: { kind: 'rejected', error: error('revision_conflict') } },
      { outcome: 'not-committed', body: {} },
    ],
    [
      'unreadable',
      { kind: 'error', error: error('provider_failure') },
      { outcome: 'basis-unavailable' },
    ],
    ['a throw', new Error('down'), { outcome: 'basis-unavailable' }],
  ])('answers a create recall that is %s', async (_, queryOperation, outcome) => {
    expect(await world({ queryOperation }).ops['query-create-schedule'](call, create)).toEqual(
      outcome,
    )
  })

  it('answers a create it could never have sent as not committed, without asking', async () => {
    const { ops, asked } = world({})
    expect(
      await ops['query-create-schedule'](call, { ...create, definition: tree({ label: 'x' }) }),
    ).toEqual({ outcome: 'not-committed', body: {} })
    expect(asked).toEqual([])
  })

  it('recalls a manage action, and answers a refused one as the caller would have seen it', async () => {
    expect(
      await world({ queryOperation: committed }).ops['query-manage-schedule'](
        call,
        manage({ kind: 'pause', reason: null }),
      ),
    ).toMatchObject({ outcome: 'succeeded' })
    expect(
      await world({
        queryOperation: { kind: 'ok', value: { kind: 'rejected', error: error('not_found') } },
      }).ops['query-manage-schedule'](call, manage({ kind: 'pause', reason: null })),
    ).toEqual({ outcome: 'not-visible', body: {} })
    const { ops, asked } = world({})
    expect(
      await ops['query-manage-schedule'](call, {
        ...manage({ kind: 'pause', reason: null }),
        schedule: 'x',
      }),
    ).toEqual({ outcome: 'not-visible', body: {} })
    expect(asked).toEqual([])
  })
})

describe('the remaining human actions', () => {
  const committed = { kind: 'committed', operationRef: 'o', value: view('draft'), replayed: false }

  it('sends an edit, a revision of a draft and a replacement as their domain commands', async () => {
    const { ops, asked } = world({ execute: committed })
    await ops['manage-schedule'](call, manage({ kind: 'edit', instruction: '写周报' }))
    await ops['manage-schedule'](
      call,
      manage({ kind: 'revise', definition: DEFINITION, reason: '改时间' }),
    )
    await ops['manage-schedule'](
      call,
      manage({ kind: 'replace', definition: DEFINITION, reason: '换' }),
    )
    expect(asked.map(([, input]) => input)).toMatchObject([
      { action: 'update', patch: { kind: 'executionText', instruction: '写周报', label: null } },
      { action: 'reviseDraft', reason: '改时间', definition: { label: '交月报' } },
      { action: 'replace', reason: '换', successor: { label: '交月报' } },
    ])
  })

  it.each([
    [
      'a schedule id that is not one',
      { ...manage({ kind: 'pause', reason: null }), schedule: 'x' },
    ],
    [
      'a revision with an invalid definition',
      manage({ kind: 'revise', definition: tree({ label: 'x' }), reason: 'r' }),
    ],
    [
      'a replacement with an invalid definition',
      manage({ kind: 'replace', definition: tree({ label: 'x' }), reason: 'r' }),
    ],
  ])('refuses %s before the domain', async (_, body) => {
    const { ops, asked } = world({})
    expect(await ops['manage-schedule'](call, body)).toEqual({
      outcome: 'invalid',
      body: { code: 'invalid_input' },
    })
    expect(asked).toEqual([])
  })
})

/** An answer as the client receives it: the succeeded body written through the operation's codec. */
function wire(op: keyof ScheduleProtocol['operations'], answer: unknown): unknown {
  const value = answer as { outcome: string; body?: unknown }
  if (value.outcome !== 'succeeded') return value
  const written = scheduleProtocol.operations[op].outcomes.succeeded.write(value.body as never, {
    maxBytes: 100_000,
    maxDepth: 50,
    maxItems: 10_000,
    maxMembers: 100,
    maxStringLength: 10_000,
    maxNumberLength: 100,
  })
  if (!written.ok) throw new Error('not writable')
  return { outcome: 'succeeded', body: JSON.parse(writeJsonText(written.value)) }
}

const JOB = '0d6c1f8e-2a4b-4c3d-8e5f-6a7b8c9d0e1f'
const summary = {
  jobId: JOB,
  revision: 3,
  acceptedAt: at,
  body: {
    kind: 'execution',
    executionRef: 'program:g:j',
    executionState: 'running',
    terminalReceiptRef: null,
    outcome: null,
  },
  stopState: 'none',
  stopOperationRef: null,
  stopReceiptRef: null,
}
const detail = {
  job: summary,
  scheduleId: ID,
  slot: null,
  purpose: {
    kind: 'execution',
    work: { kind: 'program', programRef: 'probe', input: {} },
    scope: { kind: 'fleet' },
    catchUp: { kind: 'none' },
    overlap: 'parallel',
    misfire: null,
    notifications: [],
  },
  definitionRevision: 1,
  reason: null,
  executionWhere: { kind: 'program', programRef: 'probe', executionRef: 'program:g:j' },
  events: [{ seq: 1, kind: 'accepted', at }],
}
const shownJob = {
  job: JOB,
  state: 'running',
  outcome: null,
  stop: 'none',
  acceptedAt: at,
  schedule: ID,
  slot: null,
  work: { kind: 'program', programRef: 'probe', input: {} },
  reason: null,
  where: { kind: 'program', program: 'probe', execution: 'program:g:j' },
  events: [{ seq: 1, kind: 'accepted', at }],
}
const ok = (value: unknown) => ({ kind: 'ok', value })
const failed = (code: string) => ({ kind: 'error', error: error(code) })
const work = tree({ kind: 'program', programRef: 'probe', input: {} })

describe('Jobs: list, read, cancel, start', () => {
  it('lists the history of a schedule or the tenant, row by row; a malformed id is not visible without asking', async () => {
    const rows = [
      {
        kind: 'lapse',
        rowRef: 'lapse:1',
        scheduleId: ID,
        originalScheduledAt: at,
        through: at,
        cause: 'stopped',
        reason: 'catch-up-none',
        count: 2,
        selected: 0,
      },
      { kind: 'direct', rowRef: 'direct:1', originalScheduledAt: at, job: summary },
    ]
    const w = world({ executions: ok({ items: rows, nextCursor: 'c-2' }) })
    const body = { tenant: tenantId, schedule: null, cursor: null, limit: 500 }
    expect(wire('list-jobs', await w.ops['list-jobs'](call, body))).toMatchObject({
      outcome: 'succeeded',
      body: {
        items: [
          { kind: 'lapse', row: 'lapse:1', count: 2, through: at },
          { kind: 'direct', row: 'direct:1', job: { job: JOB, state: 'running' } },
        ],
        next: 'c-2',
      },
    })
    expect(w.asked).toEqual([
      ['executions', { scheduleId: null, from: null, to: null, cursor: null, limit: 200 }],
    ])
    const malformed = world({})
    expect(
      wire('list-jobs', await malformed.ops['list-jobs'](call, { ...body, schedule: 'not-an-id' })),
    ).toEqual({
      outcome: 'not-visible',
      body: {},
    })
    expect(malformed.asked).toEqual([])
    expect(
      wire(
        'list-jobs',
        await world({ executions: failed('not_found') }).ops['list-jobs'](call, {
          ...body,
          schedule: ID,
        }),
      ),
    ).toEqual({ outcome: 'not-visible', body: {} })
    expect(
      wire(
        'list-jobs',
        await world({ executions: new Error('down') }).ops['list-jobs'](call, body),
      ),
    ).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('reads one Job in full; another tenant and a missing one answer the same; a throw is an unavailable basis', async () => {
    const body = { tenant: tenantId, job: JOB }
    expect(
      wire('read-job', await world({ 'job.get': ok(detail) }).ops['read-job'](call, body)),
    ).toEqual({
      outcome: 'succeeded',
      body: shownJob,
    })
    expect(
      wire('read-job', await world({ 'job.get': failed('not_found') }).ops['read-job'](call, body)),
    ).toEqual({
      outcome: 'not-visible',
      body: {},
    })
    expect(
      wire('read-job', await world({ 'job.get': new Error('x') }).ops['read-job'](call, body)),
    ).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('cancels with a key from the tenant, the client id and the Job; unknown and a throw are unknown', async () => {
    const body = { tenant: tenantId, actionId: 'c-1', job: JOB }
    const committed = world({ 'job.cancel': ok({ outcome: 'committed', detail }) })
    expect(wire('cancel-job', await committed.ops['cancel-job'](call, body))).toEqual({
      outcome: 'succeeded',
      body: { changed: true, job: shownJob },
    })
    const again = world({ 'job.cancel': ok({ outcome: 'noChange', detail }) })
    expect(wire('cancel-job', await again.ops['cancel-job'](call, body))).toEqual({
      outcome: 'succeeded',
      body: { changed: false, job: shownJob },
    })
    expect(committed.asked[0]?.[1]).toEqual(again.asked[0]?.[1])
    const unknown = { outcome: 'unknown', detail: null }
    expect(
      wire('cancel-job', await world({ 'job.cancel': ok(unknown) }).ops['cancel-job'](call, body)),
    ).toEqual({
      outcome: 'unknown',
    })
    expect(
      wire(
        'cancel-job',
        await world({ 'job.cancel': new Error('x') }).ops['cancel-job'](call, body),
      ),
    ).toEqual({
      outcome: 'unknown',
    })
    expect(
      wire(
        'cancel-job',
        await world({ 'job.cancel': failed('not_found') }).ops['cancel-job'](call, body),
      ),
    ).toEqual({ outcome: 'not-visible', body: {} })
  })

  it('recalls a cancel: committed is the Job, otherwise not committed', async () => {
    const body = { tenant: tenantId, actionId: 'c-1', job: JOB }
    expect(
      wire(
        'query-cancel-job',
        await world({ 'job.queryCancel': ok({ committed: true, detail }) }).ops['query-cancel-job'](
          call,
          body,
        ),
      ),
    ).toEqual({ outcome: 'succeeded', body: shownJob })
    expect(
      wire(
        'query-cancel-job',
        await world({ 'job.queryCancel': ok({ committed: false, detail }) }).ops[
          'query-cancel-job'
        ](call, body),
      ),
    ).toEqual({ outcome: 'not-committed', body: {} })
    expect(
      wire(
        'query-cancel-job',
        await world({ 'job.queryCancel': new Error('x') }).ops['query-cancel-job'](call, body),
      ),
    ).toEqual({ outcome: 'basis-unavailable' })
  })

  it('starts a Job directly: work that is not work is refused before asking; other work under the id is a conflict; unknown stays unknown', async () => {
    const body = { tenant: tenantId, startId: 's-1', work }
    expect(
      wire(
        'start-job',
        await world({ 'job.start': ok({ outcome: 'committed', detail }) }).ops['start-job'](
          call,
          body,
        ),
      ),
    ).toEqual({ outcome: 'succeeded', body: shownJob })
    const refusedWork = world({})
    expect(
      await refusedWork.ops['start-job'](call, { ...body, work: tree({ kind: 'script' }) }),
    ).toEqual({ outcome: 'invalid', body: { code: 'invalid_input' } })
    expect(refusedWork.asked).toEqual([])
    expect(
      wire(
        'start-job',
        await world({ 'job.start': failed('operation_key_conflict') }).ops['start-job'](call, body),
      ),
    ).toEqual({ outcome: 'conflict', body: { code: 'operation_key_conflict' } })
    expect(
      wire(
        'start-job',
        await world({ 'job.start': ok({ outcome: 'unknown', detail: null }) }).ops['start-job'](
          call,
          body,
        ),
      ),
    ).toEqual({ outcome: 'unknown' })
    expect(
      wire('start-job', await world({ 'job.start': new Error('x') }).ops['start-job'](call, body)),
    ).toEqual({
      outcome: 'unknown',
    })
  })

  it('recalls a direct start: committed, not committed, or a conflict', async () => {
    const body = { tenant: tenantId, startId: 's-1', work }
    expect(
      wire(
        'query-start-job',
        await world({ 'job.queryStart': ok({ committed: true, detail }) }).ops['query-start-job'](
          call,
          body,
        ),
      ),
    ).toEqual({ outcome: 'succeeded', body: shownJob })
    expect(
      wire(
        'query-start-job',
        await world({ 'job.queryStart': ok({ committed: false, detail: null }) }).ops[
          'query-start-job'
        ](call, body),
      ),
    ).toEqual({ outcome: 'not-committed', body: {} })
    expect(
      wire(
        'query-start-job',
        await world({ 'job.queryStart': failed('operation_key_conflict') }).ops['query-start-job'](
          call,
          body,
        ),
      ),
    ).toEqual({ outcome: 'conflict', body: { code: 'operation_key_conflict' } })
  })
})

describe('observe-jobs', () => {
  it('opens with a frame, sends one more each time the tenant changes, and ends when the schedule row goes', async () => {
    const w = world({})
    const controller = new AbortController()
    const opened = await w.observe?.({ principal: {}, signal: controller.signal } as never, {
      tenant: tenantId,
    })
    if (opened === undefined || !('frames' in opened)) throw new Error('not opened')
    const frames = opened.frames
    expect(await frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    const encoded = tenantCodec.encode(tenantId)
    expect(w.watchers.map(item => item.tenantText)).toEqual([encoded.ok ? encoded.value : null])
    w.watchers[0]?.listener.changed()
    expect(await frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    w.watchers[0]?.listener.closed()
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
    expect(w.unwatched.count).toBe(1)
  })

  it('answers a refused login and a missing row before watching', async () => {
    const signal = new AbortController().signal
    const denied = world({}, 'denied')
    expect(
      await denied.observe?.({ principal: {}, signal } as never, { tenant: tenantId }),
    ).toEqual({
      outcome: 'denied',
    })
    const gone = world(null)
    expect(await gone.observe?.({ principal: {}, signal } as never, { tenant: tenantId })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect([...denied.watchers, ...gone.watchers]).toEqual([])
  })
})
