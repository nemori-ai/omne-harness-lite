// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { PointItem } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { createScheduleUiModule, scheduleJobTarget } from '../src/cordis.ts'
import { beganAt, openerOf, provenanceText, sessionOf } from '../src/model/job-session.ts'
import type { JobDetail } from '../src/model/jobs.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type Call } from './fixtures/fake-client.ts'
import { stubInView } from './fixtures/in-view.ts'
import { startShell } from './fixtures/reference-shell.ts'

type Client = ClientOf<ScheduleProtocol>
type Status = PointItem<{ readonly session: string }>
const OPERATIONS = Object.keys(scheduleProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(text)
  return parsed.value
}

/** A JSON value as the protocol client decodes it. */
function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  const entries = Object.entries(value as object).map(([key, inner]) => ({
    key,
    value: tree(inner),
  }))
  return { kind: 'object', entries }
}

const agentWork = (session: object) =>
  tree({ kind: 'agent', session, instruction: { purpose: '写月报' } })
const NEW = { mode: 'new', agentDefinitionRef: 'coding' }
const ACCOUNT = {
  definition: { name: 'coding', version: 'v7' },
  outcome: null,
  deliverables: [],
  since: 'e-4',
  run: 'run-2',
}
const JOB = {
  job: 'job_1',
  state: 'running',
  outcome: null,
  stop: 'none',
  origin: 'due',
  acceptedAt: instant('2026-11-30T09:00:00Z'),
  startedAt: instant('2026-11-30T09:00:00Z'),
  endedAt: null,
  schedule: 'sch_monthly',
  slot: instant('2026-11-30T09:00:00Z'),
  local: '2026-11-30T17:00:00',
  calendar: null,
  version: null,
  revision: 2,
  work: agentWork(NEW),
  reason: null,
  where: { kind: 'session', session: 's-9', account: ACCOUNT },
  events: [
    { seq: 1, kind: 'accepted', at: instant('2026-11-30T09:00:00Z') },
    { seq: 2, kind: 'startIntent', at: instant('2026-11-30T09:00:01Z') },
    { seq: 3, kind: 'taken', at: instant('2026-11-30T09:00:02Z') },
    { seq: 4, kind: 'taken', at: instant('2026-11-30T09:00:03Z') },
  ],
}
const DETAIL = {
  schedule: 'sch_monthly',
  label: '月报提醒',
  control: 'active',
  standing: 'ready',
  author: { kind: 'human' },
  next: null,
  revision: 2,
  createdAt: instant('2026-11-17T03:00:00Z'),
  definition: {},
}

beforeAll(stubAnimation)
beforeEach(() => void stubInView())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function answer(call: Call, value: unknown): Promise<void> {
  await act(async () => {
    call.answer(value)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** The module on a shell, with the two things the assembly hands in; what it put on the status line is kept. */
async function assembled(handed: 'both' | 'neither' = 'both') {
  const { root, shell } = await startShell()
  const fake = createFakeClient<Client>(OPERATIONS)
  await serveProtocol(root, scheduleProtocol, fake.client)
  const status: Status[] = []
  const options = {
    conversation: (session: string, run?: string) => ({
      page: 'talk',
      subject: JSON.stringify(run === undefined ? { session } : { session, run }),
    }),
    sessionStatus: {
      name: 'session.status',
      contribute: (_shell: unknown, item: Status) => void status.push(item),
    },
  }
  await root.plugin(createScheduleUiModule(handed === 'both' ? options : {}))
  const navigate = vi.spyOn(shell, 'navigate')
  const page = (subject?: string) =>
    render(
      <>
        {shell
          .items('pages')[0]!
          .render(subject === undefined ? { scope: TENANT } : { scope: TENANT, subject })}
      </>,
    )
  return { fake, status, navigate, page }
}

async function jumped(job: object, handed: 'both' | 'neither' = 'both') {
  const world = await assembled(handed)
  world.page('job_1')
  const read = await world.fake.next('read-job')
  expect(read.body).toEqual({ tenant: readTenantText(TENANT), job: 'job_1' })
  await answer(read, { outcome: 'succeeded', body: job })
  return world
}

it('S1 a jump that names a Job opens the page on that Job, and 回到日程 goes back to the list', async () => {
  const { fake } = await jumped(JOB)
  expect(screen.getByLabelText('作业详情').textContent).toContain('承接会话 s-9')
  expect(scheduleJobTarget('job_1')).toEqual({ page: 'schedules', subject: 'job_1' })
  fireEvent.click(screen.getByRole('button', { name: '回到日程' }))
  expect(screen.queryByLabelText('作业详情')).toBeNull()
  expect(fake.calls.map(call => call.operation)).toContain('list-schedules')
})

it('S2 打开会话 jumps to the session, at the run the work began in', async () => {
  const { navigate } = await jumped(JOB)
  const offered = screen.getAllByRole('button', { name: '打开会话' })
  expect(offered.map(button => button.closest('li')?.textContent ?? 'fact')).toEqual([
    'fact',
    expect.stringContaining('执行方接下了'),
  ])
  for (const button of offered) fireEvent.click(button)
  const there = ['talk', '{"session":"s-9","run":"run-2"}']
  expect(navigate.mock.calls).toEqual([there, there])
  const steps = [...screen.getByLabelText('经过的每一步').children]
  expect(steps.map(step => step.querySelectorAll('button').length)).toEqual([0, 0, 1, 0])
})

it('S3 no run began yet: 打开会话 jumps to the session alone', async () => {
  const where = { ...JOB.where, account: { ...ACCOUNT, since: null, run: null } }
  const { navigate } = await jumped({ ...JOB, where })
  fireEvent.click(screen.getAllByRole('button', { name: '打开会话' })[0]!)
  expect(navigate.mock.calls).toEqual([['talk', '{"session":"s-9"}']])
})

it.each([
  ['what the session left cannot be read', { ...JOB, where: { ...JOB.where, account: null } }],
  [
    'a program carries it out',
    { ...JOB, where: { kind: 'program', program: 'p', execution: 'x' } },
  ],
  ['nothing carries it out yet', { ...JOB, where: null }],
])('S4 %s: there is no 打开会话', async (_name, job) => {
  await jumped(job)
  expect(screen.getByLabelText('作业详情')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '打开会话' })).toBeNull()
})

it('S5 an assembly that hands in no way to a session: no 打开会话, and nothing on a status line', async () => {
  const { status } = await jumped(JOB, 'neither')
  expect(screen.queryByRole('button', { name: '打开会话' })).toBeNull()
  expect(status).toEqual([])
})

async function provenance(items: unknown, outcome = 'succeeded') {
  const world = await assembled()
  expect(world.status.map(item => item.id)).toEqual(['schedule.job-provenance'])
  const view = render(
    <>{world.status[0]!.render({ scope: TENANT, subject: { session: 's-9' } })}</>,
  )
  const read = await world.fake.next('read-session-jobs')
  expect(read.body).toEqual({ tenant: readTenantText(TENANT), session: 's-9' })
  expect(view.container.textContent).toBe('')
  await answer(read, outcome === 'succeeded' ? { outcome, body: { items } } : { outcome })
  return { ...world, view }
}

it('P1 a session a Job of a schedule opened says so with the name of the schedule, and the line goes back to that Job', async () => {
  const later = { ...JOB, job: 'job_2', work: agentWork({ mode: 'existing', sessionRef: 's-9' }) }
  const { fake, navigate, view } = await provenance([later, JOB])
  expect(view.container.textContent).toBe('')
  const shown = await fake.next('read-schedule')
  expect(shown.body).toEqual({ tenant: readTenantText(TENANT), schedule: 'sch_monthly' })
  await answer(shown, { outcome: 'succeeded', body: DETAIL })
  expect(view.container.textContent).toBe('由日程「月报提醒」的作业开启')
  fireEvent.click(screen.getByRole('button', { name: '由日程「月报提醒」的作业开启' }))
  expect(navigate.mock.calls).toEqual([['schedules', 'job_1']])
})

it.each([['not-visible'], ['basis-unavailable']])(
  'P2 the schedule answers %s: no line is drawn',
  async outcome => {
    const { fake, view } = await provenance([JOB])
    await answer(await fake.next('read-schedule'), { outcome })
    expect(view.container.textContent).toBe('')
  },
)

it('P2b a schedule without a name is named as the page names it', async () => {
  const { fake, view } = await provenance([JOB])
  await answer(await fake.next('read-schedule'), {
    outcome: 'succeeded',
    body: { ...DETAIL, label: null },
  })
  expect(view.container.textContent).toBe('由日程「未命名」的作业开启')
})

it('P3 a Job started directly opened it: the line says so and no schedule is read', async () => {
  const { fake, view } = await provenance([{ ...JOB, schedule: null }])
  expect(view.container.textContent).toBe('由一份直接发起的作业开启')
  expect(fake.calls.map(call => call.operation)).toEqual(['read-session-jobs'])
})

it.each([
  ['no Job', [], 'succeeded'],
  [
    'only Jobs sent to a session that was there',
    [{ ...JOB, work: agentWork({ mode: 'existing', sessionRef: 's-9' }) }],
    'succeeded',
  ],
  ['an answer that cannot be read', [], 'basis-unavailable'],
  ['a refusal', [], 'denied'],
])('P4 %s: nothing is drawn', async (_name, items, outcome) => {
  const { view, fake } = await provenance(items, outcome)
  expect(view.container.textContent).toBe('')
  expect(fake.calls.map(call => call.operation)).toEqual(['read-session-jobs'])
})

it.each([
  ['no tenant', undefined],
  ['a text that names no tenant', 'not-a-tenant'],
])('P5 %s: nothing is drawn and nothing is read', async (_name, scope) => {
  const { status, fake } = await assembled()
  const view = render(<>{status[0]!.render({ scope, subject: { session: 's-9' } })}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})

it('the model: the session of a Job, the Job that opened a session, the words of the line', () => {
  const detail = JOB as unknown as JobDetail
  expect(sessionOf(detail.where)).toEqual({ session: 's-9', run: 'run-2' })
  expect(sessionOf(null)).toBeNull()
  expect(openerOf([detail])).toBe(detail)
  expect(
    openerOf([{ ...detail, work: tree({ kind: 'program', programRef: 'p' }) } as JobDetail]),
  ).toBe(undefined)
  expect(provenanceText('月报')).toBe('由日程「月报」的作业开启')
  expect(beganAt(detail.events)).toBe(3)
  expect(beganAt(detail.events.slice(0, 2))).toBeUndefined()
})
