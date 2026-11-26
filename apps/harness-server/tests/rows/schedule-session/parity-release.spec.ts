// @module-tag slow
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_AGENT_RESULT_POLICY } from '@omne-harness/schedule-contract'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { describe, expect, it } from 'vitest'
import { bodyOf, type CliRun } from '../../r9/support.ts'
import { answeringDecisions } from '../../support/decisions-script.ts'
import {
  historyOf,
  onReleaseTreeRuns,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
  type ScriptedToolCall,
} from '../../support/release-tree.ts'
import { DRAFT, WRITE } from '../goal/journey.ts'

const TREE = {
  permission: 'bypass-permissions',
  collaboration: 'auto-drive',
  rowConfig: { schedule: { dispatch: { intervalMs: 5_000, gapMs: 600_000 } } },
} as const
function fastTime() {
  const time = simulatedTime({ wall: Date.parse('2027-03-01T00:00:10.000Z') })
  time.run({ speed: 30 })
  return { source: time.source, protocol: 'simulated-clock' } as const
}

const ONCE = { kind: 'once', localAt: '2099-01-01T09:00:00' }
const LIMITS = { eligibleLimit: null, jobLimit: null, excludeDates: [] }
const execution = (work: unknown) => ({
  kind: 'execution',
  work,
  scope: { kind: 'fleet' },
  catchUp: { kind: 'none' },
  overlap: 'skip',
  misfire: { kind: 'lapse' },
  notifications: [],
})
const agent = (session: unknown) => ({ kind: 'agent', instruction: DRAFT, session })
/** A definition as the agent writes it through the tool, and the same as a person writes it for the protocol. */
const byTool = (label: string, session: unknown) => ({
  label,
  recurrence: ONCE,
  limits: LIMITS,
  purpose: execution(agent(session)),
})
const byPerson = (label: string, session: unknown) => ({
  ...byTool(label, session),
  binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
  calendarOverlay: null,
})
const NOWHERE = { kind: 'program', programRef: 'nowhere', input: {} }

/** A call of a tool the coding Agent keeps resident, or of one it reaches through Tools: Jobs is of the second kind. */
const call = (id: string, tool: string, command: string, params: unknown): ScriptedToolCall =>
  tool === 'Jobs'
    ? {
        id,
        tool: 'Tools',
        arguments: JSON.stringify({
          command: 'execute',
          intent: `Jobs ${command}`,
          params: { name: 'Jobs', command, arguments: params },
        }),
      }
    : { id, tool, arguments: JSON.stringify({ command, params }) }
const SHOW_MINE = call('call-show-mine', 'Jobs', 'show', {})

type Message = Readonly<{ role?: string; tool_call_id?: string; content?: unknown }>
const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => String((part as { text?: unknown }).text ?? '')).join('')
      : ''
/** What the tool answered a call, as the request shows it to the model; undefined while it has not answered. */
function answerTo(body: string, id: string): string | undefined {
  const { messages = [] } = JSON.parse(body) as { messages?: readonly Message[] }
  const found = messages.find(message => message.role === 'tool' && message.tool_call_id === id)
  return found === undefined ? undefined : textOf(found.content)
}
type Pending = Readonly<{ state?: string; next?: { command: string; params: unknown } }>
const pendingOf = (answer: string): Pending | null => {
  try {
    const read = JSON.parse(answer) as Pending
    return read.state === 'pending' && read.next !== undefined ? read : null
  } catch {
    return null
  }
}
const READS = 40

/** The next call of a chain: the call itself, then the reads Tools asks for while it answers pending, then nothing. */
function following(body: string, made: ScriptedToolCall): readonly ScriptedToolCall[] {
  let id = made.id
  for (let read = 0; read <= READS; read += 1) {
    const answer = answerTo(body, id)
    if (answer === undefined) return read === 0 ? [made] : []
    const pending = pendingOf(answer)
    if (pending?.next === undefined) return []
    id = `${made.id}-read-${String(read)}`
    if (answerTo(body, id) === undefined)
      return [{ id, tool: 'Tools', arguments: JSON.stringify(pending.next) }]
  }
  return []
}

/** What a chain ended with: the answer that is not pending; undefined while it is still going. */
function endOf(body: string, made: ScriptedToolCall): string | undefined {
  let id = made.id
  for (let read = 0; read <= READS; read += 1) {
    const answer = answerTo(body, id)
    if (answer === undefined || pendingOf(answer) === null) return answer
    id = `${made.id}-read-${String(read)}`
  }
  return undefined
}

type Shown = Readonly<{ where?: { sessionRef?: string; account?: { since?: string | null } } }>
/** Reading the round of a Job as an agent does: show the Job, then read its session after the position it names. */
function roundOf(body: string, job: string | undefined): readonly ScriptedToolCall[] {
  const show = call('call-show-round', 'Jobs', 'show', { job })
  const done = DONE.exec(endOf(body, show) ?? '')
  const { where } = done === null ? {} : (JSON.parse(done[2] ?? '{}') as Shown)
  if (where?.sessionRef === undefined) return [show]
  const after = where.account?.since ?? null
  const from = after === null ? {} : { after }
  return [show, call('call-read-round', 'Sessions', 'read', { session: where.sessionRef, ...from })]
}

/** What the person's session asks its agent to do, by the words of the person; a session of a Job works by its goal. */
function calls(body: string): readonly ScriptedToolCall[] {
  const asked = /parity: ([a-z]+)(?: ([0-9a-f-]{36}))?/u.exec(body)
  const chain = (made: readonly ScriptedToolCall[]) => {
    for (const one of made) {
      const next = following(body, one)
      if (next.length > 0) return next
    }
    return []
  }
  if (asked === null) return chain([SHOW_MINE, WRITE])
  const [, what, job] = asked
  if (what === 'schedules')
    return chain([
      call('call-here', 'Schedules', 'create', {
        definition: byTool('tool-here', { mode: 'existing', sessionRef: 'current' }),
      }),
      call('call-new', 'Schedules', 'create', { definition: byTool('tool-new', { mode: 'new' }) }),
    ])
  if (what === 'start')
    return chain([call('call-start', 'Jobs', 'start', { work: agent({ mode: 'new' }) })])
  if (what === 'blocked') return chain([call('call-blocked', 'Jobs', 'start', { work: NOWHERE })])
  if (what === 'cancel') return chain([call('call-cancel', 'Jobs', 'cancel', { job })])
  if (what === 'round') return chain(roundOf(body, job))
  if (what === 'here') {
    const session = { mode: 'existing', sessionRef: 'current' }
    return chain([call('call-here-job', 'Jobs', 'start', { work: agent(session) })])
  }
  return what === 'show' ? chain([call('call-show', 'Jobs', 'show', { job })]) : []
}

function succeeded(run: CliRun): Record<string, unknown> {
  expect(run.result?.['outcome'], run.stdout + run.stderr).toBe('succeeded')
  return bodyOf(run) as Record<string, unknown>
}
function fileOf(tree: ReleaseTree, name: string, content: unknown): string {
  const file = join(dirname(tree.home), name)
  writeFileSync(file, JSON.stringify(content))
  return file
}

/** What a tool said when it did its work: resident, as its whole answer; through Tools, after the status of the read. */
const DONE = /(done [A-Za-z]+ [a-z]+)\n(.+)$/su

/** The person says one thing in a session of their own; the answer is what the tool said to the agent. */
async function said(tree: ReleaseTree, words: string) {
  const session = await tree.startSession(words)
  const entries = await pollUntil(
    `the round of "${words}" to end`,
    () => historyOf(tree, session),
    found => found.some(entry => entry.kind === 'run.terminal'),
  )
  const results = toolResults(entries).flatMap(text => {
    const done = DONE.exec(text)
    if (done === null) return []
    return [{ head: done[1] ?? '', body: JSON.parse(done[2] ?? 'null') as unknown }]
  })
  return { session, results }
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

async function workOfSchedule(tree: ReleaseTree, label: string) {
  const listed = succeeded(await tree.cli(['schedule', 'list']))
  const found = (listed['items'] as { schedule: string; label: string }[]).find(
    item => item.label === label,
  )
  const shown = succeeded(await tree.cli(['schedule', 'show', '--schedule', found?.schedule ?? '']))
  return (shown['definition'] as { purpose: { work: Record<string, unknown> } }).purpose.work
}

const READ = /^done Sessions read session=(\S+) entries=\d+ exhausted=(\S+) [^\n]*\n(.+)$/su
type ReadItem = Readonly<{ session: string; position: string; kind: string; material: unknown }>
type Carried = Readonly<{ session: string; account: { since: string | null; run: string | null } }>

/** The Job the first answer of a tool names. */
const jobIn = (results: readonly { body: unknown }[]) =>
  String((results[0]?.body as { job?: string } | undefined)?.job)

/** What is the same whoever started a Job: everything but who it is, when, and the session it got. */
const sameOf = (job: Record<string, unknown>) => ({
  state: job['state'],
  outcome: job['outcome'],
  reason: job['reason'],
  stop: job['stop'],
  work: job['work'],
  where: (job['where'] as { kind?: string; account?: unknown } | null)?.kind ?? null,
  account: leftOf((job['where'] as { account?: Record<string, unknown> | null } | null)?.account),
})
/** What an execution left, without where its own session stood: the position and the run are of that session. */
function leftOf(account: Record<string, unknown> | null | undefined) {
  if (account === null || account === undefined) return null
  const { since: _since, run: _run, ...left } = account
  return left
}

describe('a person and an agent do the same things with schedules and Jobs', () => {
  it(
    'building a schedule: `current` is saved as the session of the call, a new session takes what it leaves out, and a person who leaves the same out saves the same work',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = answeringDecisions(toolCallsByRequest(calls), () => ({ criterion: 'holds' }))
      await onReleaseTreeRuns({ ...TREE, script }, [
        async tree => {
          const { session, results } = await said(tree, 'parity: schedules')
          expect(results.map(result => result.head)).toEqual([
            'done Schedules create',
            'done Schedules create',
          ])
          const rest = { materials: [], returnTo: null, resultPolicy: DEFAULT_AGENT_RESULT_POLICY }
          expect(await workOfSchedule(tree, 'tool-here')).toEqual({
            ...agent({ mode: 'existing', sessionRef: session }),
            ...rest,
          })
          const fresh = await workOfSchedule(tree, 'tool-new')
          expect(fresh).toMatchObject({
            session: {
              mode: 'new',
              agentDefinitionRef: 'coding',
              modes: { permission: 'bypass-permissions', collaboration: 'auto-drive' },
              workspace: null,
            },
            ...rest,
          })

          const file = fileOf(tree, 'person-new.json', byPerson('person-new', { mode: 'new' }))
          succeeded(
            await tree.cli(['schedule', 'create', '--definition-file', file, '--create-id', 'p-1']),
          )
          expect(await workOfSchedule(tree, 'person-new')).toEqual(fresh)

          const here = { mode: 'existing', sessionRef: 'current' }
          const refused = await tree.cli([
            'schedule',
            'create',
            '--definition-file',
            fileOf(tree, 'person-here.json', byPerson('person-here', here)),
            '--create-id',
            'p-2',
          ])
          expect(refused.result).toMatchObject({
            outcome: 'invalid',
            body: { reason: expect.stringContaining('current names the session of the caller') },
          })
        },
      ])
    },
  )

  it(
    'starting, reading and cancelling a Job: started by the person or by the agent with the same work, the two Jobs read the same; a session reads the Job it carries out',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = answeringDecisions(toolCallsByRequest(calls), () => ({ criterion: 'holds' }))
      await onReleaseTreeRuns({ ...TREE, script, time: fastTime() }, [
        async tree => {
          const work = fileOf(tree, 'work.json', agent({ mode: 'new' }))
          const mine = String(
            succeeded(
              await tree.cli(['schedule', 'start-job', '--work-file', work, '--start-id', 's-1']),
            )['job'],
          )
          const started = await said(tree, 'parity: start')
          expect(started.results.map(result => result.head)).toEqual(['done Jobs start'])
          const theirs = jobIn(started.results)

          const [byPersonJob, byAgentJob] = await Promise.all(
            [mine, theirs].map(job => jobOf(tree, job, found => found['state'] === 'concluded')),
          )
          expect(sameOf(byAgentJob ?? {})).toEqual(sameOf(byPersonJob ?? {}))
          expect(sameOf(byPersonJob ?? {})).toMatchObject({
            state: 'concluded',
            outcome: 'succeeded',
            where: 'session',
            account: { outcome: 'achieved', definition: { name: 'coding' } },
          })
          expect([byPersonJob?.['origin'], byAgentJob?.['origin']]).toEqual(['human', 'agent'])

          const shown = await said(tree, `parity: show ${mine}`)
          expect(shown.results[0]?.head).toBe('done Jobs show')
          expect(shown.results[0]?.body).toMatchObject({
            job: mine,
            state: 'concluded',
            outcome: 'succeeded',
            where: { kind: 'session', account: { outcome: 'achieved' } },
          })

          const inJob = String((byAgentJob?.['where'] as { session?: string } | undefined)?.session)
          const itsOwn = toolResults(await historyOf(tree, inJob)).flatMap(text => {
            const done = DONE.exec(text)
            if (done?.[1] !== 'done Jobs show') return []
            return [JSON.parse(done[2] ?? '{}') as { session: string; jobs: { job: string }[] }]
          })
          expect(itsOwn[0]?.session).toBe(inJob)
          expect(itsOwn[0]?.jobs.map(job => job.job)).toEqual([theirs])

          const nowhere = fileOf(tree, 'nowhere.json', NOWHERE)
          const stuck = String(
            succeeded(
              await tree.cli([
                'schedule',
                'start-job',
                '--work-file',
                nowhere,
                '--start-id',
                's-2',
              ]),
            )['job'],
          )
          const blocked = await said(tree, 'parity: blocked')
          const theirStuck = jobIn(blocked.results)
          succeeded(
            await tree.cli(['schedule', 'cancel-job', '--job', stuck, '--action-id', 'x-1']),
          )
          const cancelled = await said(tree, `parity: cancel ${theirStuck}`)
          expect(cancelled.results[0]?.head).toBe('done Jobs cancel')
          const [one, other] = await Promise.all(
            [stuck, theirStuck].map(job =>
              jobOf(tree, job, found => found['state'] === 'concluded'),
            ),
          )
          expect(sameOf(other ?? {})).toEqual(sameOf(one ?? {}))
          expect(sameOf(one ?? {})).toMatchObject({ outcome: 'cancelled', work: NOWHERE })
        },
      ])
    },
  )

  it(
    'from a Job to its round and back: the Job names the position its work began after, an agent reads the session from there, and a person reads the Jobs of a session',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const script = answeringDecisions(toolCallsByRequest(calls), () => ({ criterion: 'holds' }))
      await onReleaseTreeRuns({ ...TREE, script, time: fastTime() }, [
        async tree => {
          const here = await said(tree, 'parity: here')
          const jobId = jobIn(here.results)
          const job = await jobOf(tree, jobId, found => found['state'] === 'concluded')
          const where = job['where'] as Carried
          expect(where.session).toBe(here.session)
          const entries = await historyOf(tree, here.session)
          const at = entries.findIndex(entry => entry.entryId === where.account.since)
          expect(at).toBeGreaterThanOrEqual(0)
          const later = entries.slice(at + 1)
          const began = later.find(entry => entry.kind === 'run.started')
          expect(began).toBeDefined()
          expect(where.account.run).toBe(began?.payload['run'])

          const asked = await said(tree, `parity: round ${jobId}`)
          expect(asked.results[0]?.head).toBe('done Jobs show')
          const read = toolResults(await historyOf(tree, asked.session)).flatMap(text => {
            const done = READ.exec(text)
            if (done === null) return []
            const items = JSON.parse(done[3] ?? '[]') as ReadItem[]
            return [{ session: done[1], exhausted: done[2], items }]
          })
          expect(read.map(one => [one.session, one.exhausted])).toEqual([[here.session, 'true']])
          const items = read[0]?.items ?? []
          expect(items.every(item => item.session === here.session)).toBe(true)
          const positions = items.map(item => BigInt(item.position))
          const since = BigInt(String(where.account.since))
          expect(positions.every((position, at) => position > (positions[at - 1] ?? since))).toBe(
            true,
          )
          const kinds = new Set(items.map(item => item.kind))
          const seen = later.filter(entry => kinds.has(entry.kind)).map(entry => entry.entryId)
          expect(seen.length).toBeGreaterThan(0)
          expect(seen.filter(id => !positions.includes(BigInt(id)))).toEqual([])
          expect(items.find(item => item.position === began?.entryId)).toMatchObject({
            kind: 'run.started',
            material: { run: where.account.run },
          })

          const work = fileOf(tree, 'work.json', agent({ mode: 'new' }))
          const fresh = String(
            succeeded(
              await tree.cli(['schedule', 'start-job', '--work-file', work, '--start-id', 's-9']),
            )['job'],
          )
          const inNew = await jobOf(tree, fresh, found => found['state'] === 'concluded')
          const opened = inNew['where'] as Carried
          const first = (await historyOf(tree, opened.session)).find(
            entry => entry.kind === 'run.started',
          )
          expect(opened.account).toMatchObject({ since: null, run: first?.payload['run'] })

          const jobsOf = async (session: string) =>
            succeeded(await tree.cli(['schedule', 'session-jobs', '--session', session]))['items']
          expect(await jobsOf(opened.session)).toEqual([inNew])
          expect(await jobsOf(here.session)).toEqual([job])
          expect(await jobsOf(asked.session)).toEqual([])
        },
      ])
    },
  )
})
