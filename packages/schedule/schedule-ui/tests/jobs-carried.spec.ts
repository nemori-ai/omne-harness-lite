import { describe, expect, it } from 'vitest'
import { carriedText } from '../src/model/jobs.ts'

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
    'reads the end %s of the goal in words, after the definition adopted and before what was delivered',
    (outcome, words) => {
      const account = {
        definition: { name: 'coding', version: 'v7' },
        outcome,
        deliverables: ['report.md', 'notes.md'],
        since: 'e-1',
        run: 'run-1',
      }
      expect(carriedText({ kind: 'session', session: 's-9', account })).toBe(
        `会话 s-9；定义 coding（v7）；${words}；交付物：report.md、notes.md`,
      )
    },
  )

  it('leaves out what is not there: no definition read, a goal still going, nothing delivered', () => {
    const account = { definition: null, outcome: null, deliverables: [], since: null, run: null }
    expect(carriedText({ kind: 'session', session: 's-9', account })).toBe('会话 s-9')
  })
})
