import { describe, expect, it } from 'vitest'
import { carriedText, requirementText } from '../src/model/jobs.ts'

describe('where a Job is carried out, in one line', () => {
  it('says nothing carries it yet, or names the run of the program', () => {
    expect(carriedText(null)).toBe('还没有承接')
    expect(carriedText({ kind: 'program', program: 'probe', execution: 'program:g:j' })).toBe(
      '程序 probe（执行 program:g:j）',
    )
  })

  it('names the session alone while what it left cannot be read', () => {
    expect(carriedText({ kind: 'session', session: 's-9', account: null })).toBe('会话 s-9')
  })

  it.each([
    ['achieved', '目标达成'],
    ['exit:X2', '目标照退出 X2 收场'],
    ['unattainable', '目标无法达成'],
    ['stalled', '目标停滞'],
    ['judge-unavailable', '目标判定不可用'],
    ['aborted', '目标执行中止'],
    ['cancelled', '目标被取消'],
  ])(
    'reads the end %s of the goal in words, after the definition adopted; what was delivered is not said here',
    (outcome, words) => {
      const account = {
        definition: { name: 'coding', version: 'v7' },
        outcome,
        deliverables: ['report.md', 'notes.md'],
        since: 'e-1',
        run: 'run-1',
      }
      expect(carriedText({ kind: 'session', session: 's-9', account })).toBe(
        `会话 s-9；定义 coding（v7）；${words}`,
      )
    },
  )

  it('leaves out what is not there: no definition read, a goal still going, nothing delivered', () => {
    const account = { definition: null, outcome: null, deliverables: [], since: null, run: null }
    expect(carriedText({ kind: 'session', session: 's-9', account })).toBe('会话 s-9')
  })
})

/** A JSON value as the protocol client decodes it. */
function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  const entries = Object.entries(value as object).map(([key, inner]) => ({
    key,
    value: tree(inner),
  }))
  return { kind: 'object', entries }
}

describe('what a Job was asked to do, in one line', () => {
  it('names the program and its input as written, an empty input when none was given', () => {
    const work = { kind: 'program', programRef: 'probe', input: { n: 2, on: true, tags: ['a'] } }
    expect(requirementText(tree(work))).toBe('程序 probe，输入 {"n":2,"on":true,"tags":["a"]}')
    expect(requirementText(tree({ kind: 'program', programRef: 'probe' }))).toBe(
      '程序 probe，输入 {}',
    )
    expect(requirementText(tree({ kind: 'program' }))).toBe('程序 ，输入 {}')
  })

  it('says the purpose of agent work, and nothing when the work carries none', () => {
    const work = { kind: 'agent', instruction: { purpose: '写月报', criteria: [] } }
    expect(requirementText(tree(work))).toBe('写月报')
    expect(requirementText(tree({ kind: 'agent' }))).toBe('')
    expect(requirementText(tree({ kind: 'agent', instruction: {} }))).toBe('')
  })

  it('says so when the work is neither', () => {
    expect(requirementText(tree({ kind: 'reminder' }))).toBe('没有可读的要求')
    expect(requirementText(tree(null))).toBe('没有可读的要求')
  })
})
