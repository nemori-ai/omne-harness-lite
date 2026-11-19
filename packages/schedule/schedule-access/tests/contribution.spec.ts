import { describe, expect, it } from 'vitest'
import type { BodyOf, LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { readJsonText } from '@omne-harness/json-text'
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
  author: { kind: 'agent', actorRef: 'agent', originatingSessionRef: 'session-1' },
  createdBy: 'p',
  createdAt: at,
  definition: { label: control },
  revision: 2,
  control,
  standing: { kind: 'ready' },
  nextOccurrence: null,
  consentAdoption:
    control === 'active'
      ? { grantRef: 'g', adoptionKind: 'blanket', scope: 'standing', adoptedAt: at }
      : null,
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
  return { ops: contribution.operations, asked }
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

  it('names the consent a schedule took effect on, and the agent session that wrote it', async () => {
    const { ops } = world({ get: { kind: 'ok', value: view('active') } })
    expect(await ops['read-schedule'](call, { tenant: tenantId, schedule: ID })).toMatchObject({
      outcome: 'succeeded',
      body: {
        basis: { kind: 'blanket', scope: 'standing' },
        author: { kind: 'agent', session: 'session-1' },
      },
    })
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
    ['consent_required', { outcome: 'unsupported', body: { code: 'consent_required' } }],
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
