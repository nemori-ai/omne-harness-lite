import { describe, expect, it } from 'vitest'
import {
  answeredCalls,
  CITED_PAGE_LIMIT,
  continueText,
  goalInputSources,
  GOAL_SOURCES,
  resumeText,
  startText,
} from '../src/index.ts'
import { failure, LEGAL_TENANT, page, result, SESSION, TENANT, work, world } from './world.ts'

const wake = (change: object = {}) =>
  ({
    kind: 'start',
    request: 'start/1/1',
    session: SESSION,
    rendered: '## 目的\n做完',
    open: '',
    implied: false,
    ...change,
  }) as const
const textOf = (input: { value: { message: unknown } }) =>
  (input.value.message as { blocks: { text: string }[] }).blocks[0]?.text

describe('the input sources of goals', () => {
  it('are three, each taken from the system component of goals, each waking the session', () => {
    expect(goalInputSources('goal')).toEqual(
      ['goal.start', 'goal.resume', 'goal.continue'].map(name => ({
        name,
        label: expect.any(String),
        accepts: { subject: 'system', component: 'goal', screened: false },
        wake: 'always',
      })),
    )
    expect(new Set(goalInputSources('goal').map(source => source.label)).size).toBe(3)
  })
})

describe('the reminder that sends the agent on', () => {
  it('goes in through the source of going on, under the identity of its round, with the rows still open', async () => {
    const { sessions, accepted } = world()
    const open = '- [A1] 改动说明写进了 CHANGELOG：证据显示没做到（判定）'
    const sent = await sessions.wake(
      TENANT,
      wake({ kind: 'continue', request: 'continue/1/1/2', open }),
    )
    expect(sent).toBe('sent')
    const [input] = accepted
    if (input === undefined) throw new Error('nothing was accepted')
    expect(input.value.source).toBe(GOAL_SOURCES.continue)
    expect(textOf(input)).toBe(continueText(open))
    expect(continueText(open)).toContain(`Still open:\n${open}`)
    expect(continueText(open)).toContain('not met yet')
    expect(continueText('')).not.toContain('Still open')
    const again = world()
    await again.sessions.wake(TENANT, wake({ kind: 'continue', request: 'continue/1/1/2', open }))
    expect(again.accepted[0]?.value.input).toBe(input.value.input)
    await again.sessions.wake(TENANT, wake({ kind: 'continue', request: 'continue/1/1/3', open }))
    expect(again.accepted[1]?.value.input).not.toBe(input.value.input)
  })
})

describe('the facts of a session a goal stands on', () => {
  it('whether somebody attends it is what the session itself says; a session that never said is attended', async () => {
    const { sessions, state } = world()
    expect(await sessions.facts(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: { attendance: 'attended', moment: '41', drive: null },
    })
    state.work = { kind: 'read', value: work({ attendance: 'unattended' }) }
    state.head = { kind: 'read', value: null }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: { attendance: 'unattended', moment: '0', drive: null },
    })
  })
  it('a session that drives itself says which input opened its round; one that does not is never asked', async () => {
    const { sessions, state, opens } = world()
    await sessions.facts(TENANT, SESSION)
    expect(opens.count).toBe(0)
    state.drives = { kind: 'read', value: true }
    expect(await sessions.facts(TENANT, SESSION)).toMatchObject({ value: { drive: null } })
    state.opened = { kind: 'read', value: { since: '37', text: '把改动说明写进 CHANGELOG' } }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: {
        attendance: 'attended',
        moment: '41',
        drive: { since: '37', text: '把改动说明写进 CHANGELOG' },
      },
    })
    state.opened = { kind: 'unavailable' }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
    state.drives = { kind: 'unavailable' }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
  })
  it('what the person last said is what the history of the session holds of them, with its place; nothing said reads as null', async () => {
    const { sessions, state } = world()
    expect(await sessions.asked(TENANT, SESSION)).toEqual({ kind: 'read', value: null })
    state.asked = { kind: 'read', value: { at: '30', text: '/goal 把首页降下来' } }
    expect(await sessions.asked(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: { at: '30', text: '/goal 把首页降下来' },
    })
    state.asked = { kind: 'unavailable' }
    expect(await sessions.asked(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
    state.asked = new Error('down')
    expect(await sessions.asked(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
    expect(await sessions.asked('not a tenant', SESSION)).toEqual({ kind: 'read', value: null })
  })
  it('a session this tenant has none of reads as null, and a text that names no tenant too', async () => {
    const { sessions, state } = world()
    state.work = { kind: 'read', value: null }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({ kind: 'read', value: null })
    expect(await sessions.facts('not-a-tenant', SESSION)).toEqual({ kind: 'read', value: null })
  })
  it('a read that fails is unavailable, never an attended session', async () => {
    const { sessions, state } = world()
    state.work = { kind: 'unavailable' }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
    state.work = { kind: 'read', value: work() }
    state.head = { kind: 'unavailable' }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({ kind: 'unavailable' })
  })
})

describe('the reminder a goal sends its session', () => {
  it('is a system reminder by the source of its kind, carrying the goal', async () => {
    const { sessions, accepted } = world()
    expect(await sessions.wake(TENANT, wake())).toBe('sent')
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toMatchObject({
      tenant: LEGAL_TENANT,
      session: SESSION,
      value: {
        kind: 'ordinary',
        source: GOAL_SOURCES.start,
        message: { role: 'system_reminder' },
        origin: { owner: '@omne-harness/goal-session' },
      },
    })
    expect(textOf(accepted[0]!)).toBe(startText('## 目的\n做完'))
    await sessions.wake(TENANT, wake({ kind: 'resume', request: 'resume/1/3' }))
    expect(accepted[1]?.value.source).toBe(GOAL_SOURCES.resume)
    expect(textOf(accepted[1]!)).toBe(resumeText('## 目的\n做完'))
  })

  it('the same request is the same input and the same operation; another request is another', async () => {
    const { sessions, accepted } = world()
    await sessions.wake(TENANT, wake())
    await sessions.wake(TENANT, wake())
    await sessions.wake(TENANT, wake({ request: 'start/2/1' }))
    await sessions.wake(TENANT, wake({ kind: 'resume' }))
    const ids = accepted.map(input => [input.operation, input.value.input, input.value.message.id])
    expect(ids[1]).toEqual(ids[0])
    for (const other of [ids[2], ids[3]])
      for (const index of [0, 1, 2]) expect(other?.[index]).not.toBe(ids[0]?.[index])
    expect(ids[0]?.[0]).toMatch(/^sop_/u)
  })

  it.each(['archived', 'frozen', 'denied', 'not-found'] as const)(
    'a session that answers %s is owed nothing',
    async kind => {
      const { sessions, state } = world()
      state.answer = failure(kind)
      expect(await sessions.wake(TENANT, wake())).toBe('refused')
    },
  )
  it.each(['commit-unknown', 'unavailable', 'quarantined'] as const)(
    'an answer of %s says nothing of whether it was taken: unknown',
    async kind => {
      const { sessions, state } = world()
      state.answer = failure(kind)
      expect(await sessions.wake(TENANT, wake())).toBe('unknown')
    },
  )
  it('a call that throws or answers unknown is unknown; a text that names no tenant is refused unsent', async () => {
    const { sessions, state, accepted } = world()
    state.answer = new Error('down')
    expect(await sessions.wake(TENANT, wake())).toBe('unknown')
    state.answer = 'unknown'
    expect(await sessions.wake(TENANT, wake())).toBe('unknown')
    expect(await sessions.wake('not-a-tenant', wake())).toBe('refused')
    expect(accepted).toHaveLength(2)
  })
})

describe('what the reminders say', () => {
  it('each says what stopping means under a goal, and carries the goal as rendered', () => {
    for (const text of [startText('BODY'), resumeText('BODY')]) {
      expect(text).toContain('Each time you are about to stop')
      expect(text.endsWith('BODY')).toBe(true)
    }
    expect(startText('BODY')).not.toBe(resumeText('BODY'))
  })
  it('the one of an implied goal speaks of the input, not of a goal: there is none to show or to track', async () => {
    const { sessions, accepted } = world()
    const wake = {
      kind: 'continue',
      request: 'implied/continue/1/1/1',
      session: SESSION,
      rendered: '## 目的\n写说明',
      open: '- [A1] 这段输入要的事做完了：证据显示没做到（判定）',
    } as const
    await sessions.wake(TENANT, { ...wake, implied: true })
    await sessions.wake(TENANT, { ...wake, request: 'continue/1/1/1', implied: false })
    const [implied, own] = accepted.map(input => JSON.stringify(input.value.message))
    expect(implied).toContain('what the input that opened this run asked for')
    expect(implied).toContain('[A1] 这段输入要的事做完了')
    expect(implied).not.toMatch(/goal|track/u)
    expect(own).toContain('the goal of this session is not met yet')
  })
})

describe('the tool calls an agent cites', () => {
  it('are the ones a tool result of the session answers after the goal was set', async () => {
    const { cited, state, asked, read } = world()
    state.pages = [page([result('call-1'), result('call-2')], null)]
    expect(await cited(TENANT, SESSION, ['call-2', 'call-9'], '41')).toEqual({
      kind: 'read',
      value: ['call-2'],
    })
    expect(asked).toEqual([{ after: '41', cursor: null }])
    expect(read).toEqual([{ tenant: LEGAL_TENANT, session: SESSION }])
  })
  it('reads on page by page until every one is found or the history ends', async () => {
    const { cited, state, asked } = world()
    state.pages = [page([result('call-1')], 'p2'), page([result('call-2')], 'p3'), page([], null)]
    expect(await cited(TENANT, SESSION, ['call-1', 'call-2'], '7')).toEqual({
      kind: 'read',
      value: ['call-1', 'call-2'],
    })
    expect(asked).toEqual([
      { after: '7', cursor: null },
      { after: '7', cursor: 'p2' },
    ])
    const again = world()
    again.state.pages = [page([result('call-1')], 'p2'), page([], null)]
    expect(await again.cited(TENANT, SESSION, ['call-1', 'call-2'], '7')).toEqual({
      kind: 'read',
      value: ['call-1'],
    })
  })
  it('a goal set before the session had any entry is checked from the beginning of its history', async () => {
    const { cited, state, asked } = world()
    state.pages = [page([result('call-1')], null)]
    expect(await cited(TENANT, SESSION, ['call-1'], '0')).toEqual({
      kind: 'read',
      value: ['call-1'],
    })
    expect(asked).toEqual([{ after: null, cursor: null }])
  })
  it('asks nothing when nothing is cited, and finds nothing for a text that names no tenant', async () => {
    const { cited, asked } = world()
    expect(await cited(TENANT, SESSION, [], '41')).toEqual({ kind: 'read', value: [] })
    expect(await cited('not-a-tenant', SESSION, ['call-1'], '41')).toEqual({
      kind: 'read',
      value: [],
    })
    expect(asked).toEqual([])
  })
  it('a page that cannot be read, or a history longer than it reads, is no basis: never a missing call', async () => {
    const broken = world()
    broken.state.pages = [page([result('call-1')], 'p2'), { kind: 'unavailable' }]
    expect(await broken.cited(TENANT, SESSION, ['call-1', 'call-2'], '41')).toEqual({
      kind: 'unavailable',
    })
    const thrown = world()
    thrown.breakHistory()
    expect(await thrown.cited(TENANT, SESSION, ['call-1'], '41')).toEqual({ kind: 'unavailable' })
    const endless = world()
    endless.state.pages = Array.from({ length: CITED_PAGE_LIMIT + 1 }, () => page([], 'more'))
    expect(await endless.cited(TENANT, SESSION, ['call-1'], '41')).toEqual({ kind: 'unavailable' })
    expect(endless.asked).toHaveLength(CITED_PAGE_LIMIT)
  })
  it('only a tool result names a call: other blocks and other shapes name none', () => {
    const odd = [
      { payload: { message: { blocks: [{ kind: 'tool_call', callId: 'call-1' }] } } },
      { payload: { message: { blocks: [{ kind: 'tool_result', callId: 5 }] } } },
      { payload: {} },
      null,
      result('call-3'),
    ]
    expect(answeredCalls(odd)).toEqual(['call-3'])
  })
})
