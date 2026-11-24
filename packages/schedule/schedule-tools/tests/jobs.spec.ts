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
import { CALL, ID, NOW, TENANT, context, scope } from './world.ts'

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

type Answers = Partial<Record<'executions' | 'get' | 'cancel' | 'start', unknown>>

function world(answers: Answers = {}) {
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
  } as unknown as ScheduleJobs
  const bound = bindJobs({
    tenant: TENANT,
    call: CALL,
    queries: () => queries,
    jobs: () => jobs,
    context: async () => context,
    now: () => NOW as never,
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
    const text = await w.run(parse('start', { program: 'probe', input: { n: 1 } }))
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

  it('says unknown, never done, when a write may or may not have happened', async () => {
    const unknown = { kind: 'ok', value: { outcome: 'unknown', detail: null } }
    const w = world({ start: unknown, cancel: unknown })
    expect(await w.run(parse('start', { program: 'probe' }))).toMatch(/^unknown reason=/)
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
