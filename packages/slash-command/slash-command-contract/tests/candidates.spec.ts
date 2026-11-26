import {
  acceptCandidate,
  argumentCompletion,
  assistOf,
  type Candidate,
  type Catalog,
  composing,
  createComposer,
  known,
  lookupOf,
  offeredTo,
  pressed,
  rankCandidates,
  start,
  typed,
} from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

const MODELS: readonly Candidate[] = [
  { value: 'z-ai/glm-5.3', current: true },
  { value: 'openai/gpt-6-astra', title: '还没有凭据' },
  { value: 'openai/gpt-6-sol' },
  { value: 'old/locked-one', unavailable: '被锁定' },
]
const CATALOG: Catalog = {
  entries: [
    {
      space: 'omne-official',
      name: 'model',
      kind: 'system',
      title: '换模型',
      params: [{ name: '模型名', candidates: true }],
    },
    {
      space: 'omne-official',
      name: 'pair',
      kind: 'system',
      title: '两个参数',
      params: [{ name: '甲', candidates: true }, { name: '乙' }],
    },
    {
      space: 'prompt',
      name: 'commit',
      kind: 'prompt',
      title: '写提交说明',
      params: [{ name: 'scope' }],
    },
  ],
  missing: [],
}
const LOOKUP = lookupOf(CATALOG)
const values = (offers: ReturnType<typeof rankCandidates>) =>
  offers.map(offer => offer.candidate.value)

describe('ranking the candidates of an argument', () => {
  it('uses the tiers of names with / as a separator too, then the title, keeping the owner order on ties', () => {
    expect(values(rankCandidates(MODELS, ''))).toEqual(MODELS.map(each => each.value))
    expect(values(rankCandidates(MODELS, 'astra'))).toEqual(['openai/gpt-6-astra'])
    expect(values(rankCandidates(MODELS, 'gpt'))).toEqual([
      'openai/gpt-6-astra',
      'openai/gpt-6-sol',
    ])
    expect(values(rankCandidates(MODELS, 'OPENAI/'))).toEqual([
      'openai/gpt-6-astra',
      'openai/gpt-6-sol',
    ])
    expect(values(rankCandidates(MODELS, '凭据'))).toEqual(['openai/gpt-6-astra'])
    expect(values(rankCandidates(MODELS, 'zzz'))).toEqual([])
  })
})

describe('the argument at the caret', () => {
  const offered = { command: 'omne-official:model', param: 0, candidates: MODELS }

  it('is found only where the command says the argument has candidates, with items once they are held', () => {
    expect(argumentCompletion('/model ast', 10, LOOKUP, offered)).toMatchObject({
      index: 0,
      query: 'ast',
      items: [{ candidate: { value: 'openai/gpt-6-astra' } }],
    })
    expect(argumentCompletion('/model ast', 10, LOOKUP, null)?.items).toBeNull()
    expect(argumentCompletion('/model ast', 10, LOOKUP, { ...offered, param: 1 })?.items).toBeNull()
    expect(argumentCompletion('/commit x', 9, LOOKUP, offered)).toBeNull()
    expect(argumentCompletion('/pair a ', 8, LOOKUP, offered)).toBeNull()
  })

  it('is replaced by the whole value, quoted when it has a space, with a space when more arguments come', () => {
    const at = (text: string, held = offered) =>
      argumentCompletion(text, text.length, LOOKUP, held)!
    expect(acceptCandidate('/model ast', at('/model ast'), MODELS[1]!)).toEqual({
      text: '/model openai/gpt-6-astra',
      caret: 25,
    })
    const pair = { command: 'omne-official:pair', param: 0, candidates: [{ value: 'a b' }] }
    expect(acceptCandidate('/pair a', at('/pair a', pair), { value: 'a b' })).toEqual({
      text: '/pair "a b" ',
      caret: 12,
    })
  })
})

const ready = () => start(known(CATALOG))
const at = (text: string) => typed(ready(), text, text.length)
const held = (text: string, candidates: readonly Candidate[] | null = MODELS) =>
  offeredTo(at(text), { command: 'omne-official:model', param: 0, candidates })

describe('the composer at an argument with candidates', () => {
  it('asks for the candidates of the argument at the caret, and for nothing elsewhere or while composing', () => {
    expect(assistOf(at('/model ')).asking).toEqual({ command: 'omne-official:model', param: 0 })
    expect(assistOf(at('/commit ')).asking).toBeNull()
    expect(assistOf(at('/mod')).asking).toBeNull()
    expect(assistOf(composing(at('/model '), true)).asking).toBeNull()
  })

  it('opens the menu when they come, filters as words are typed, and greys the rest of the first', () => {
    const shown = assistOf(held('/model '))
    expect(shown.menu?.items.map(item => [item.label, item.title, item.unavailable])).toEqual([
      ['z-ai/glm-5.3', '在用', null],
      ['openai/gpt-6-astra', '还没有凭据', null],
      ['openai/gpt-6-sol', '', null],
      ['old/locked-one', '', '被锁定'],
    ])
    expect(shown.menu?.note).toBe('/model 的模型名，共 4 项')
    const typedOn = typed(held('/model '), '/model open', 11)
    expect(assistOf(typedOn).menu?.items.map(item => item.label)).toEqual([
      'openai/gpt-6-astra',
      'openai/gpt-6-sol',
    ])
    expect(assistOf(typedOn).ghost).toBe('ai/gpt-6-astra')
  })

  it('completes on Tab, and on Enter sends only once the value is whole', () => {
    const typedOn = typed(held('/model '), '/model astra', 12)
    expect(pressed(typedOn, 'tab').answer).toEqual({
      kind: 'edit',
      text: '/model openai/gpt-6-astra',
      caret: 25,
    })
    expect(pressed(typedOn, 'enter').answer).toMatchObject({ kind: 'edit' })
    const whole = typed(typedOn, '/model openai/gpt-6-astra', 25)
    expect(pressed(whole, 'enter').answer).toEqual({ kind: 'send' })
    const locked = typed(typedOn, '/model locked', 13)
    expect(pressed(locked, 'tab').answer).toEqual({ kind: 'held' })
  })

  it('holds back a value that names no candidate, or one not to be chosen now, and not while they are not to be had', () => {
    const closed = (text: string, candidates: readonly Candidate[] | null = MODELS) =>
      assistOf(pressed(typed(held('/model ', candidates), text, text.length), 'escape').state)
    expect(closed('/model nope').blocked).toBe('「nope」不在 /model 的模型名候选里')
    expect(closed('/model old/locked-one').blocked).toBe('「old/locked-one」此刻不能选：被锁定')
    expect(closed('/model openai/gpt-6-sol').blocked).toBeNull()
    expect(closed('/model nope', null).blocked).toBeNull()
    expect(assistOf(at('/model nope')).blocked).toBeNull()
  })

  it('sends a command held back for its argument as written, for the server to judge', () => {
    const machine = createComposer()
    machine.listed(CATALOG)
    machine.input('/model ', 7)
    machine.offered('omne-official:model', 0, MODELS)
    machine.input('/model nope', 11)
    expect(machine.read().blocked).toBe('「nope」不在 /model 的模型名候选里')
    expect(machine.literal('/model nope')).toBe('/model nope')
    machine.input('/nosuch', 7)
    expect(machine.literal('/nosuch')).toBe('\\/nosuch')
  })
})
