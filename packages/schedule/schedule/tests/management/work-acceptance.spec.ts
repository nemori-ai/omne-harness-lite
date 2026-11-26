import { describe, expect, it, vi } from 'vitest'
import {
  ScheduleCommandSchema,
  ScheduleDefinitionSchema,
  type ScheduleExecutorAcceptance,
  type ScheduleJobExecutor,
  type ScheduleWork,
} from '@omne-harness/schedule-contract'
import { createScheduleDefinitionRef } from '@omne-harness/schedule'
import { command, context, createInput, definition, record } from './fixtures.ts'
import { protocolFixture } from './application-fixture.ts'

const MODES = {
  permission: 'never',
  environmentAdoptionRef: 'adoption:1',
  collaboration: 'auto-drive',
}
const agentWork = (purpose: string) => ({
  kind: 'agent',
  instruction: { purpose },
  session: { mode: 'new', agentDefinitionRef: 'coding', modes: MODES, workspace: null },
  materials: [],
  returnTo: null,
  resultPolicy: {
    audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
    publication: { kind: 'provider', providerRef: 'publication:test' },
    resultSeriesId: null,
    attention: 'silent',
    archive: { kind: 'none' },
  },
})
const agentDefinition = (purpose = '写周报') =>
  ScheduleDefinitionSchema.parse({
    ...definition,
    purpose: {
      kind: 'execution',
      work: agentWork(purpose),
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'parallel',
      misfire: { kind: 'lapse' },
      notifications: [],
    },
  })

function createOf(given = agentDefinition()) {
  const request = createInput().request
  if (request.kind !== 'create') throw new Error('fixture')
  return { ...request.input, definition: given }
}
function agentRecord(control: Parameters<typeof record>[0] = 'active') {
  const current = record(control)
  const view = { ...current.view, definition: agentDefinition('旧的') }
  return { ...current, view, definitionRef: createScheduleDefinitionRef(view) }
}
function judging(answer: ScheduleExecutorAcceptance | Error) {
  const accepts = vi.fn<NonNullable<ScheduleJobExecutor['accepts']>>(async () => {
    if (answer instanceof Error) throw answer
    return answer
  })
  const taken = { accepts } as unknown as ScheduleJobExecutor
  const executor = vi.fn<(work: ScheduleWork) => ScheduleJobExecutor>(() => taken)
  return { accepts, executor }
}
const edit = (purpose: string) =>
  ScheduleCommandSchema.parse({
    ...command('update'),
    patch: { kind: 'executionText', instruction: { purpose }, label: null },
  })

describe('work is asked of the executor of its path before it is saved', () => {
  it('creates when the executor takes the work, asking it with the work as written and before anything is resolved', async () => {
    const { accepts, executor } = judging({ kind: 'accepted' })
    const fixture = protocolFixture(null, { executor })
    expect(await fixture.commands.create(context, createOf())).toMatchObject({ kind: 'committed' })
    expect(accepts.mock.calls).toEqual([[agentWork('写周报'), context.owner]])
    expect(executor.mock.calls).toEqual(accepts.mock.calls.map(([work]) => [work]))
  })

  it('refuses a create the executor refuses, with its reason, and saves nothing', async () => {
    const { executor } = judging({ kind: 'refused', reason: 'A1.evidence: 无人值守的目标要有证据' })
    const fixture = protocolFixture(null, { executor })
    expect(await fixture.commands.create(context, createOf())).toEqual({
      kind: 'rejected',
      error: {
        code: 'invalid_input',
        message: 'A1.evidence: 无人值守的目标要有证据',
        retryable: false,
        requestId: context.requestId,
        details: {},
      },
    })
    expect(fixture.calls).not.toContain('definition')
    expect(fixture.calls).not.toContain('commit')
  })

  it.each([
    [
      'answers that it does not know',
      { kind: 'unknown', reason: 'goal rules unreachable' } as const,
    ],
    ['throws', new Error('lost')],
  ])('holds the create back, to be tried again, when the executor %s', async (_, answer) => {
    const fixture = protocolFixture(null, { executor: judging(answer).executor })
    expect(await fixture.commands.create(context, createOf())).toMatchObject({
      kind: 'rejected',
      error: { code: 'dependency_blocked', retryable: true },
    })
    expect(fixture.calls).not.toContain('commit')
  })

  it('asks about the instruction an edit would leave, and refuses the edit the executor refuses', async () => {
    const { accepts, executor } = judging({ kind: 'refused', reason: 'purpose: 太长' })
    const fixture = protocolFixture(agentRecord(), { executor })
    expect(await fixture.commands.execute(context, edit('新的'))).toMatchObject({
      kind: 'rejected',
      error: { code: 'invalid_input', message: 'purpose: 太长' },
    })
    expect(accepts.mock.calls).toEqual([[agentWork('新的'), context.owner]])
    expect(fixture.calls).not.toContain('commit')
  })

  it('asks again when a draft is promoted or a schedule replaced, with the work that would run', async () => {
    const promoted = judging({ kind: 'accepted' })
    const draft = protocolFixture(agentRecord('draft'), { executor: promoted.executor })
    await draft.commands.execute(context, command('promote'))
    expect(promoted.accepts.mock.calls).toEqual([[agentWork('旧的'), context.owner]])
    const replaced = judging({ kind: 'refused', reason: 'no' })
    const active = protocolFixture(agentRecord(), { executor: replaced.executor })
    const successor = ScheduleCommandSchema.parse({
      ...command('replace'),
      successor: agentDefinition('换一个'),
    })
    expect(await active.commands.execute(context, successor)).toMatchObject({
      kind: 'rejected',
      error: { code: 'invalid_input', message: 'no' },
    })
    expect(replaced.accepts.mock.calls).toEqual([[agentWork('换一个'), context.owner]])
  })

  it.each(['pause', 'resume', 'stop', 'discard'] as const)(
    'does not ask for %s: the work does not change',
    async action => {
      const { executor } = judging({ kind: 'refused', reason: 'never asked' })
      const fixture = protocolFixture(agentRecord(action === 'resume' ? 'paused' : 'active'), {
        executor,
      })
      await fixture.commands.execute(context, command(action))
      expect(executor).not.toHaveBeenCalled()
    },
  )

  it('does not ask for a rename, nor for a reminder: there is no work to judge', async () => {
    const { executor } = judging({ kind: 'refused', reason: 'never asked' })
    const renamed = protocolFixture(agentRecord(), { executor })
    expect(await renamed.commands.execute(context, command('update'))).toMatchObject({
      kind: 'committed',
    })
    const reminder = protocolFixture(null, { executor })
    expect(await reminder.commands.create(context, createOf(definition))).toMatchObject({
      kind: 'committed',
    })
    expect(executor).not.toHaveBeenCalled()
  })

  it('takes the work when no executor is registered for its path, or the executor does not judge: dispatch blocks it later', async () => {
    const none = protocolFixture(null, { executor: () => undefined })
    expect(await none.commands.create(context, createOf())).toMatchObject({ kind: 'committed' })
    const silent = protocolFixture(null, { executor: () => ({}) as ScheduleJobExecutor })
    expect(await silent.commands.create(context, createOf())).toMatchObject({ kind: 'committed' })
    const unset = protocolFixture(null)
    expect(await unset.commands.create(context, createOf())).toMatchObject({ kind: 'committed' })
  })
})
