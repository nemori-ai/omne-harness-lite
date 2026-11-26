import { describe, expect, it } from 'vitest'
import {
  judgeExtensionOutput,
  type EnabledExtension,
  type ExtensionInput,
  type ExtensionInvocationResult,
} from '@omne-harness/agent-contract'
import type { CheckAnswer, GoalChecking, GoalRefusal, Outcome } from '@omne-harness/goal-contract'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import { createGoalCheck, GOAL_CHECK_MEMBERS, GOAL_CHECK_OWNER } from '../src/index.ts'

const organization = organizationCodec.parse('org_c0nf0rmance000000000000000')
const account = accountCodec.parse('acc_c0nf0rmance000000000000000')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
const LEGAL = tenant(organization.value, account.value)
const encoded = tenantCodec.encode(LEGAL)
if (!encoded.ok) throw new Error('the test tenant has no text')
const TENANT = encoded.value
const WORK = Object.freeze({ subject: 'the work of session-1' })
const ACCESS = { principal: WORK, tenant: LEGAL }
const [TERMINAL, COMPACTED] = GOAL_CHECK_MEMBERS as [EnabledExtension, EnabledExtension]

const input = (subject: unknown, passage = 'cand-1/before_terminal/call/0'): ExtensionInput =>
  ({
    position: 'before_terminal',
    subject,
    earlier: [],
    execution: 'exec-1',
    passage,
  }) as unknown as ExtensionInput
const COMPLETE = { proposed: { kind: 'complete' }, basis: {} }
const FAILING = { proposed: { kind: 'fail', cause: {} }, basis: {} }
const done = <T>(value: T): Outcome<T, GoalRefusal> => ({ kind: 'done', value, recalled: false })

function world() {
  const state = {
    away: false,
    session: 'session-1' as string | null | 'unavailable',
    observe: done<CheckAnswer>({ kind: 'pass' }) as Outcome<CheckAnswer, GoalRefusal>,
    compacted: done<string | null>(null) as Outcome<string | null, GoalRefusal>,
  }
  const observed: unknown[][] = []
  const checking: GoalChecking = {
    async observe(...args) {
      observed.push(args)
      return state.observe
    },
    async compacted(...args) {
      observed.push(args)
      return state.compacted
    },
  }
  const check = createGoalCheck<typeof WORK>({
    checking: () => (state.away ? undefined : checking),
    sessionOf: async () => state.session,
    callerOf: (principal, tenantText) => ({ tenant: tenantText, subject: { check: principal } }),
  })
  return { check, state, observed }
}

/** What the Agent makes of an answer at the position and with the power of the member that gave it. */
function judged(member: EnabledExtension, result: ExtensionInvocationResult) {
  if (result.kind !== 'output') throw new Error(`no output: ${result.kind}`)
  const { position, power } = member.declaration
  const subject = position === 'before_terminal' ? COMPLETE : { transition: {} }
  return judgeExtensionOutput({
    position,
    dimension: null,
    purpose: null,
    power,
    trigger: null,
    subject: subject as never,
    output: result.value,
  })
}

describe('the two trusted system extensions of goals', () => {
  it('are the check before a round ends, which may veto, and the reminder after a compaction, which may only add', () => {
    expect(GOAL_CHECK_MEMBERS.map(member => member.declaration)).toEqual([
      {
        name: 'goal_check',
        position: 'before_terminal',
        power: 'veto',
        implementation: { kind: 'builtin', builtinName: 'goal_check' },
        onError: 'treat_as_veto',
        unavailability: 'veto',
      },
      {
        name: 'goal_after_compaction',
        position: 'after_compaction',
        power: 'rewrite',
        implementation: { kind: 'builtin', builtinName: 'goal_after_compaction' },
        unavailability: 'skip',
      },
    ])
    for (const { implementation } of GOAL_CHECK_MEMBERS) {
      expect(implementation.owner).toBe(GOAL_CHECK_OWNER)
      expect(implementation.digest).toMatch(/^[0-9a-f]{64}$/u)
    }
    expect(new Set(GOAL_CHECK_MEMBERS.map(member => member.implementation.digest)).size).toBe(2)
  })
})

describe('the check before a round ends', () => {
  it('asks the goals as the check of this session, under the call of this pass, and lets the round end on a pass', async () => {
    const w = world()
    const result = await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))
    expect(result).toEqual({ kind: 'output', value: { kind: 'observed' } })
    expect(w.observed).toEqual([
      [
        { tenant: TENANT, subject: { check: WORK } },
        { session: 'session-1', call: 'cand-1/before_terminal/call/0', candidate: 'complete' },
      ],
    ])
    expect(judged(TERMINAL, result)).toMatchObject({ kind: 'accepted' })
  })

  it('tells the goals when the round proposes to fail', async () => {
    const w = world()
    await w.check.invoke(ACCESS, TERMINAL, input(FAILING))
    expect(w.observed[0]?.[1]).toMatchObject({ candidate: 'failed' })
  })

  it('vetoes the end of the round when the goals answer to go on', async () => {
    const w = world()
    w.state.observe = done({ kind: 'continue' })
    const result = await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))
    expect(result).toMatchObject({ kind: 'output', value: { kind: 'veto' } })
    expect(judged(TERMINAL, result)).toMatchObject({ kind: 'accepted' })
  })

  it('leaves the person the note in the conversation when the goals hand over to them, the same message for the same call', async () => {
    const w = world()
    w.state.observe = done({ kind: 'tell', note: '目标暂停了，交给你定。' })
    const result = await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))
    const again = await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))
    const other = await w.check.invoke(
      ACCESS,
      TERMINAL,
      input(COMPLETE, 'cand-2/before_terminal/call/0'),
    )
    expect(result).toEqual(again)
    expect(result).not.toEqual(other)
    const accepted = judged(TERMINAL, result)
    if (accepted.kind !== 'accepted' || accepted.value.kind !== 'inject') throw new Error('refused')
    expect(accepted.value.message).toMatchObject({
      role: 'system_reminder',
      blocks: [{ kind: 'text', text: '目标暂停了，交给你定。', visibility: { toHuman: true } }],
    })
  })

  it('has the Agent wait and ask again when the basis is away or the write is not known', async () => {
    const unknown: Outcome<CheckAnswer, GoalRefusal>[] = [
      { kind: 'basis-unavailable' },
      { kind: 'unknown' },
    ]
    for (const outcome of unknown) {
      const w = world()
      w.state.observe = outcome
      expect(await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))).toMatchObject({
        kind: 'invocationUnresolved',
        start: { kind: 'unknown' },
        recovery: { owner: GOAL_CHECK_OWNER, record: 'cand-1/before_terminal/call/0' },
      })
    }
    const away = world()
    away.state.away = true
    expect(await away.check.invoke(ACCESS, TERMINAL, input(COMPLETE))).toMatchObject({
      kind: 'invocationUnresolved',
    })
    const blind = world()
    blind.state.session = 'unavailable'
    expect(await blind.check.invoke(ACCESS, TERMINAL, input(COMPLETE))).toMatchObject({
      kind: 'invocationUnresolved',
    })
    expect(blind.observed).toEqual([])
  })

  it('reports an error when the goals refuse the check', async () => {
    const w = world()
    w.state.observe = { kind: 'refused', reason: { kind: 'denied' } }
    expect(await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))).toEqual({
      kind: 'errored',
      error: 'the check of the goal was refused: denied',
    })
  })

  it('lets the round end, and asks nobody, for a work that belongs to no session or a subject that proposes nothing', async () => {
    const w = world()
    w.state.session = null
    expect(await w.check.invoke(ACCESS, TERMINAL, input(COMPLETE))).toEqual({
      kind: 'output',
      value: { kind: 'observed' },
    })
    w.state.session = 'session-1'
    expect(await w.check.invoke(ACCESS, TERMINAL, input({ transition: {} }))).toEqual({
      kind: 'output',
      value: { kind: 'observed' },
    })
    expect(w.observed).toEqual([])
  })
})

describe('the reminder after a compaction', () => {
  const compaction = input({ transition: {} }, 'prep-1/after_compaction/call/0')

  it('gives the agent the note of the goal in progress, shown to the model only', async () => {
    const w = world()
    w.state.compacted = done<string | null>('Purpose: 写 CHANGELOG')
    const result = await w.check.invoke(ACCESS, COMPACTED, compaction)
    const accepted = judged(COMPACTED, result)
    if (accepted.kind !== 'accepted' || accepted.value.kind !== 'inject') throw new Error('refused')
    expect(accepted.value.message.blocks).toMatchObject([
      { text: 'Purpose: 写 CHANGELOG', visibility: { toHuman: false, toModel: true } },
    ])
    expect(w.observed).toEqual([[{ tenant: TENANT, subject: { check: WORK } }, 'session-1']])
  })

  it('adds nothing when no goal is in progress', async () => {
    const w = world()
    expect(await w.check.invoke(ACCESS, COMPACTED, compaction)).toEqual({
      kind: 'output',
      value: { kind: 'observed' },
    })
  })

  it('is skipped as unavailable, never said to have observed, when the goals cannot answer', async () => {
    const w = world()
    w.state.compacted = { kind: 'basis-unavailable' }
    expect(await w.check.invoke(ACCESS, COMPACTED, compaction)).toEqual({
      kind: 'notStartedUnavailable',
    })
    w.state.away = true
    expect(await w.check.invoke(ACCESS, COMPACTED, compaction)).toEqual({
      kind: 'notStartedUnavailable',
    })
    w.state.session = 'unavailable'
    expect(await w.check.invoke(ACCESS, COMPACTED, compaction)).toEqual({
      kind: 'notStartedUnavailable',
    })
  })
})
