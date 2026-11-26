import { describe, expect, it } from 'vitest'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { expectRoundTrip, GOAL, rejected, SETTLED, where } from './fixtures/samples.ts'

const table = {
  'read-goal': { identity: 'login', effect: 'read', limit: 'small' },
  'write-goal': { identity: 'login', effect: 'commit', limit: 'input' },
  'query-write-goal': { identity: 'login', effect: 'read', limit: 'input' },
  'command-goal': { identity: 'login', effect: 'commit', limit: 'small' },
  'read-judge': { identity: 'login', effect: 'read', limit: 'small' },
  'choose-judge': { identity: 'login', effect: 'commit', limit: 'small' },
} as const
const outcomes = {
  'read-goal': ['not-found'],
  'write-goal': ['invalid', 'conflict', 'not-found', 'unknown'],
  'query-write-goal': ['not-committed', 'not-found'],
  'command-goal': ['conflict', 'not-found', 'unknown'],
  'read-judge': ['not-found'],
  'choose-judge': ['invalid', 'not-found', 'unknown'],
} as const
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied']
const operations = goalProtocol.operations
const revise = {
  ...where,
  operation: 'op-2',
  proposal: { kind: 'revise', changes: [{ op: 'purpose', text: '只降首页' }] },
  words: null,
}

describe('goal/v1', () => {
  it('is goal major 1 with exactly six operations and one observation', () => {
    expect([goalProtocol.name, goalProtocol.major]).toEqual(['goal', 1])
    expect(Object.keys(operations).sort()).toEqual(Object.keys(table).sort())
    expect(Object.keys(goalProtocol.observations)).toEqual(['observe-goal'])
  })

  it.each(Object.entries(table))('%s has its identity, effect and limit', (name, row) => {
    const { identity, effect, limit } = operations[name as keyof typeof table]
    expect({ identity, effect, limit }).toEqual(row)
  })

  it.each(Object.entries(outcomes))('%s answers exactly its outcomes', (name, own) => {
    const operation = operations[name as keyof typeof outcomes]
    expect(Object.keys(operation.outcomes).sort()).toEqual([...always, ...own].sort())
  })

  it('a goal is read whole, in every state, and a session without one reads as none', () => {
    const { body, outcomes: answers } = operations['read-goal']
    expectRoundTrip(body, where)
    rejected(body, { tenant: where.tenant })
    rejected(body, { ...where, generation: 1 })
    expectRoundTrip(answers.succeeded, { goal: GOAL })
    expectRoundTrip(answers.succeeded, { goal: SETTLED })
    expectRoundTrip(answers.succeeded, { goal: null })
    expectRoundTrip(answers.succeeded, {
      goal: { ...GOAL, state: { ...GOAL.state, pause: { by: 'person' } } },
    })
    const [first, ...rest] = GOAL.gap
    const examined = {
      ...first,
      verification: 'examination',
      reader: 'examiner',
      value: 'gathering',
    }
    expectRoundTrip(answers.succeeded, {
      goal: { ...GOAL, gap: [examined, ...rest], examiner: 'e'.repeat(64) },
    })
    rejected(answers.succeeded, { goal: { ...GOAL, examiner: 'not a session' } })
    rejected(answers.succeeded, { goal: { ...GOAL, state: { ...GOAL.state, status: 'none' } } })
    rejected(answers.succeeded, { goal: { ...GOAL, wake: null } })
    rejected(answers.succeeded, { goal: { ...GOAL, rendered: '' } })
    rejected(answers.succeeded, {})
  })

  it('a write names its operation and carries a whole draft or a set of changes; its query takes the same body', () => {
    const set = { ...revise, proposal: { kind: 'set', draft: { purpose: '降首页' } }, words: '' }
    for (const name of ['write-goal', 'query-write-goal'] as const) {
      const { body } = operations[name]
      expectRoundTrip(body, revise)
      expectRoundTrip(body, set)
      rejected(body, { ...revise, operation: '' })
      rejected(body, { ...revise, proposal: { kind: 'confirm', card: 'c' } })
      rejected(body, { ...revise, proposal: { kind: 'set', changes: [] } })
      const { words: _words, ...wordless } = revise
      rejected(body, wordless)
    }
  })

  it('a write answers the goal as written, what is wrong with a body by entry and field, or why the state does not take it', () => {
    const answers = operations['write-goal'].outcomes
    expectRoundTrip(answers.succeeded, { goal: GOAL })
    rejected(answers.succeeded, { goal: null })
    const issues = [
      { entry: 'A1', field: 'statement', problem: 'empty' },
      { entry: null, field: 'purpose', problem: 'too long' },
    ]
    expectRoundTrip(answers.invalid, { issues })
    rejected(answers.invalid, { issues: [{ entry: 'A1', field: 'statement' }] })
    for (const reason of ['goal-in-progress', 'nobody-attends', 'no-live-goal', 'another-goal'])
      expectRoundTrip(answers.conflict, { reason })
    rejected(answers.conflict, { reason: 'denied' })
    expectRoundTrip(answers['not-found'], {})
  })

  it('the query of a write answers the goal that write left, or that it was never committed', () => {
    const answers = operations['query-write-goal'].outcomes
    expectRoundTrip(answers.succeeded, { goal: GOAL })
    expectRoundTrip(answers['not-committed'], {})
    rejected(answers['not-committed'], { goal: GOAL })
  })

  it('the decision model a session chose is read with the models it may choose from, and chosen by name or taken away with null', () => {
    const read = operations['read-judge']
    expectRoundTrip(read.body, where)
    expectRoundTrip(read.outcomes.succeeded, { model: null, models: ['a/one', 'b/two'] })
    expectRoundTrip(read.outcomes.succeeded, { model: 'b/two', models: ['a/one', 'b/two'] })
    rejected(read.outcomes.succeeded, { model: 'b/two' })
    const choose = operations['choose-judge']
    expectRoundTrip(choose.body, { ...where, model: 'b/two' })
    expectRoundTrip(choose.body, { ...where, model: null })
    rejected(choose.body, where)
    rejected(choose.body, { ...where, model: 3 })
    expectRoundTrip(choose.outcomes.succeeded, { model: null })
    const issue = { entry: null, field: 'model', problem: 'choose one of a/one, b/two' }
    expectRoundTrip(choose.outcomes.invalid, { issues: [issue] })
  })

  it('a command names the goal it is given for: pause, resume, cancel, or settle by one exit', () => {
    const { body, outcomes: answers } = operations['command-goal']
    for (const kind of ['pause', 'resume', 'cancel'])
      expectRoundTrip(body, { ...where, generation: 2, command: { kind } })
    expectRoundTrip(body, {
      ...where,
      generation: 2,
      command: { kind: 'settle-by-exit', exit: 'X2' },
    })
    rejected(body, { ...where, command: { kind: 'pause' } })
    rejected(body, { ...where, generation: 0, command: { kind: 'pause' } })
    rejected(body, { ...where, generation: 2, command: { kind: 'abort' } })
    rejected(body, { ...where, generation: 2, command: { kind: 'settle-by-exit' } })
    rejected(body, { ...where, generation: 2, command: { kind: 'pause', exit: 'X2' } })
    expectRoundTrip(answers.succeeded, { goal: SETTLED })
    expectRoundTrip(answers.succeeded, { goal: null })
    expectRoundTrip(answers.conflict, { reason: 'not-its-cause' })
  })

  it('observe-goal opens on one session and its frame says only that the goal changed', () => {
    const observation = goalProtocol.observations['observe-goal']
    expect([observation.identity, observation.ends]).toEqual(['login', []])
    expectRoundTrip(observation.open, where)
    rejected(observation.open, { tenant: where.tenant })
    expectRoundTrip(observation.frame, { kind: 'changed' })
    rejected(observation.frame, { kind: 'changed', goal: GOAL })
    rejected(observation.frame, { kind: 'settled' })
  })
})
