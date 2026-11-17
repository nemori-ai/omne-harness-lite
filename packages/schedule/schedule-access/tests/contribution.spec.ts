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
const context = { requestId: 'r-1', owner: { kind: 'tenant' } } as unknown as ScheduleCallContext
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
      ? { grantRef: 'g', generation: 4, adoptionKind: 'blanket', scope: 'standing', adoptedAt: at }
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
        basis: { kind: 'blanket', generation: 4 },
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
        meta: { expectedRevision: 2, consentRef: null },
      },
      { action: 'resume', reason: '回来' },
    ])
    const [first, second] = asked.map(
      ([, input]) => (input as { meta: { operationKey: string } }).meta.operationKey,
    )
    expect(first).toBe(second)
  })
})
