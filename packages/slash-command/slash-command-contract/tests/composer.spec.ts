import {
  assistOf,
  type Composer,
  composing,
  known,
  listed,
  literal,
  moved,
  picked,
  pressed,
  typed,
} from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'
import { at, CATALOG } from './composer-fixtures.ts'

const open = () => at('/re')
const closed = () => at('你好')
const dismissed = () => pressed(open(), 'escape').state
const composingOpen = () => composing(open(), true)
const phase = (c: Composer) => (c.composing ? 'composing' : c.phase)
const SMALLER = known({ ...CATALOG, entries: CATALOG.entries.filter(e => e.name !== 'release') })

describe('the menu of a composer, every operation in every state (表二)', () => {
  it('text changed: closed opens when there is something to show, open closes when there is not, dismissed opens again, composing stays', () => {
    expect(phase(typed(closed(), '你好 /re', 6))).toBe('open')
    expect(phase(typed(closed(), '你好呀', 3))).toBe('closed')
    expect(phase(typed(open(), '/re ', 4))).toBe('closed')
    expect(phase(typed(dismissed(), '/rev', 4))).toBe('open')
    const held = typed(composingOpen(), '/rev', 4)
    expect([phase(held), held.found?.query]).toEqual(['composing', 're'])
  })

  it('caret moved: closed and open are worked out again, dismissed and composing stay', () => {
    const text = '/re 你好'
    expect(phase(moved(at(text, 6), 3))).toBe('open')
    expect(phase(moved(at(text, 3), 6))).toBe('closed')
    const away = moved(pressed(at(text, 3), 'escape').state, 1)
    expect([phase(away), away.found?.query, away.caret]).toEqual(['dismissed', 're', 1])
    expect(phase(moved(composing(at(text, 3), true), 1))).toBe('composing')
  })

  it('up and down move the selection only while open; elsewhere they pass', () => {
    expect(pressed(open(), 'down')).toMatchObject({
      answer: { kind: 'held' },
      state: { selected: 1 },
    })
    expect(pressed(open(), 'up').state.selected).toBe(1)
    for (const state of [closed(), dismissed(), composingOpen()])
      for (const key of ['up', 'down'] as const)
        expect(pressed(state, key)).toEqual({ state, answer: { kind: 'pass' } })
  })

  it('Tab takes the selected item while open, and passes elsewhere', () => {
    expect(pressed(open(), 'tab').answer).toEqual({ kind: 'edit', text: '/review ', caret: 8 })
    for (const state of [closed(), dismissed(), composingOpen()])
      expect(pressed(state, 'tab').answer).toEqual({ kind: 'pass' })
  })

  it('Enter sends when closed or dismissed, sends when the selected is what was typed, takes it otherwise, and is the IME`s while composing', () => {
    expect(pressed(closed(), 'enter').answer).toEqual({ kind: 'pass' })
    expect(pressed(dismissed(), 'enter').answer).toEqual({ kind: 'pass' })
    expect(pressed(open(), 'enter').answer).toEqual({ kind: 'edit', text: '/review ', caret: 8 })
    const exact = pressed(at('/review'), 'enter')
    expect([exact.answer, phase(exact.state)]).toEqual([{ kind: 'send' }, 'closed'])
    expect(pressed(composingOpen(), 'enter').answer).toEqual({ kind: 'pass' })
  })

  it('Escape dismisses while open, and passes elsewhere', () => {
    expect(phase(dismissed())).toBe('dismissed')
    for (const state of [closed(), dismissed(), composingOpen()])
      expect(pressed(state, 'escape').answer).toEqual({ kind: 'pass' })
  })

  it('composition start keeps the menu as it is; its end works it out again', () => {
    for (const state of [closed(), open(), dismissed()]) {
      const started = composing(state, true)
      expect([phase(started), started.phase]).toEqual(['composing', state.phase])
    }
    expect(phase(composing(typed(composingOpen(), '你好', 2), false))).toBe('closed')
    expect(composing(closed(), false)).toEqual(closed())
  })

  it('the list changed: only an open menu is worked out again', () => {
    expect(listed(open(), SMALLER).found?.items.map(i => i.entry.name)).toEqual(['review'])
    expect(listed(closed(), SMALLER).found).toBeNull()
    expect(listed(dismissed(), SMALLER).found?.items).toHaveLength(2)
    expect(listed(composingOpen(), SMALLER).found?.items).toHaveLength(2)
  })
})

describe('what the composer shows and sends', () => {
  it('marks a reference, a head command, a refused head and a name that does not count here', () => {
    const tones = (text: string) => assistOf(at(text)).marks.map(m => [m.tone, m.from, m.to])
    expect(tones('先 /review 再看')).toEqual([['reference', 2, 9]])
    expect(tones('/commit 修复')).toEqual([['command', 0, 7]])
    expect(tones('/nope 做')).toEqual([['refused', 0, 5]])
    expect(tones('先 /commit 一下')).toEqual([['note', 2, 9]])
  })

  it('blocks a head that would be refused, and says what was seen otherwise', () => {
    expect(assistOf(at('/nope 做'))).toMatchObject({ blocked: '没有这个命令：/nope' })
    expect(assistOf(at('/old 做'))).toMatchObject({ blocked: '/skill:old 此刻不能用：停用了' })
    expect(assistOf(at('先 /review 再 /review'))).toMatchObject({
      blocked: null,
      seen: { command: null, references: ['skill:review'] },
    })
    expect(assistOf(at('/commit x')).seen).toEqual({ command: 'prompt:commit', references: [] })
  })

  it('does not block what it cannot tell, and sends no view without a list', () => {
    const partial = { ...CATALOG, missing: ['prompt'] }
    expect(assistOf(at('/nope 做', 6, partial)).blocked).toBeNull()
    expect(assistOf(at('/nope 做', 6, partial)).menu).toBeNull()
    const none = listed(at('/re'), { kind: 'failed' })
    expect(assistOf(none)).toMatchObject({ marks: [], blocked: null, seen: null })
    expect(assistOf(typed(none, '/re', 3)).menu?.note).toBe('现在取不到能点名的清单')
  })

  it('lists commands and Skills at the head, only Skills in a sentence, the unusable greyed and not taken', () => {
    const head = assistOf(at('/'))
    expect(head.menu?.items.map(i => i.label)).toEqual([
      '/archive',
      '/commit',
      '/release',
      '/review',
      '/old',
    ])
    expect(head.menu?.note).toBe('开头：命令与 Skill，共 5 项')
    const mid = assistOf(at('看 /'))
    expect(mid.menu?.items.map(i => i.label)).toEqual(['/release', '/review', '/old'])
    const old = at('看 /ol')
    expect(assistOf(old).menu?.items[0]).toMatchObject({ unavailable: '停用了', kind: 'Skill' })
    expect(pressed(old, 'tab').answer).toEqual({ kind: 'held' })
    expect(picked(old, 0)).toEqual({ kind: 'held' })
    expect(picked(open(), 1)).toEqual({ kind: 'edit', text: '/release ', caret: 9 })
  })

  it('writes the rest of the first item in grey only while the caret is at the end of the name', () => {
    expect(assistOf(at('/rev')).ghost).toBe('iew')
    expect(assistOf(at('/re')).ghost).toBe('view')
    expect(assistOf(pressed(at('/re'), 'down').state).ghost).toBe('')
    expect(assistOf(at('/rev 你好', 4)).ghost).toBe('iew')
  })

  it('sends a refused head as it is with a backslash', () => {
    expect(literal('  /nope 做')).toBe('  \\/nope 做')
    expect(literal('你好 /x')).toBe('你好 /x')
  })
})

describe('the arguments still to write, in grey after the caret (光标所在的表)', () => {
  const WITH_ARGS = {
    entries: [
      ...CATALOG.entries.filter(entry => entry.name !== 'commit'),
      {
        space: 'prompt',
        name: 'commit',
        kind: 'prompt',
        title: '写提交说明',
        hint: '<scope> <message>',
        params: [{ name: 'scope' }, { name: 'message' }],
      },
      {
        space: 'prompt',
        name: 'note',
        kind: 'prompt',
        title: '记一笔',
        params: [{ name: 'text' }, { name: 'tag', optional: true }],
      },
    ],
    missing: [],
  } as const
  const ghost = (text: string, caret = text.length) => assistOf(at(text, caret, WITH_ARGS)).ghost

  it('names the arguments not written yet, moving on as each is written, and nothing once all are', () => {
    expect(ghost('/commit ')).toBe('<scope> <message>')
    expect(ghost('/commit core')).toBe(' <message>')
    expect(ghost('/commit core ')).toBe('<message>')
    expect(ghost('/commit core "fix it"')).toBe('')
    expect(ghost('/commit core "fix it" ')).toBe('')
    expect(ghost('/note ')).toBe('<text> [tag]')
  })

  it('says nothing away from the end, at a command without arguments, inside a sentence, or while composing', () => {
    expect(ghost('/commit core x', 9)).toBe('')
    expect(ghost('/archive ')).toBe('')
    expect(ghost('看 /commit ')).toBe('')
    expect(assistOf(composing(at('/commit ', 8, WITH_ARGS), true)).ghost).toBe('')
  })

  it('leaves the grey to the name while the menu of names is open', () => {
    expect(assistOf(at('/comm', 5, WITH_ARGS)).ghost).toBe('it')
  })
})
