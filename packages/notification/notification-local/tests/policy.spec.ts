import { describe, expect, it, vi } from 'vitest'
import { fakeClock } from '@omne-harness/notification/testing'
import { tenantIdSchema, type Instant } from '@omne-harness/notification-contract'
import { createWakeUps, realTimers } from '../src/hints.ts'
import { NotificationPolicyError, parsePolicy } from '../src/policy.ts'
import { AGENT_POSTS, NOTIFICATION_SYSTEM } from '../src/sources.ts'
import { manualTimers, policy } from './fixture.ts'

type Policy = ReturnType<typeof policy>
const withBeat = (beat: Partial<Policy['beat']>) => policy({ beat: { ...policy().beat, ...beat } })
const withRetry = (retry: Partial<Policy['retry']>) =>
  policy({ retry: { ...policy().retry, ...retry } })
const withPerson = (person: object) =>
  policy({
    recipients: { agent: null, person: { ...policy().recipients.person, ...person } as never },
  })

describe('the policy the provider loads', () => {
  it('takes a whole policy as it is', () => {
    expect(parsePolicy(policy())).toEqual(policy())
  })

  /** Each value at the edge it still takes, and one step past it. */
  it.each([
    ['bodyLength', policy({ bodyLength: 1 }), policy({ bodyLength: 0 })],
    ['bodyLength', policy({ bodyLength: 65_536 }), policy({ bodyLength: 65_537 })],
    ['causalDepth', policy({ causalDepth: 0 }), policy({ causalDepth: -1 })],
    ['causalDepth', policy({ causalDepth: 64 }), policy({ causalDepth: 65 })],
    ['pageLimit', policy({ pageLimit: 1 }), policy({ pageLimit: 0 })],
    ['pageLimit', policy({ pageLimit: 500 }), policy({ pageLimit: 501 })],
    ['listLimit', policy({ listLimit: 1 }), policy({ listLimit: 0 })],
    ['listLimit', policy({ listLimit: 50 }), policy({ listLimit: 51 })],
    ['retry.maxAttempts', withRetry({ maxAttempts: 1 }), withRetry({ maxAttempts: 0 })],
    ['retry.maxAttempts', withRetry({ maxAttempts: 20 }), withRetry({ maxAttempts: 21 })],
    ['retry.backoffMs', withRetry({ backoffMs: [0] }), withRetry({ backoffMs: [-1] })],
    [
      'retry.backoffMs',
      withRetry({ backoffMs: Array(20).fill(1) }),
      withRetry({ backoffMs: Array(21).fill(1) }),
    ],
    ['deliverTimeoutMs', policy({ deliverTimeoutMs: 1 }), policy({ deliverTimeoutMs: 0 })],
    [
      'deliverTimeoutMs',
      policy({ deliverTimeoutMs: 600_000 }),
      policy({ deliverTimeoutMs: 600_001 }),
    ],
    ['scanIntervalMs', policy({ scanIntervalMs: 1000 }), policy({ scanIntervalMs: 999 })],
    ['beat.minMinutes', withBeat({ minMinutes: 1 }), withBeat({ minMinutes: 0 })],
    [
      'beat.maxMinutes',
      withBeat({ minMinutes: 1, maxMinutes: 30, defaultMinutes: 30 }),
      withBeat({ maxMinutes: 0 }),
    ],
    [
      'beat.defaultMinutes',
      withBeat({ minMinutes: 1, defaultMinutes: 1 }),
      withBeat({ minMinutes: 1, defaultMinutes: 0 }),
    ],
    [
      'recipients.person.minLevel',
      withPerson({ minLevel: 'strong' }),
      withPerson({ minLevel: 'off' }),
    ],
    [
      'recipients.person.channel',
      withPerson({ channel: 'mail' }),
      withPerson({ channel: 'Mail!' }),
    ],
  ])('%s: takes the edge and refuses one step past it', (path, edge, past) => {
    expect(parsePolicy(edge)).toEqual(edge)
    expect(() => parsePolicy(past)).toThrow(new RegExp(`${path.replace(/\./g, '\\.')}`))
  })

  it('refuses a value that is not a whole number, a missing value, and a value it does not know', () => {
    expect(() => parsePolicy(policy({ pageLimit: 1.5 }))).toThrow(/pageLimit/)
    const { listLimit: _, ...without } = policy()
    expect(() => parsePolicy(without)).toThrow(/listLimit/)
    expect(() => parsePolicy({ ...policy(), extra: 1 })).toThrow(NotificationPolicyError)
    expect(() => parsePolicy(withPerson({ extra: 1 }))).toThrow(/recipients\.person/)
    expect(() => parsePolicy(withRetry({ extra: 1 } as never))).toThrow(/retry/)
    expect(() => parsePolicy(withBeat({ extra: 1 } as never))).toThrow(/beat/)
    expect(() => parsePolicy(undefined)).toThrow(NotificationPolicyError)
  })

  it('takes a deployment without a default beat, and one whose agents start with a destination', () => {
    expect(parsePolicy(withBeat({ defaultMinutes: null })).beat.defaultMinutes).toBeNull()
    const agents = policy({
      recipients: {
        ...policy().recipients,
        agent: { channel: 'session' as never, minLevel: 'strong' },
      },
    })
    expect(parsePolicy(agents).recipients.agent).toEqual({ channel: 'session', minLevel: 'strong' })
  })

  it('refuses an empty beat range and a default beat outside the range, at either end', () => {
    expect(() =>
      parsePolicy(withBeat({ minMinutes: 60, maxMinutes: 59, defaultMinutes: null })),
    ).toThrow(/The beat range is empty/)
    expect(
      parsePolicy(withBeat({ minMinutes: 60, maxMinutes: 60, defaultMinutes: 60 })).beat,
    ).toEqual({
      minMinutes: 60,
      maxMinutes: 60,
      defaultMinutes: 60,
    })
    for (const defaultMinutes of [4, 1441])
      expect(() => parsePolicy(withBeat({ defaultMinutes }))).toThrow(
        /The default beat is outside the beat range/,
      )
    for (const defaultMinutes of [5, 1440])
      expect(parsePolicy(withBeat({ defaultMinutes })).beat.defaultMinutes).toBe(defaultMinutes)
  })

  it('names every problem with its path in one error', () => {
    const broken = {
      ...policy({ pageLimit: 0, listLimit: 0 }),
      retry: { maxAttempts: 0, backoffMs: [] },
    }
    let caught: unknown
    try {
      parsePolicy(broken)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(NotificationPolicyError)
    const { name, message } = caught as Error
    expect(name).toBe('NotificationPolicyError')
    expect(message).toMatch(
      /^The notification policy is missing or invalid: pageLimit: .+; listLimit: .+; retry\.maxAttempts: .+$/,
    )
  })
})

describe('the sources this group registers for itself', () => {
  it('what agents post: a one-off event about the agent that wrote it, weak for people, off for agents', () => {
    expect(AGENT_POSTS).toEqual({
      name: 'agent.posts',
      label: 'Agent 写的',
      types: [
        {
          name: 'post',
          label: 'Agent 写的一条',
          description:
            '一个 agent 整理好、写给人或别的 agent 看的一条内容。对象是写它的那个 agent。',
          kind: { kind: 'event' },
          subject: { presence: 'required', hint: '写这一条的 agent 的引用' },
          subscribable: ['person', 'agent'],
          nameable: ['person', 'agent'],
          defaults: { person: 'weak', agent: 'off' },
          external: false,
        },
      ],
    })
  })

  it('its own standing item: a blocked destination, for people only, that nobody can be named for', () => {
    expect(NOTIFICATION_SYSTEM).toEqual({
      name: 'notification.system',
      label: '通知',
      types: [
        {
          name: 'delivery-blocked',
          label: '投递受阻',
          description: '通知推不到某个投递去处。通知仍在收件箱里。',
          kind: { kind: 'standing', binding: 'notification.delivery-blocked' },
          subject: { presence: 'required', hint: '受阻的投递去处' },
          subscribable: ['person'],
          nameable: [],
          defaults: { person: 'weak', agent: 'off' },
          external: false,
        },
      ],
    })
  })
})

describe('wake-ups on the timers of the process', () => {
  const t1 = tenantIdSchema.parse('t1')
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 10, 18, 6, minute)).toISOString() as Instant

  it('wake after the delay, and not at all once cleared', () => {
    vi.useFakeTimers()
    try {
      const woken: string[] = []
      const first = realTimers.set(() => void woken.push('first'), 1000)
      realTimers.set(() => void woken.push('second'), 1000)
      realTimers.clear(first)
      vi.advanceTimersByTime(999)
      expect(woken).toEqual([])
      vi.advanceTimersByTime(1)
      expect(woken).toEqual(['second'])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keep the timer they have for the same instant, and replace it only for an earlier one', () => {
    const manual = manualTimers()
    const hints = createWakeUps(fakeClock('2026-11-18T06:00:00.000Z'), manual.timers, () => {})
    hints.wakeAt(t1, at(10))
    const [first] = [...manual.pending.keys()]
    hints.wakeAt(t1, at(10))
    expect([...manual.pending.keys()]).toEqual([first])
    hints.wakeAt(t1, at(9))
    expect([...manual.pending.keys()]).not.toContain(first)
    expect(manual.pending.size).toBe(1)
  })
})
