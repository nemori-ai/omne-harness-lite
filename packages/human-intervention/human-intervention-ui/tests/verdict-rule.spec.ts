import { describe, expect, it } from 'vitest'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import { lengthOf, verdictOf } from '../src/model/verdict.ts'
import { extensionItem, questionItem, releaseItem } from './fixtures/cards.ts'

type Options = Extract<
  HumanInterventionCardItem['card']['question'],
  { kind: 'question' | 'extension' }
>['options']

function asking(options: Options, base = questionItem()): HumanInterventionCardItem {
  const question = base.card.question
  if (question.kind === 'release') throw new Error('a question fixture')
  return { ...base, card: { ...base.card, question: { ...question, options } } }
}

const option = (id: string, label: string, description = '') => ({ id, label, description })

const ids = (items: readonly HumanInterventionCardItem[]) =>
  verdictOf(items)?.map(each => each.id) ?? null

describe('定夺规则：只看卡的数据', () => {
  it('a paper of one section with one to three short options answers with them as buttons, in the asker’s order', () => {
    expect(ids([questionItem()])).toEqual(['main', 'next'])
    expect(ids([asking([option('a', '是')])])).toEqual(['a'])
    expect(ids([asking([option('a', '一'), option('b', '二'), option('c', '三')])])).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('more than one section, more than three options, or none at all: rows under one 提交', () => {
    expect(ids([questionItem('a'), questionItem('b')])).toBeNull()
    expect(
      ids([asking([option('a', '一'), option('b', '二'), option('c', '三'), option('d', '四')])]),
    ).toBeNull()
    expect(ids([asking([], extensionItem())])).toBeNull()
  })

  it('a release card shows its one-time options outside its folds; those are the buttons, the lasting ones are not counted', () => {
    expect(ids([releaseItem()])).toEqual(['deny-once', 'allow-once'])
    expect(verdictOf([releaseItem()])?.map(each => [each.offered, each.role])).toEqual([
      [true, 'reject'],
      [false, 'approve'],
    ])
  })

  it('a label over 8 字 or a description over 16 字 makes rows', () => {
    expect(ids([asking([option('a', '八个字的一个标签')])])).toEqual(['a'])
    expect(ids([asking([option('a', '九个字的一个长标签')])])).toBeNull()
    expect(ids([asking([option('a', '是', '十六个字的说明写到这里正好是一行')])])).toEqual(['a'])
    expect(ids([asking([option('a', '是', '十七个字的说明写到这里就多出了一个')])])).toBeNull()
  })

  it('counts a full-width character as one 字 and a half-width one as half of one', () => {
    expect(lengthOf('本次放行')).toBe(4)
    expect(lengthOf('8081（推荐）')).toBe(6)
    expect(lengthOf('只执行这一次调用，参数不变')).toBe(13)
    expect(lengthOf('Allow once')).toBe(5)
    expect(ids([asking([option('a', 'Allow this once')])])).toEqual(['a'])
    expect(ids([asking([option('a', 'Allow this call once')])])).toBeNull()
  })
})
