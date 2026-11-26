// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { identitiesOf } from '@omne-harness/schedule-session'
import {
  scheduleCarriersKey,
  type ScheduleCarriersService,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { describe, expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { bodyOf, type CliRun } from '../../r9/support.ts'
import { answeringDecisions, type AskedDecision } from '../../support/decisions-script.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import {
  historyOf,
  onReleaseTreeRuns,
  pollUntil,
  sse,
  toolCallsByRequest,
  type AddedRow,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { count, DRAFT, goalsOf, WRITE } from '../goal/journey.ts'

/** A carrier of deliverables, so that agent work with a result policy is not blocked for lack of one. */
const PUBLICATION: AddedRow = {
  id: 'probe-publication',
  plugin: 'probePublication',
  config: {},
  definition: defineRow({
    row: 'probe-publication',
    implementation: 'contract-double',
    manifest: { provides: [], injects: [scheduleCarriersKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      inject: [scheduleCarriersKey],
      apply(ctx: Context) {
        const carriers = ctx.get(scheduleCarriersKey) as ScheduleCarriersService
        ctx.effect(() => carriers.register({ kind: 'publication', ref: 'probe' }))
      },
    },
  }),
}

const IN_ITS_OWN = {
  mode: 'new',
  agentDefinitionRef: 'coding',
  modes: {
    permission: 'bypass-permissions',
    environmentAdoptionRef: 'release',
    collaboration: 'auto-drive',
  },
  workspace: null,
}
const workOf = (instruction: unknown = DRAFT, session: unknown = IN_ITS_OWN) => ({
  kind: 'agent',
  instruction,
  session,
  materials: [],
  returnTo: null,
  resultPolicy: {
    audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
    publication: { kind: 'provider', providerRef: 'probe' },
    resultSeriesId: null,
    attention: 'silent',
    archive: { kind: 'none' },
  },
})

const TRACK = {
  id: 'call-track-1',
  tool: 'Goal',
  arguments: JSON.stringify({ command: 'track', params: { deliverables: ['CHANGELOG.md'] } }),
}
/** A goal the agent gets one round for: when the judge does not find it met, the budget exit ends it as a failure. */
const ONE_ROUND = {
  ...DRAFT,
  exits: [
    {
      statement: '一轮没做完',
      kind: 'budget',
      limits: [{ amount: 1, unit: 'rounds' }],
      deliver: '写到哪算哪',
      counts: 'failure',
    },
  ],
}
const NOT_FOR_NOBODY = {
  ...DRAFT,
  criteria: [{ statement: '人看过了', evidence: { kind: 'person' } }],
}

const everyMinute = (instruction: unknown = DRAFT) => ({
  label: '每分钟写一条改动说明',
  recurrence: { kind: 'cron', expression: '* * * * *', begin: '2027-01-01T00:00:00', until: null },
  limits: { eligibleLimit: null, jobLimit: 1, excludeDates: [] },
  binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
  calendarOverlay: null,
  purpose: {
    kind: 'execution',
    work: workOf(instruction),
    scope: { kind: 'fleet' },
    catchUp: { kind: 'none' },
    overlap: 'skip',
    misfire: null,
    notifications: [],
  },
})

const TREE = {
  permission: 'bypass-permissions',
  collaboration: 'auto-drive',
  addedRows: [PUBLICATION],
  rowConfig: { schedule: { dispatch: { intervalMs: 5_000, gapMs: 600_000 } } },
} as const

/** The time of a run: fast enough that the first due minute comes within seconds. */
function fastTime() {
  const time = simulatedTime({ wall: Date.parse('2027-03-01T00:00:10.000Z') })
  time.run({ speed: 30 })
  return { source: time.source, protocol: 'simulated-clock' } as const
}

async function concluded(tree: ReleaseTree, schedule: string) {
  const done = await pollUntil(
    'the Job of the first due minute to conclude',
    () => jobsOf(tree, schedule),
    rows => rows.some(row => row.job?.['state'] === 'concluded'),
  )
  return done.map(row => row.job ?? {})
}

function sessionOf(tree: ReleaseTree, jobId: string) {
  const text = tenantCodec.encode(tree.registrar().tenant)
  const owner = { kind: 'tenant', tenantId: text.ok ? text.value : '', ownerId: '' }
  return identitiesOf({ owner: owner as never, jobId: jobId as never })
}

function succeeded(run: CliRun): Record<string, unknown> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, unknown>
}

type Row = Readonly<{ kind: string; job: Record<string, unknown> | null }>
/** The Jobs of a schedule as its history reads now; a read that has no basis this moment reads as none yet, and is asked again. */
async function jobsOf(tree: ReleaseTree, schedule: string): Promise<readonly Row[]> {
  const read = await tree.cli(['schedule', 'jobs', '--schedule', schedule])
  if (read.result?.['outcome'] === 'basis-unavailable') return []
  const history = succeeded(read)
  return (history['items'] as Row[]).filter(row => row.kind === 'slot' && row.job !== null)
}

function fileOf(tree: ReleaseTree, name: string, content: unknown): string {
  const file = join(dirname(tree.home), name)
  writeFileSync(file, JSON.stringify(content))
  return file
}

describe('agent work in a new session on the release tree', () => {
  it(
    'at the due minute a session nobody attends is created for the Job, the goal the Job carries is set in it, the agent works by it, and the Job succeeds when the goal is achieved',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const judged: AskedDecision[] = []
      const chat = toolCallsByRequest(body =>
        body.includes(TRACK.id) ? [] : body.includes(WRITE.id) ? [TRACK] : [WRITE],
      )
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(chat, () => ({ criterion: 'holds' }), judged),
          time: fastTime(),
          extraHistoryKinds: ['message.system_reminder'],
        },
        [
          async tree => {
            const refused = await tree.cli([
              'schedule',
              'create',
              '--definition-file',
              fileOf(tree, 'not-for-nobody.json', everyMinute(NOT_FOR_NOBODY)),
              '--create-id',
              'a-0',
            ])
            expect(refused.result).toMatchObject({
              outcome: 'invalid',
              body: {
                code: 'invalid_input',
                reason: expect.stringMatching(/^instruction: A1\.evidence: /u),
              },
            })
            const file = fileOf(tree, 'every-minute.json', everyMinute())
            const created = succeeded(
              await tree.cli([
                'schedule',
                'create',
                '--definition-file',
                file,
                '--create-id',
                'a-1',
              ]),
            )
            const schedule = String(created['schedule'])
            const done = await concluded(tree, schedule)
            expect(done.map(job => [job['state'], job['outcome'], job['reason']])).toEqual([
              ['concluded', 'succeeded', null],
            ])
            const jobId = String(done[0]?.['job'])
            const ids = sessionOf(tree, jobId)
            const session = ids?.session ?? ''
            const { goals, agent } = await goalsOf(tree, session)
            const entries = await historyOf(tree, session)
            expect(count(entries, 'run.started')).toBe(1)
            expect(count(entries, 'run.terminal')).toBe(1)
            const started = entries.find(entry => entry.kind === 'run.started')
            const read = await goals.read(agent, session)
            expect(read).toMatchObject({
              kind: 'done',
              value: {
                state: {
                  status: 'settled',
                  attendance: 'unattended',
                  outcome: { kind: 'achieved' },
                },
                body: { purpose: DRAFT.purpose },
                history: [{ via: 'direct', draftedBy: 'creator', confirmedBy: ids?.by }],
              },
            })
            expect(judged.length).toBeGreaterThan(0)
            expect(JSON.stringify(entries)).toContain(WRITE.id)
            const shown = succeeded(await tree.cli(['schedule', 'job', '--job', jobId]))
            expect(shown['where']).toEqual({
              kind: 'session',
              session,
              account: {
                definition: { name: 'coding', version: expect.stringMatching(/.+/u) },
                outcome: 'achieved',
                deliverables: ['CHANGELOG.md'],
                since: null,
                run: started?.payload['run'],
              },
            })
          },
        ],
      )
    },
  )

  it(
    'a Job whose goal ends by an exit written as failure is failed, and says which exit: the agent ending its round is not success',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const chat = toolCallsByRequest(() => [])
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(chat, () => ({ criterion: 'no-evidence' })),
          time: fastTime(),
        },
        [
          async tree => {
            const file = fileOf(tree, 'one-round.json', everyMinute(ONE_ROUND))
            const created = succeeded(
              await tree.cli([
                'schedule',
                'create',
                '--definition-file',
                file,
                '--create-id',
                'b-1',
              ]),
            )
            const done = await concluded(tree, String(created['schedule']))
            expect(done.map(job => [job['state'], job['outcome'], job['reason']])).toEqual([
              ['concluded', 'failed', 'exit:X1'],
            ])
            const jobId = String(done[0]?.['job'])
            const shown = succeeded(await tree.cli(['schedule', 'job', '--job', jobId]))
            expect(shown['where']).toMatchObject({
              kind: 'session',
              session: sessionOf(tree, jobId)?.session,
              account: { outcome: 'exit:X1', deliverables: [] },
            })
          },
        ],
      )
    },
  )
})

const SAID_IN_THE_ROUND = {
  purpose: '把 todo.md 里还没打勾的事项列给我',
  criteria: [
    {
      statement: '答复里列出了还没打勾的事项',
      evidence: { kind: 'activity' },
      pass: { kind: 'shows', text: '没打勾的两项都在，已打勾的不在' },
    },
  ],
  exits: ONE_ROUND.exits,
}

function saying(text: string): GatewayScript {
  return ({ body }) => ({
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      {
        model: (JSON.parse(body) as { model?: string }).model ?? 'm',
        provider: 'OpenAI',
        choices: [{ delta: { content: text } }],
      },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]),
  })
}

describe('agent work whose goal stands on what is said in the round, on the release tree', () => {
  it.each([
    ['the right answer', '还没打勾的有两项：买牛奶、交水电费。', ['concluded', 'succeeded', null]],
    ['a wrong answer', '还没打勾的只有一项：取快递。', ['concluded', 'failed', 'exit:X1']],
  ])(
    'the judge is shown the last reply of the round, and the Job ends by it: %s',
    { tags: ['slow'], timeout: 300_000 },
    async (_name, reply, ending) => {
      const judged: AskedDecision[] = []
      const right = (ask: AskedDecision) =>
        ['买牛奶', '交水电费'].every(item => JSON.stringify(ask.state).includes(item))
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(
            saying(reply),
            ask => ({ criterion: right(ask) ? 'holds' : 'no-evidence' }),
            judged,
          ),
          time: fastTime(),
        },
        [
          async tree => {
            const file = fileOf(tree, 'said.json', everyMinute(SAID_IN_THE_ROUND))
            const created = succeeded(
              await tree.cli([
                'schedule',
                'create',
                '--definition-file',
                file,
                '--create-id',
                's-1',
              ]),
            )
            const done = await concluded(tree, String(created['schedule']))
            expect(done.map(job => [job['state'], job['outcome'], job['reason']])).toEqual([ending])
            expect(JSON.stringify(judged.map(ask => ask.state))).toContain(reply)
          },
        ],
      )
    },
  )
})

/** A model that takes a request and does not answer until released: the round it serves stays open. */
function holding() {
  let seen = () => {}
  let free = () => {}
  const asked = new Promise<void>(resolve => (seen = resolve))
  const freed = new Promise<void>(resolve => (free = resolve))
  const script: GatewayScript = async () => {
    seen()
    await freed
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { choices: [{ delta: { content: 'late' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    }
  }
  return { script, asked, release: () => free() }
}

/** The sessions a list names, whatever else each row says. */
const sessionsIn = (list: Record<string, unknown>) =>
  (list['sessions'] as { session: string }[]).map(row => row.session).sort()

/** A Job started now, outside any schedule, for a session that exists. */
async function startIn(tree: ReleaseTree, sessionRef: string, startId: string) {
  const work = fileOf(tree, `${startId}.json`, workOf(DRAFT, { mode: 'existing', sessionRef }))
  const started = succeeded(
    await tree.cli(['schedule', 'start-job', '--work-file', work, '--start-id', startId]),
  )
  return String(started['job'])
}

async function jobOf(
  tree: ReleaseTree,
  jobId: string,
  until: (job: Record<string, unknown>) => boolean,
) {
  return pollUntil(
    `the Job ${jobId} to get there`,
    async () => {
      const read = await tree.cli(['schedule', 'job', '--job', jobId])
      return read.result?.['outcome'] === 'succeeded'
        ? (bodyOf(read) as Record<string, unknown>)
        : {}
    },
    until,
  )
}

describe('agent work in a session that exists, on the release tree', () => {
  it(
    'in a quiet session of a person the Job opens a round of its own by setting its goal, which stands for the Job; it succeeds when the goal is achieved, and no session is created for it',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const chat = toolCallsByRequest(body => (body.includes(WRITE.id) ? [] : [WRITE]))
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(chat, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const made = await tree.cli(['create-session', '--definition', 'coding'])
            const session = String((bodyOf(made) as { session: string }).session)
            const before = succeeded(await tree.cli(['list-sessions']))
            const jobId = await startIn(tree, session, 'e-1')
            const done = await jobOf(tree, jobId, job => job['state'] === 'concluded')
            expect([done['outcome'], done['reason']]).toEqual(['succeeded', null])
            expect(done['where']).toMatchObject({
              kind: 'session',
              session,
              account: { outcome: 'achieved' },
            })
            const { goals, agent } = await goalsOf(tree, session)
            expect(await goals.read(agent, session)).toMatchObject({
              kind: 'done',
              value: {
                state: {
                  status: 'settled',
                  attendance: 'unattended',
                  outcome: { kind: 'achieved' },
                },
                history: [
                  { via: 'direct', draftedBy: 'creator', confirmedBy: `schedule-job:${jobId}` },
                ],
              },
            })
            const entries = await historyOf(tree, session)
            expect(count(entries, 'run.started')).toBe(1)
            const after = succeeded(await tree.cli(['list-sessions']))
            expect(sessionsIn(after)).toEqual(sessionsIn(before))
          },
        ],
      )
    },
  )

  it(
    'a session that does not exist, or that is archived, fails the Job with the reason, and no session is created in its place',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const chat = toolCallsByRequest(() => [])
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(chat, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const made = await tree.cli(['create-session', '--definition', 'coding'])
            const archived = String((bodyOf(made) as { session: string }).session)
            await tree.archive(archived)
            const before = succeeded(await tree.cli(['list-sessions']))
            const gone = await jobOf(
              tree,
              await startIn(tree, 'no-such-session', 'e-2'),
              job => job['state'] === 'concluded',
            )
            expect([gone['outcome'], gone['reason']]).toEqual([
              'failed',
              'the session does not exist',
            ])
            const closed = await jobOf(
              tree,
              await startIn(tree, archived, 'e-3'),
              job => job['state'] === 'concluded',
            )
            expect([closed['outcome'], closed['reason']]).toEqual([
              'failed',
              'the session takes no work any more',
            ])
            const after = succeeded(await tree.cli(['list-sessions']))
            expect(sessionsIn(after)).toEqual(sessionsIn(before))
          },
        ],
      )
    },
  )

  it(
    'cancelling a Job that is running cancels its goal and its round, and nothing else: the Job ends cancelled with the stop confirmed',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const held = holding()
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(held.script, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const made = await tree.cli(['create-session', '--definition', 'coding'])
            const session = String((bodyOf(made) as { session: string }).session)
            const jobId = await startIn(tree, session, 'c-1')
            await jobOf(tree, jobId, job => job['state'] === 'running')
            await held.asked
            succeeded(
              await tree.cli(['schedule', 'cancel-job', '--job', jobId, '--action-id', 'x-1']),
            )
            const done = await jobOf(tree, jobId, job => job['state'] === 'concluded')
            expect([done['outcome'], done['stop']]).toEqual(['cancelled', 'confirmed'])
            const { goals, agent } = await goalsOf(tree, session)
            expect(await goals.read(agent, session)).toMatchObject({
              value: { state: { status: 'settled', outcome: { kind: 'cancelled' } } },
            })
            const entries = await historyOf(tree, session)
            expect(count(entries, 'run.started')).toBe(1)
            expect(JSON.stringify(entries.find(entry => entry.kind === 'run.terminal'))).toContain(
              'cancelled',
            )
            held.release()
          },
        ],
      )
    },
  )

  it(
    'when the person stops the round of the Job in their session, the goal of the Job ends aborted and the Job fails, saying so',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const held = holding()
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(held.script, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const made = await tree.cli(['create-session', '--definition', 'coding'])
            const session = String((bodyOf(made) as { session: string }).session)
            const jobId = await startIn(tree, session, 'a-1')
            await jobOf(tree, jobId, job => job['state'] === 'running')
            await held.asked
            const started = (await historyOf(tree, session)).find(
              entry => entry.kind === 'run.started',
            )
            const run = String(started?.payload['run'])
            const stopped = await tree.cli(['cancel-run', '--session', session, '--run', run])
            expect(stopped.status, stopped.stderr).toBe(0)
            const done = await jobOf(tree, jobId, job => job['state'] === 'concluded')
            expect([done['outcome'], done['reason']]).toEqual(['failed', 'aborted'])
            expect(done['where']).toMatchObject({ account: { outcome: 'aborted' } })
            held.release()
          },
        ],
      )
    },
  )

  it(
    'a session that already has a goal in progress blocks the Job with that reason; once that goal ended the Job starts there',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const chat = toolCallsByRequest(body => (body.includes(WRITE.id) ? [] : [WRITE]))
      const held = holding()
      let first = true
      const script: typeof chat = request => {
        const mine = first
        first = false
        return mine ? held.script(request) : chat(request)
      }
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(script, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const made = await tree.cli(['create-session', '--definition', 'coding'])
            const session = String((bodyOf(made) as { session: string }).session)
            const earlier = await startIn(tree, session, 'g-1')
            await jobOf(tree, earlier, job => job['state'] === 'running')
            await held.asked
            const later = await startIn(tree, session, 'g-2')
            const blocked = await jobOf(tree, later, job => job['state'] === 'blocked')
            expect(blocked['reason']).toBe('the session already has a goal in progress')
            succeeded(
              await tree.cli(['schedule', 'cancel-job', '--job', earlier, '--action-id', 'x-2']),
            )
            await jobOf(tree, earlier, job => job['state'] === 'concluded')
            held.release()
            const done = await jobOf(tree, later, job => job['state'] === 'concluded')
            expect([done['outcome'], done['reason']]).toEqual(['succeeded', null])
            const { goals, agent } = await goalsOf(tree, session)
            expect(await goals.read(agent, session)).toMatchObject({
              value: {
                state: { generation: 2, outcome: { kind: 'achieved' } },
                history: [{ confirmedBy: `schedule-job:${later}` }],
              },
            })
          },
        ],
      )
    },
  )

  it(
    'a session with a round of its own going blocks the Job as busy, and nothing of the Job enters that round; once the session is quiet the Job runs in a round of its own',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const chat = toolCallsByRequest(body => (body.includes(WRITE.id) ? [] : [WRITE]))
      const held = holding()
      let first = true
      const script: typeof chat = request => {
        const mine = first
        first = false
        return mine ? held.script(request) : chat(request)
      }
      await onReleaseTreeRuns(
        {
          ...TREE,
          script: answeringDecisions(script, () => ({ criterion: 'holds' })),
          time: fastTime(),
        },
        [
          async tree => {
            const session = await tree.startSession('先做这件事')
            await held.asked
            const jobId = await startIn(tree, session, 'b-1')
            const blocked = await jobOf(tree, jobId, job => job['state'] === 'blocked')
            expect(blocked['reason']).toBe('the session is busy')
            const { goals, agent } = await goalsOf(tree, session)
            expect(await goals.read(agent, session)).toMatchObject({ kind: 'done', value: null })
            held.release()
            const done = await jobOf(tree, jobId, job => job['state'] === 'concluded')
            expect([done['outcome'], done['reason']]).toEqual(['succeeded', null])
            const entries = await historyOf(tree, session)
            expect(count(entries, 'run.started')).toBe(2)
            expect(await goals.read(agent, session)).toMatchObject({
              value: { state: { generation: 1, outcome: { kind: 'achieved' } } },
            })
          },
        ],
      )
    },
  )
})
