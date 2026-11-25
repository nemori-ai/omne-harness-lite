import { describe, expect, it } from 'vitest'
import {
  ACTIVE,
  done,
  RECORD,
  refused,
  SESSION,
  SETTLED,
  SUBJECT,
  TENANT,
  WHERE,
  world,
} from './fixtures/world.ts'

const CALLER = { tenant: TENANT, subject: SUBJECT }
const REVISE = {
  ...WHERE,
  operation: 'op-3',
  proposal: { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] },
  words: '只管首页',
}
const PAUSE = { ...WHERE, generation: 2, command: { kind: 'pause' } }
const NAMES = ['read-goal', 'write-goal', 'query-write-goal', 'command-goal'] as const
const SAMPLE = {
  'read-goal': WHERE,
  'write-goal': REVISE,
  'query-write-goal': REVISE,
  'command-goal': PAUSE,
} as const
const UNAVAILABLE = { outcome: 'basis-unavailable' }

describe('who gets in', () => {
  it.each(NAMES)(
    '%s: a login the entrance does not admit is denied, and the domain is not asked',
    async name => {
      const { script, asked, run } = world()
      script.entry = { kind: 'denied' }
      expect(await run(name, SAMPLE[name])).toEqual({ outcome: 'denied' })
      expect(asked).toEqual([])
    },
  )

  it.each(NAMES)(
    '%s: no basis while the entrance cannot answer, fails, or the goals are not mounted',
    async name => {
      const { script, asked, run } = world()
      script.entry = { kind: 'basis-unavailable' }
      expect(await run(name, SAMPLE[name])).toEqual(UNAVAILABLE)
      script.entry = new Error('identity is down')
      expect(await run(name, SAMPLE[name])).toEqual(UNAVAILABLE)
      script.entry = { kind: 'admitted', subject: SUBJECT, by: 'acc-1' }
      script.mounted = false
      expect(await run(name, SAMPLE[name])).toEqual(UNAVAILABLE)
      expect(asked).toEqual([])
    },
  )

  it.each(NAMES)(
    '%s: what the domain refuses for want of standing or of the session is said as such',
    async name => {
      const { script, run } = world()
      script.read = script.write = script.command = refused({ kind: 'denied' })
      expect(await run(name, SAMPLE[name])).toEqual({ outcome: 'denied' })
      script.read = script.write = script.command = refused({ kind: 'no-such-session' })
      expect(await run(name, SAMPLE[name])).toEqual({ outcome: 'not-found', body: {} })
    },
  )
})

describe('read-goal', () => {
  it('asks as the admitted subject for the tenant and lays the goal out for the panel', async () => {
    const { asked, run } = world()
    const answer = (await run('read-goal', WHERE)) as { body: { goal: Record<string, unknown> } }
    expect(asked).toEqual([['read', CALLER, SESSION]])
    const { goal } = answer.body
    expect(goal.state).toEqual({
      status: 'paused',
      attendance: 'attended',
      generation: 2,
      revision: 2,
      rounds: 7,
      pause: { by: 'verdict', row: 7, exit: null },
      outcome: null,
    })
    expect(goal.rendered).toContain('把首页的加载时间降下来')
    expect(goal.body).toEqual(RECORD.body)
    expect(goal.progress).toEqual(RECORD.progress)
    expect(goal.history).toEqual(RECORD.history)
    expect(goal.gap).toContainEqual({
      id: 'A1',
      ought: '端到端用例全过',
      reading: '证据显示没做到',
      source: 'judge',
      ref: 'call-9',
      open: true,
      short: null,
    })
    expect(goal.gap).toContainEqual({
      id: '预算',
      ought: '20 轮',
      reading: '用了 7 轮',
      source: 'system',
      ref: null,
      open: false,
      short: '剩 13',
    })
    expect(Object.keys(goal).sort()).toEqual(
      ['body', 'gap', 'history', 'progress', 'rendered', 'state'].sort(),
    )
  })

  it('says how a settled goal ended, and reads a session that never had one as none', async () => {
    const { script, run } = world()
    script.read = done(SETTLED)
    const settled = (await run('read-goal', WHERE)) as { body: { goal: { state: unknown } } }
    expect(settled.body.goal.state).toMatchObject({
      status: 'settled',
      pause: null,
      outcome: { kind: 'exit', exit: 'X1', counts: 'failure' },
    })
    script.read = done(null)
    expect(await run('read-goal', WHERE)).toEqual({ outcome: 'succeeded', body: { goal: null } })
  })

  it('carries a goal in progress with no pause and no outcome', async () => {
    const { script, run } = world()
    script.read = done(ACTIVE)
    const active = (await run('read-goal', WHERE)) as { body: { goal: { state: unknown } } }
    expect(active.body.goal.state).toEqual({
      status: 'active',
      attendance: 'attended',
      generation: 2,
      revision: 2,
      rounds: 7,
      pause: null,
      outcome: null,
    })
  })

  it.each([
    ['its body', { ...RECORD, body: { ...RECORD.body, purpose: 'x'.repeat(100_001) } }],
    [
      'its progress list',
      { ...RECORD, progress: { ...RECORD.progress, notes: ['x'.repeat(100_001)] } },
    ],
  ])(
    'never answers a goal with %s left out: a read has no basis, and a write or a command that stood is not known to the client',
    async (_what, record) => {
      const { script, run } = world()
      script.read = script.write = script.command = done(record as never)
      expect(await run('read-goal', WHERE)).toEqual(UNAVAILABLE)
      expect(await run('query-write-goal', { ...REVISE, operation: 'op-2' })).toEqual(UNAVAILABLE)
      expect(await run('write-goal', REVISE)).toEqual({ outcome: 'unknown' })
      expect(await run('command-goal', PAUSE)).toEqual({ outcome: 'unknown' })
    },
  )

  it('has no basis when the domain has none, fails, or answers what a read cannot be answered', async () => {
    const { script, run } = world()
    for (const answer of [
      { kind: 'basis-unavailable' },
      { kind: 'unknown' },
      new Error('the store is down'),
      refused({ kind: 'state', reason: 'no-live-goal' }),
      refused({ kind: 'invalid', issues: [] }),
      refused({ kind: 'another-goal' }),
      refused({ kind: 'no-such-card' }),
    ] as const) {
      script.read = answer
      expect(await run('read-goal', WHERE)).toEqual(UNAVAILABLE)
    }
  })
})

describe('write-goal', () => {
  it('hands the domain the operation, the proposal as plain data and the words, drafted by the person and named by the entrance', async () => {
    const { asked, run } = world()
    const answer = (await run('write-goal', REVISE)) as { outcome: string; body: { goal: object } }
    expect(asked).toEqual([
      [
        'write',
        CALLER,
        {
          session: SESSION,
          operation: 'op-3',
          proposal: { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] },
          words: '只管首页',
          draftedBy: 'person',
          by: 'acc-1',
        },
      ],
    ])
    expect(answer.outcome).toBe('succeeded')
    expect(Object.keys(answer.body.goal)).toContain('gap')
    const set = { ...REVISE, proposal: { kind: 'set', draft: { purpose: '降首页' } }, words: null }
    await run('write-goal', set)
    expect(asked[1]).toMatchObject([
      'write',
      CALLER,
      { proposal: { kind: 'set', draft: { purpose: '降首页' } }, words: null },
    ])
  })

  it('says what is wrong with the body by entry and field, and why the state does not take the write', async () => {
    const { script, run } = world()
    const issues = [{ entry: 'A1', field: 'statement', problem: 'empty' }]
    script.write = refused({ kind: 'invalid', issues })
    expect(await run('write-goal', REVISE)).toEqual({ outcome: 'invalid', body: { issues } })
    script.write = refused({ kind: 'state', reason: 'nobody-attends' })
    expect(await run('write-goal', REVISE)).toEqual({
      outcome: 'conflict',
      body: { reason: 'nobody-attends' },
    })
  })

  it('does not know when the domain does not know or fails, and has no basis when the domain has none', async () => {
    const { script, run } = world()
    script.write = { kind: 'unknown' }
    expect(await run('write-goal', REVISE)).toEqual({ outcome: 'unknown' })
    script.write = new Error('the store went away mid-write')
    expect(await run('write-goal', REVISE)).toEqual({ outcome: 'unknown' })
    script.write = { kind: 'basis-unavailable' }
    expect(await run('write-goal', REVISE)).toEqual(UNAVAILABLE)
    script.write = refused({ kind: 'card', reason: 'not-answered' } as never)
    expect(await run('write-goal', REVISE)).toEqual(UNAVAILABLE)
  })
})

describe('query-write-goal', () => {
  it('finds a write by its operation among the direct ones of the history and answers the goal it left, without writing', async () => {
    const { asked, run } = world()
    const answer = (await run('query-write-goal', { ...REVISE, operation: 'op-2' })) as {
      outcome: string
    }
    expect(answer.outcome).toBe('succeeded')
    expect(asked).toEqual([['read', CALLER, SESSION]])
  })

  it('says not committed for an operation the history has not, one that was a card, and a session with no goal', async () => {
    const { script, run } = world()
    const never = { outcome: 'not-committed', body: {} }
    expect(await run('query-write-goal', REVISE)).toEqual(never)
    expect(await run('query-write-goal', { ...REVISE, operation: 'op-1' })).toEqual(never)
    script.read = done(null)
    expect(await run('query-write-goal', REVISE)).toEqual(never)
  })

  it('has no basis when the goal cannot be read: it is not said to be uncommitted', async () => {
    const { script, run } = world()
    script.read = { kind: 'basis-unavailable' }
    expect(await run('query-write-goal', REVISE)).toEqual(UNAVAILABLE)
    script.read = new Error('the store is down')
    expect(await run('query-write-goal', REVISE)).toEqual(UNAVAILABLE)
  })
})

describe('command-goal', () => {
  it('hands the domain the command with the goal it was given for, and answers the goal as it stands after', async () => {
    const { script, asked, run } = world()
    script.command = done(SETTLED)
    const settle = { ...WHERE, generation: 2, command: { kind: 'settle-by-exit', exit: 'X1' } }
    const answer = (await run('command-goal', settle)) as { body: { goal: { state: object } } }
    expect(asked).toEqual([
      [
        'command',
        CALLER,
        { session: SESSION, generation: 2, command: { kind: 'settle-by-exit', exit: 'X1' } },
      ],
    ])
    expect(answer.body.goal.state).toMatchObject({ status: 'settled' })
    script.command = done(null)
    expect(await run('command-goal', PAUSE)).toEqual({ outcome: 'succeeded', body: { goal: null } })
  })

  it('says why the state does not take it, another goal standing there included', async () => {
    const { script, run } = world()
    script.command = refused({ kind: 'state', reason: 'not-its-cause' })
    expect(await run('command-goal', PAUSE)).toEqual({
      outcome: 'conflict',
      body: { reason: 'not-its-cause' },
    })
    script.command = refused({ kind: 'another-goal' })
    expect(await run('command-goal', PAUSE)).toEqual({
      outcome: 'conflict',
      body: { reason: 'another-goal' },
    })
  })

  it('does not know when the domain does not know or fails; has no basis when the domain has none or answers what a command cannot be answered', async () => {
    const { script, run } = world()
    script.command = { kind: 'unknown' }
    expect(await run('command-goal', PAUSE)).toEqual({ outcome: 'unknown' })
    script.command = new Error('lost')
    expect(await run('command-goal', PAUSE)).toEqual({ outcome: 'unknown' })
    script.command = { kind: 'basis-unavailable' }
    expect(await run('command-goal', PAUSE)).toEqual(UNAVAILABLE)
    script.command = refused({ kind: 'invalid', issues: [] })
    expect(await run('command-goal', PAUSE)).toEqual(UNAVAILABLE)
  })
})
