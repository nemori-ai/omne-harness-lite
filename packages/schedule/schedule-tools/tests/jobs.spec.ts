import { describe, expect, it } from 'vitest'
import type { ScheduleJobs, ScheduleQueries } from '@omne-harness/schedule-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { deriveDefinition } from '@omne-harness/tool-contract/provider'
import {
  attachJobs,
  bindJobs,
  createJobsAuthor,
  jobsExecutor,
  jobsToolModule,
  jobsParameterCodec,
  type JobsArguments,
  type JobsCommandName,
} from '@omne-harness/schedule-tools'
import { DEFAULT_AGENT_RESULT_POLICY } from '@omne-harness/schedule-contract'
import { CALL, FOR_NEW, ID, NOW, TENANT, context, scope } from './world.ts'

const JOB = '0d6c1f8e-2a4b-4c3d-8e5f-6a7b8c9d0e1f'
const summary = {
  jobId: JOB,
  revision: 3,
  acceptedAt: NOW,
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
  events: [{ seq: 1, kind: 'accepted', at: NOW }],
}

type Answers = Partial<Record<'executions' | 'get' | 'cancel' | 'start' | 'ofExecution', unknown>>
type Source = Partial<Parameters<typeof bindJobs>[0]>

function world(answers: Answers = {}, source: Source = {}) {
  const asked: [string, unknown][] = []
  const reply = (name: keyof Answers) => async (_ctx: unknown, input: unknown) => {
    asked.push([name, input])
    return answers[name]
  }
  const queries = { executions: reply('executions') } as unknown as ScheduleQueries
  const jobs = {
    get: reply('get'),
    cancel: reply('cancel'),
    start: reply('start'),
    ofExecution: reply('ofExecution'),
  } as unknown as ScheduleJobs
  const bound = bindJobs({
    tenant: TENANT,
    call: CALL,
    queries: () => queries,
    jobs: () => jobs,
    context: async () => context,
    now: () => NOW as never,
    newSessionDefaults: async () => FOR_NEW,
    ...source,
  })
  const base = scope()
  const execution = attachJobs(base, bound)
  return {
    asked,
    bound,
    run: (args: JobsArguments) => jobsExecutor.execute(args, null, execution.context),
  }
}

function parse(command: JobsCommandName, params: unknown): JobsArguments {
  const text = JSON.stringify(params)
  const parsed = jobsParameterCodec(command).parse({
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
  return parsed.ok
}

describe('the Jobs tool', () => {
  it('lists the runs of a schedule: a slot with its Job, and a missed stretch with how many and why', async () => {
    const w = world({
      executions: {
        kind: 'ok',
        value: {
          items: [
            {
              kind: 'lapse',
              rowRef: 'lapse:1',
              scheduleId: ID,
              originalScheduledAt: NOW,
              through: NOW,
              cause: 'stopped',
              reason: 'catch-up-latest',
              count: 2,
              selected: 1,
            },
          ],
          nextCursor: null,
        },
      },
    })
    const text = await w.run(parse('list', { schedule: ID }))
    expect(text).toMatch(/^done Jobs list\n/)
    expect(JSON.parse(text.split('\n')[1] ?? '')).toEqual({
      items: [
        {
          kind: 'missed',
          schedule: ID,
          from: NOW,
          through: NOW,
          cause: 'stopped',
          reason: 'catch-up-latest',
          count: 2,
          caughtUp: 1,
        },
      ],
      next: null,
    })
    expect(w.asked).toEqual([
      ['executions', { scheduleId: ID, from: null, to: null, cursor: null, limit: 20 }],
    ])
  })

  it('shows one Job with its work, where it runs and its steps', async () => {
    const w = world({ get: { kind: 'ok', value: detail } })
    const text = await w.run(parse('show', { job: JOB }))
    expect(JSON.parse(text.split('\n')[1] ?? '')).toMatchObject({
      job: JOB,
      state: 'running',
      work: { kind: 'program', programRef: 'probe' },
      where: { programRef: 'probe' },
      steps: [`1 accepted ${NOW}`],
    })
  })

  it('starts a registered program with a key from the call, not from the model; the same call is the same key', async () => {
    const w = world({ start: { kind: 'ok', value: { outcome: 'committed', detail } } })
    const program = { kind: 'program', programRef: 'probe', input: { n: 1 } }
    const text = await w.run(parse('start', { work: program }))
    expect(text).toMatch(/^done Jobs start\n/)
    expect(w.asked[0]).toEqual([
      'start',
      {
        work: { kind: 'program', programRef: 'probe', input: { n: 1 } },
        operationKey: w.bound.operationKey('start'),
      },
    ])
    expect(w.bound.operationKey('start')).toMatch(/^tool:/)
    expect(w.bound.operationKey('start')).not.toBe(w.bound.operationKey('cancel'))
  })

  const started = { start: { kind: 'ok', value: { outcome: 'committed', detail } } }
  const instruction = { purpose: '写周报' }
  const REST = { materials: [], returnTo: null, resultPolicy: DEFAULT_AGENT_RESULT_POLICY }
  const agent = (session: unknown) => ({ kind: 'agent', instruction, session })
  const sent = (w: ReturnType<typeof world>) => ((w.asked[0] ?? [])[1] as { work: unknown }).work

  it('starts agent work in the session of the call when the work says current: what is sent names that session', async () => {
    const w = world(started)
    const text = await w.run(
      parse('start', { work: agent({ mode: 'existing', sessionRef: 'current' }) }),
    )
    expect(text).toMatch(/^done Jobs start\n/)
    expect(sent(w)).toEqual({ ...agent({ mode: 'existing', sessionRef: 'session-1' }), ...REST })
  })

  it('starts agent work in a new session that takes what the work leaves out from the session of the call', async () => {
    const w = world(started)
    await w.run(parse('start', { work: agent({ mode: 'new' }) }))
    expect(sent(w)).toEqual({ ...agent({ mode: 'new', ...FOR_NEW }), ...REST })
    const named = world(started)
    await named.run(parse('start', { work: agent({ mode: 'new', agentDefinitionRef: 'review' }) }))
    expect(sent(named)).toMatchObject({
      session: { agentDefinitionRef: 'review', modes: FOR_NEW.modes },
    })
  })

  it.each([
    ['cannot be read', async () => undefined],
    [
      'fails to read',
      async () => {
        throw new Error('down')
      },
    ],
  ])(
    'starts nothing when the session of the call %s and the work leaves something out; whole work needs no reading',
    async (_, newSessionDefaults) => {
      const w = world(started, { newSessionDefaults })
      expect(await w.run(parse('start', { work: agent({ mode: 'new' }) }))).toMatch(
        /^unavailable reason=the session of this call cannot be read now/,
      )
      expect(w.asked).toEqual([])
      const whole = agent({ mode: 'new', ...FOR_NEW })
      expect(await w.run(parse('start', { work: whole }))).toMatch(/^done Jobs start\n/)
    },
  )

  it('refuses work that does not form a Job once completed, before any service is asked', async () => {
    const w = world(started)
    const internal = {
      audience: { kind: 'masterInternal' },
      publication: { kind: 'none' },
      resultSeriesId: null,
      attention: 'silent',
      archive: { kind: 'none' },
    }
    const work = { ...agent({ mode: 'existing', sessionRef: 's-2' }), resultPolicy: internal }
    expect(await w.run(parse('start', { work }))).toBe(
      'invalid reason=the work does not form a Job code=invalid_input',
    )
    expect(w.asked).toEqual([])
  })

  it('without a job, shows the Jobs the session of the call carries out or carried out', async () => {
    const w = world({ ofExecution: { kind: 'ok', value: [detail, detail] } })
    const text = await w.run(parse('show', {}))
    expect(w.asked).toEqual([['ofExecution', { executionRef: 'session-1', limit: 20 }]])
    const shown = JSON.parse(text.split('\n')[1] ?? '') as { session: string; jobs: unknown[] }
    expect(shown.session).toBe('session-1')
    expect(shown.jobs).toMatchObject([{ job: JOB }, { job: JOB }])
    const none = world({ ofExecution: { kind: 'ok', value: [] } })
    expect(await none.run(parse('show', {}))).toBe(
      'done Jobs show\n{"session":"session-1","jobs":[]}',
    )
  })

  it('without a job and outside any session there is nothing to show; a refusal of the read is one line', async () => {
    const outside = world(
      {},
      { context: async () => ({ ...context, originatingSessionRef: null }) },
    )
    expect(await outside.run(parse('show', {}))).toMatch(/^invalid reason=show without job/)
    expect(outside.asked).toEqual([])
    const failed = {
      kind: 'error',
      error: {
        code: 'provider_failure',
        message: 'down',
        retryable: true,
        requestId: 'r',
        details: {},
      },
    }
    expect(await world({ ofExecution: failed }).run(parse('show', {}))).toMatch(
      /^unavailable reason=down/,
    )
  })

  it('says unknown, never done, when a write may or may not have happened', async () => {
    const unknown = { kind: 'ok', value: { outcome: 'unknown', detail: null } }
    const w = world({ start: unknown, cancel: unknown })
    const program = { kind: 'program', programRef: 'probe', input: {} }
    expect(await w.run(parse('start', { work: program }))).toMatch(/^unknown reason=/)
    expect(await w.run(parse('cancel', { job: JOB }))).toMatch(/^unknown reason=.* job=/)
  })

  it('cancels and says whether it changed anything; a refusal is one line', async () => {
    const w = world({ cancel: { kind: 'ok', value: { outcome: 'noChange', detail } } })
    expect(
      JSON.parse((await w.run(parse('cancel', { job: JOB }))).split('\n')[1] ?? ''),
    ).toMatchObject({ changed: false, job: JOB })
    const refused = world({
      get: {
        kind: 'error',
        error: {
          code: 'not_found',
          message: 'no such job',
          retryable: false,
          requestId: 'r',
          details: {},
        },
      },
    })
    expect(await refused.run(parse('show', { job: JOB }))).toBe(
      'not_found reason=no such job code=not_found',
    )
  })

  it('answers unavailable when nothing is attached, and refuses a malformed Job id before asking', async () => {
    const execution = scope()
    expect(await jobsExecutor.execute(parse('list', {}), null, execution.context)).toMatch(
      /^unavailable reason=/,
    )
    const text = JSON.stringify({ job: 'not-an-id' })
    expect(
      'failure' in
        jobsParameterCodec('show').parse({ original: text, effective: text, complete: true }),
    ).toBe(true)
  })

  it('declares three gates, all automatic by default, and puts each command behind one', () => {
    const created = createJobsAuthor({
      kind: 'object',
      entries: [{ key: 'resultMaxBytes', value: { kind: 'number', lexeme: '4096' } }],
    } as never)
    if ('failure' in created) throw new Error(JSON.stringify(created.failure))
    if (readToolRegistration(created.ok)?.kind !== 'commands') throw new Error('commands')
    const definition = deriveDefinition(
      { asset: { name: 'Jobs', adoption: jobsToolModule.executor }, requiredCapabilities: [] },
      created.ok.facts,
    )
    if (definition.kind !== 'commands') throw new Error('commands')
    expect((definition.gates ?? []).map(gate => [gate.id, gate.default])).toEqual([
      ['read', 'auto'],
      ['start', 'auto'],
      ['cancel', 'auto'],
    ])
    expect(
      Object.fromEntries(definition.commands.map(item => [item.name, item.release?.gate])),
    ).toEqual({ help: 'read', list: 'read', show: 'read', start: 'start', cancel: 'cancel' })
  })
})
