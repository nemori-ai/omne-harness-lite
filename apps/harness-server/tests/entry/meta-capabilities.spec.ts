import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import {
  declaresConditions,
  heldConditions,
  judgeCallConditions,
  type SessionCommandReads,
  type SessionFacts,
} from '../../src/entry/meta-capabilities.ts'

const access = { principal: 'p', tenant: 't', session: 's' } as never

// `look` needs nothing; the others each need one of the three names, and `odd` a name nobody knows.
const tool = {
  kind: 'commands',
  name: 'Fixture',
  commands: [
    { name: 'look' },
    { name: 'ask', conditions: ['person-answers'] },
    { name: 'tell', conditions: ['person-present'] },
    { name: 'report', conditions: ['dispatched'] },
    { name: 'odd', conditions: ['never-heard-of'] },
  ],
} as unknown as ToolDefinition

const ATTENDED: SessionFacts = { attendance: 'attended', humanInteraction: true, child: false }
const QUIET: SessionFacts = { attendance: 'attended', humanInteraction: false, child: false }
const CHILD: SessionFacts = { attendance: 'unattended', humanInteraction: false, child: true }

function reads(facts: SessionFacts | 'unreadable') {
  const asked: unknown[] = []
  const read: SessionCommandReads = {
    interaction: async given => {
      asked.push(given)
      return facts === 'unreadable' ? fail('the session is gone') : succeed(facts)
    },
  }
  return { read, asked }
}

const verdict = async (facts: SessionFacts, command: string) =>
  (await judgeCallConditions(reads(facts).read, access, tool, command)).kind

describe('the facts a session publishes, under the names a command may declare', () => {
  it.each([
    [ATTENDED, ['person-present', 'person-answers']],
    [QUIET, ['person-present']],
    [CHILD, ['dispatched']],
  ])('holds for %o exactly %j', (facts, names) => {
    expect([...heldConditions(facts)].sort()).toEqual([...names].sort())
  })

  it('tells a tool that declares a condition from one that declares none', () => {
    expect(declaresConditions(tool)).toBe(true)
    const plain = { kind: 'commands', name: 'Plain', commands: [{ name: 'look' }] }
    expect(declaresConditions(plain as unknown as ToolDefinition)).toBe(false)
    const fn = { kind: 'function', name: 'Fn' } as unknown as ToolDefinition
    expect(declaresConditions(fn)).toBe(false)
    expect(declaresConditions({ ...fn, conditions: ['dispatched'] } as ToolDefinition)).toBe(true)
  })
})

describe('a call is judged by the conditions its command declares', () => {
  it('is open without reading the session when the command declares none', async () => {
    const { read, asked } = reads(CHILD)
    expect(await judgeCallConditions(read, access, tool, 'look')).toEqual({ kind: 'open' })
    expect(await judgeCallConditions(read, access, tool, null)).toEqual({ kind: 'open' })
    expect(asked).toEqual([])
  })

  // Rows: the session. Columns: ask, tell, report, odd.
  it.each([
    [ATTENDED, ['open', 'open', 'closed', 'closed']],
    [QUIET, ['closed', 'open', 'closed', 'closed']],
    [CHILD, ['closed', 'closed', 'open', 'closed']],
  ] as const)('in %o the commands are %j', async (facts, expected) => {
    const answered = await Promise.all(
      ['ask', 'tell', 'report', 'odd'].map(command => verdict(facts, command)),
    )
    expect(answered).toEqual(expected)
  })

  it('reads the session of the call, and answers a closed command with its name and the reason', async () => {
    const { read, asked } = reads(CHILD)
    expect(await judgeCallConditions(read, access, tool, 'ask')).toEqual({
      kind: 'closed',
      answer:
        'Fixture: the command "ask" is not available here: no person can be asked for an answer in this session now. Continue without it, or stop and report what you need.',
    })
    expect(asked).toEqual([access])
    expect(await judgeCallConditions(read, access, tool, 'tell')).toMatchObject({
      answer: expect.stringContaining('no person attends this session'),
    })
    expect(await judgeCallConditions(reads(ATTENDED).read, access, tool, 'report')).toMatchObject({
      answer: expect.stringContaining('this session was not dispatched by another agent'),
    })
    expect(await judgeCallConditions(read, access, tool, 'odd')).toMatchObject({
      answer: expect.stringContaining('"never-heard-of" does not hold here'),
    })
  })

  it('answers unreadable when the session cannot be read', async () => {
    const { read } = reads('unreadable')
    expect(await judgeCallConditions(read, access, tool, 'ask')).toEqual({
      kind: 'unreadable',
      diagnostic: 'the standing of the session is unreadable: the session is gone',
    })
  })
})
