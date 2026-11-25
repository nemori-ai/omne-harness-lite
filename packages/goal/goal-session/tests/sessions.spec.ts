import { describe, expect, it } from 'vitest'
import { goalInputSources, GOAL_SOURCES, resumeText, startText } from '../src/index.ts'
import { failure, LEGAL_TENANT, SESSION, TENANT, work, world } from './world.ts'

const wake = (change: object = {}) =>
  ({
    kind: 'start',
    request: 'start/1/1',
    session: SESSION,
    rendered: '## 目的\n做完',
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

describe('the facts of a session a goal stands on', () => {
  it('whether somebody attends it is what the session itself says; a session that never said is attended', async () => {
    const { sessions, state } = world()
    expect(await sessions.facts(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: { attendance: 'attended' },
    })
    state.work = { kind: 'read', value: work({ attendance: 'unattended' }) }
    expect(await sessions.facts(TENANT, SESSION)).toEqual({
      kind: 'read',
      value: { attendance: 'unattended' },
    })
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
})
