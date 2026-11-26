import { describe, expect, it } from 'vitest'
import {
  completeAgentWork,
  completeDefinition,
  DEFAULT_AGENT_RESULT_POLICY,
  SchedulePurposeAsWrittenSchema,
  SchedulePurposeSchema,
  ScheduleWorkAsWrittenSchema,
  ScheduleWorkSchema,
  SESSION_PUBLICATION,
  type ScheduleSessionDefaults,
} from '@omne-harness/schedule-contract'

const MODES = {
  permission: 'never',
  environmentAdoptionRef: 'env@1',
  collaboration: 'co-work',
} as const
const WORKSPACE = { workspaceRef: 'w', instanceRef: 'i', basisRef: 'b' }
const HERE: ScheduleSessionDefaults = {
  current: 'session-7',
  forNew: { agentDefinitionRef: 'coding', modes: MODES, workspace: WORKSPACE },
}
const PERSON: ScheduleSessionDefaults = {
  current: null,
  forNew: { agentDefinitionRef: 'coding', modes: MODES, workspace: null },
}
const NOWHERE: ScheduleSessionDefaults = { current: null, forNew: null }
const instruction = { purpose: '写周报' }
const REST = { materials: [], returnTo: null, resultPolicy: DEFAULT_AGENT_RESULT_POLICY }
const agent = (session: unknown, more: object = {}) => ({
  kind: 'agent',
  instruction,
  session,
  ...more,
})
const completed = (work: unknown, defaults: ScheduleSessionDefaults) => {
  const answer = completeAgentWork(work, defaults)
  if (answer.kind !== 'completed') throw new Error(JSON.stringify(answer))
  return answer.work
}

describe('completing agent work before it is read by the schema', () => {
  it('the default result policy is one the schema takes: for the owner, published in the session of the Job, silent, not archived', () => {
    expect(DEFAULT_AGENT_RESULT_POLICY).toEqual({
      audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
      publication: { kind: 'provider', providerRef: SESSION_PUBLICATION },
      resultSeriesId: null,
      attention: 'silent',
      archive: { kind: 'none' },
    })
    expect(SESSION_PUBLICATION).toBe('session')
  })

  it('a session that exists named by its id stays as written, whoever asks', () => {
    const written = agent({ mode: 'existing', sessionRef: 's-1' }, REST)
    for (const defaults of [HERE, PERSON, NOWHERE])
      expect(completed(written, defaults)).toEqual(written)
  })

  it('`current` becomes the session the caller is in; what is saved is that session, and the schema takes it', () => {
    const work = completed(agent({ mode: 'existing', sessionRef: 'current' }), HERE)
    expect(work).toEqual(agent({ mode: 'existing', sessionRef: 'session-7' }, REST))
    expect(ScheduleWorkSchema.parse(work)).toEqual(work)
  })

  it('refuses `current` from a caller that is in no session', () => {
    for (const defaults of [PERSON, NOWHERE])
      expect(
        completeAgentWork(agent({ mode: 'existing', sessionRef: 'current' }), defaults),
      ).toEqual({
        kind: 'refused',
        reason:
          'session.sessionRef: current names the session of the caller, and this caller is in none',
      })
  })

  it('a new session takes each of the three it leaves out from the defaults, and keeps what it writes', () => {
    expect(completed(agent({ mode: 'new' }), HERE)).toEqual(
      agent(
        { mode: 'new', agentDefinitionRef: 'coding', modes: MODES, workspace: WORKSPACE },
        REST,
      ),
    )
    const own = { ...MODES, permission: 'bypass-permissions' }
    expect(
      completed(
        agent({ mode: 'new', agentDefinitionRef: 'review', modes: own, workspace: null }),
        HERE,
      ),
    ).toEqual(
      agent({ mode: 'new', agentDefinitionRef: 'review', modes: own, workspace: null }, REST),
    )
    expect(completed(agent({ mode: 'new', agentDefinitionRef: 'review' }), PERSON)).toEqual(
      agent({ mode: 'new', agentDefinitionRef: 'review', modes: MODES, workspace: null }, REST),
    )
    expect(ScheduleWorkSchema.safeParse(completed(agent({ mode: 'new' }), HERE)).success).toBe(true)
  })

  it('has no basis to complete a new session when the defaults could not be read, and none is needed when all three are written', () => {
    expect(completeAgentWork(agent({ mode: 'new' }), NOWHERE)).toEqual({
      kind: 'basis-unavailable',
    })
    expect(completeAgentWork(agent({ mode: 'new', workspace: null }), NOWHERE)).toEqual({
      kind: 'basis-unavailable',
    })
    const whole = { mode: 'new', agentDefinitionRef: 'coding', modes: MODES, workspace: null }
    expect(completed(agent(whole), NOWHERE)).toEqual(agent(whole, REST))
  })

  it('keeps the materials, the return target and the result policy that are written', () => {
    const written = {
      materials: [{ resourceRef: 'r', versionRef: 'v' }],
      returnTo: { kind: 'external', targetRef: 't' },
      resultPolicy: { ...DEFAULT_AGENT_RESULT_POLICY, attention: 'notify' },
    }
    expect(completed(agent({ mode: 'existing', sessionRef: 's-1' }, written), HERE)).toEqual(
      agent({ mode: 'existing', sessionRef: 's-1' }, written),
    )
  })

  it.each([
    ['program work', { kind: 'program', programRef: 'p', input: {} }],
    ['agent work without a session', { kind: 'agent', instruction }],
    ['program work that carries a session', { kind: 'program', session: { mode: 'new' } }],
    ['a session of a mode it does not know', agent({ mode: 'elsewhere' })],
    ['what is no object', 'work'],
    ['null', null],
    ['a list', [agent({ mode: 'new' })]],
  ])('leaves %s as it is for the schema to judge', (_, work) => {
    expect(completeAgentWork(work, HERE)).toEqual({ kind: 'completed', work })
  })
})

describe('completing the work of a definition', () => {
  const definition = (work: unknown) => ({
    label: 'x',
    purpose: { kind: 'execution', work, scope: { kind: 'fleet' } },
  })

  it('completes the work an execution carries and leaves the rest of the definition as written', () => {
    expect(
      completeDefinition(definition(agent({ mode: 'existing', sessionRef: 'current' })), HERE),
    ).toEqual({
      kind: 'completed',
      definition: definition(agent({ mode: 'existing', sessionRef: 'session-7' }, REST)),
    })
  })

  it('hands on a refusal and a missing basis', () => {
    expect(
      completeDefinition(definition(agent({ mode: 'existing', sessionRef: 'current' })), PERSON),
    ).toMatchObject({ kind: 'refused' })
    expect(completeDefinition(definition(agent({ mode: 'new' })), NOWHERE)).toEqual({
      kind: 'basis-unavailable',
    })
  })

  it('does not read the work of a purpose that is no execution', () => {
    const odd = { label: 'x', purpose: { kind: 'reminder', work: agent({ mode: 'new' }) } }
    expect(completeDefinition(odd, HERE)).toStrictEqual({ kind: 'completed', definition: odd })
    const bare = { label: 'x', purpose: { kind: 'reminder' } }
    expect(completeDefinition(bare, HERE)).toStrictEqual({ kind: 'completed', definition: bare })
  })

  it.each([
    [
      'a reminder',
      { label: 'x', purpose: { kind: 'reminder', content: { title: null, body: 'b' } } },
    ],
    ['a definition without a purpose', { label: 'x' }],
    ['what is no object', 7],
  ])('leaves %s as it is', (_, given) => {
    expect(completeDefinition(given, HERE)).toEqual({ kind: 'completed', definition: given })
  })
})

describe('work as its caller writes it', () => {
  const read = (work: unknown) => ScheduleWorkAsWrittenSchema.safeParse(work).success
  it('takes agent work that leaves out what its place fills in, and the whole work too', () => {
    expect(read(agent({ mode: 'new' }))).toBe(true)
    expect(read(agent({ mode: 'new', workspace: null }))).toBe(true)
    expect(read(agent({ mode: 'existing', sessionRef: 'current' }))).toBe(true)
    expect(read(completed(agent({ mode: 'new' }), HERE))).toBe(true)
    expect(read({ kind: 'program', programRef: 'p', input: {} })).toBe(true)
  })

  it.each([
    ['no instruction', { kind: 'agent', session: { mode: 'new' } }],
    ['no session', { kind: 'agent', instruction }],
    ['a session that exists without its id', agent({ mode: 'existing' })],
    ['a member it does not know', agent({ mode: 'new' }, { extra: 1 })],
    ['a member of the session it does not know', agent({ mode: 'new', extra: 1 })],
    ['modes that are not modes', agent({ mode: 'new', modes: { permission: 'always' } })],
    ['a program without its input', { kind: 'program', programRef: 'p' }],
  ])('refuses %s', (_, work) => {
    expect(read(work)).toBe(false)
  })

  it('reads a purpose as written with the same rest as a whole purpose: what it takes and completes is a purpose', () => {
    const rest = {
      scope: { kind: 'fleet' },
      catchUp: { kind: 'none' },
      overlap: 'skip',
      misfire: null,
      notifications: [],
    }
    const written = { kind: 'execution', work: agent({ mode: 'new' }), ...rest }
    expect(SchedulePurposeAsWrittenSchema.safeParse(written).success).toBe(true)
    expect(SchedulePurposeSchema.safeParse(written).success).toBe(false)
    const whole = { ...written, work: completed(written.work, HERE) }
    expect(SchedulePurposeSchema.safeParse(whole).success).toBe(true)
    const twice = {
      ...written,
      notifications: [1, 2].map(() => ({
        event: 'failed',
        content: { title: null, body: 'b' },
        target: { kind: 'owner' },
      })),
    }
    expect(SchedulePurposeAsWrittenSchema.safeParse(twice).success).toBe(false)
    const tea = {
      kind: 'reminder',
      content: { title: null, body: 'tea' },
      admissionPolicy: 'reminder-window-v1',
      overlap: 'parallel',
    }
    expect(SchedulePurposeAsWrittenSchema.safeParse(tea).success).toBe(true)
  })
})
