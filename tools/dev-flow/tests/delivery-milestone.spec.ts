import { describe, expect, it } from 'vitest'
import type { GhCommand } from '../src/delivery/github-read.ts'
import {
  carryComment,
  carryMilestone,
  createMilestone,
  isCarryComment,
} from '../src/delivery/milestone.ts'

type State = {
  milestones: { number: number; title: string; state: string; due_on: string | null }[]
  issues: Record<number, { milestone: number | null; comments: string[] }>
}
/** A GitHub stand-in over milestones, Issue milestones and comments that records every call. */
function github(state: State, fail?: (argv: readonly string[]) => boolean) {
  const calls: string[][] = []
  const value = (argv: readonly string[], key: string) =>
    argv.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1)
  const issue = (number: number) => {
    const entry = state.issues[number]
    if (entry === undefined) throw new Error(`no Issue ${number}`)
    const milestone = state.milestones.find(item => item.number === entry.milestone)
    return {
      number,
      node_id: `I_${number}`,
      html_url: `https://github.com/owner/repo/issues/${number}`,
      body: '',
      labels: [],
      milestone: milestone === undefined ? null : { title: milestone.title },
    }
  }
  const call: GhCommand = argv => {
    calls.push([...argv])
    if (fail?.(argv) === true) throw new Error('secret API body')
    const method = argv[2],
      path = argv.find(arg => arg.startsWith('repos/')) ?? ''
    const [route = '', query = ''] = path.split('?')
    const page = Number(new URLSearchParams(query).get('page') ?? '1')
    const parts = route.split('/')
    if (method === 'GET' && route === 'repos/owner/repo/milestones')
      return page === 1 ? state.milestones : []
    if (method === 'POST' && route === 'repos/owner/repo/milestones') {
      const created = {
        number: state.milestones.length + 1,
        title: value(argv, 'title') ?? '',
        state: value(argv, 'state') ?? '',
        due_on: value(argv, 'due_on') ?? null,
      }
      state.milestones.push(created)
      return created
    }
    const number = Number(parts[4])
    if (parts.length === 5 && method === 'GET') return issue(number)
    if (parts.length === 5 && method === 'PATCH') {
      const entry = state.issues[number]
      if (entry !== undefined) entry.milestone = Number(value(argv, 'milestone'))
      return issue(number)
    }
    if (parts[5] === 'comments' && method === 'GET')
      return page === 1 ? (state.issues[number]?.comments ?? []).map(body => ({ body })) : []
    if (parts[5] === 'comments' && method === 'POST') {
      state.issues[number]?.comments.push(value(argv, 'body') ?? '')
      return {}
    }
    throw new Error(`unexpected call ${argv.join(' ')}`)
  }
  return { call, calls, writes: () => calls.filter(argv => argv[2] !== 'GET').map(argv => argv[2]) }
}
const milestones = () => [
  { number: 1, title: 'M1', state: 'open', due_on: null },
  { number: 2, title: 'M1.5', state: 'open', due_on: '2026-11-10T07:00:00Z' },
  { number: 3, title: 'M2', state: 'open', due_on: null },
]

describe('milestone create', () => {
  it('creates the milestone due at noon UTC and verifies the date', () => {
    const state: State = { milestones: milestones(), issues: {} },
      gh = github(state)
    const result = createMilestone({
      repository: 'owner/repo',
      title: 'M3',
      due: '2026-12-01',
      description: '第三个里程碑',
      call: gh.call,
    })
    expect(result).toEqual({
      milestone: { number: 4, title: 'M3', state: 'open', dueOn: '2026-12-01T12:00:00Z' },
      created: true,
      verified: true,
    })
    expect(gh.calls.at(-1)).toEqual([
      'api',
      '--method',
      'POST',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
      'repos/owner/repo/milestones',
      '-f',
      'title=M3',
      '-f',
      'state=open',
      '-f',
      'due_on=2026-12-01T12:00:00Z',
      '-f',
      'description=第三个里程碑',
    ])
  })

  it('returns an existing milestone with the same due date without writing', () => {
    const gh = github({ milestones: milestones(), issues: {} })
    expect(
      createMilestone({
        repository: 'owner/repo',
        title: 'M1.5',
        due: '2026-11-10',
        call: gh.call,
      }),
    ).toMatchObject({ created: false, milestone: { number: 2 } })
    expect(gh.writes()).toEqual([])
  })

  it('refuses another due date, a bad date and a multi-line title without writing', () => {
    const gh = github({ milestones: milestones(), issues: {} })
    expect(() =>
      createMilestone({
        repository: 'owner/repo',
        title: 'M1.5',
        due: '2026-11-11',
        call: gh.call,
      }),
    ).toThrow('does not change it')
    expect(() =>
      createMilestone({ repository: 'owner/repo', title: 'M4', due: '2026-02-30', call: gh.call }),
    ).toThrow('calendar date')
    expect(() =>
      createMilestone({
        repository: 'owner/repo',
        title: 'M\n4',
        due: '2026-02-01',
        call: gh.call,
      }),
    ).toThrow('one-line')
    expect(gh.writes()).toEqual([])
  })
})

describe('milestone carry', () => {
  const state = (): State => ({
    milestones: milestones(),
    issues: { 7: { milestone: 1, comments: [] }, 8: { milestone: 1, comments: [] } },
  })
  const carry = (gh: ReturnType<typeof github>, issues = [7, 8]) =>
    carryMilestone({
      repository: 'owner/repo',
      from: 'M1',
      to: 'M1.5',
      issues,
      reason: '契约先对齐',
      call: gh.call,
    })

  it('moves each card, posts one carry comment and reads the milestone back', () => {
    const s = state(),
      gh = github(s)
    expect(carry(gh)).toEqual([
      {
        issue: 'https://github.com/owner/repo/issues/7',
        moved: true,
        commented: true,
        readback: 'M1.5',
        verified: true,
      },
      {
        issue: 'https://github.com/owner/repo/issues/8',
        moved: true,
        commented: true,
        readback: 'M1.5',
        verified: true,
      },
    ])
    expect(gh.writes()).toEqual(['PATCH', 'POST', 'PATCH', 'POST'])
    expect(gh.calls.find(argv => argv[2] === 'PATCH')?.slice(-2)).toEqual(['-F', 'milestone=2'])
    expect(s.issues[7]?.comments).toEqual([carryComment('M1', 'M1.5', '契约先对齐')])
  })

  it('finishes a partial run without repeating writes', () => {
    const s = state()
    s.issues[7] = { milestone: 2, comments: [carryComment('M1', 'M1.5', '旧原因')] }
    s.issues[8] = { milestone: 2, comments: [] }
    const gh = github(s)
    expect(carry(gh).map(card => [card.moved, card.commented])).toEqual([
      [false, false],
      [false, true],
    ])
    expect(gh.writes()).toEqual(['POST'])
    // Card 8 was already in M1.5, so its comment does not claim a move.
    expect(s.issues[8]?.comments).toEqual([carryComment('M1', 'M1.5', '契约先对齐', false)])
    expect(s.issues[8]?.comments[0]).toContain('本卡已在 `M1.5`，本次运行未移动')
  })

  it('checks every card before the first write', () => {
    const s = state()
    s.issues[8] = { milestone: 3, comments: [] }
    const gh = github(s)
    expect(() => carry(gh)).toThrow('#8 is in milestone M2, not M1 or M1.5')
    expect(gh.writes()).toEqual([])
  })

  it('refuses a missing target milestone, a repeated card and a multi-line reason', () => {
    const gh = github(state())
    expect(() =>
      carryMilestone({
        repository: 'owner/repo',
        from: 'M1',
        to: 'M9',
        issues: [7],
        reason: 'r',
        call: gh.call,
      }),
    ).toThrow('M9 does not exist')
    expect(() => carry(gh, [7, 7])).toThrow('named twice')
    expect(() =>
      carryMilestone({
        repository: 'owner/repo',
        from: 'M1',
        to: 'M2',
        issues: [7],
        reason: 'a\nb',
        call: gh.call,
      }),
    ).toThrow('one nonempty line')
    expect(gh.writes()).toEqual([])
  })

  it('names a failed write and keeps API output out of the message', () => {
    const gh = github(state(), argv => argv[2] === 'POST')
    expect(() => carry(gh)).toThrow(/^Carry write 2 of 4 failed\. Earlier writes stay applied/)
  })

  it('recognizes only a carry comment for the same two milestones', () => {
    const body = carryComment('M1', 'M1.5', 'r')
    expect(isCarryComment(body, 'M1', 'M1.5')).toBe(true)
    expect(isCarryComment(body, 'M1', 'M2')).toBe(false)
    expect(isCarryComment('里程碑流转：`M1` → `M1.5`', 'M1', 'M1.5')).toBe(false)
    expect(isCarryComment(`说明\n\n${body}`, 'M1', 'M1.5')).toBe(false)
  })
})
