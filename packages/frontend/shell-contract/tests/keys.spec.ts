import { Context } from '@deepseek-ai/cordis'
import {
  chordLabel,
  chordOf,
  judgeBinding,
  keyClashes,
  actionAt,
  keymapOf,
  normalChord,
  resolveKey,
  type ActionItem,
  type KeyPress,
} from '@omne-harness/shell-contract'
import { describe, expect, it } from 'vitest'
import { startShell } from './reference-shell.ts'

const press = (key: string, code: string, held: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...held,
})
const action = (
  id: string,
  chord: string,
  layer: ActionItem['keys'] extends readonly (infer K)[] | undefined
    ? K extends { layer: infer L }
      ? L
      : never
    : never,
  kind: 'control' | 'ui' = 'ui',
) => ({ id, kind, keys: [{ chord, layer }] }) as const
const MAP = keymapOf([
  action('session.stop', 'Mod+.', 'global', 'control'),
  action('session.send-first', 'Mod+Enter', 'composer', 'control'),
  action('session.start-command', '/', 'page'),
  action('palette.close', 'Escape', 'overlay'),
  action('palette.toggle', 'Mod+K', 'overlay'),
  action('session.send', 'Enter', 'composer', 'control'),
])

describe('a key press as a chord', () => {
  it.each([
    [press('.', 'Period', { metaKey: true }), true, 'Mod+.'],
    [press('÷', 'Slash', { metaKey: true, altKey: true }), true, 'Mod+Alt+/'],
    [press('.', 'Period', { ctrlKey: true }), false, 'Mod+.'],
    [press('Enter', 'Enter', { metaKey: true }), true, 'Mod+Enter'],
    [press('?', 'Slash', { shiftKey: true }), true, '?'],
    [press('F6', 'F6', { shiftKey: true }), true, 'Shift+F6'],
    [press('Tab', 'Tab', { ctrlKey: true, shiftKey: true }), true, 'Ctrl+Shift+Tab'],
    [press('a', 'KeyA'), true, 'A'],
    [press(' ', 'Space'), true, 'Space'],
    [press('Meta', 'MetaLeft', { metaKey: true }), true, null],
  ])('%j on mac=%s is %s', (given, mac, wanted) => expect(chordOf(given, mac)).toBe(wanted))

  it.each([
    ['∫', 'KeyB', { altKey: true }, 'Alt+B'],
    ['º', 'Digit0', { altKey: true }, 'Alt+0'],
    ['F', 'KeyF', { metaKey: true, shiftKey: true }, 'Mod+Shift+F'],
    ['≤', 'Comma', { metaKey: true }, 'Mod+,'],
    ['–', 'Minus', { metaKey: true }, 'Mod+-'],
    ['≠', 'Equal', { metaKey: true }, 'Mod+='],
    ['“', 'BracketLeft', { metaKey: true }, 'Mod+['],
    ['‘', 'BracketRight', { metaKey: true }, 'Mod+]'],
    ['«', 'Backslash', { metaKey: true }, 'Mod+\\'],
    ['…', 'Semicolon', { metaKey: true }, 'Mod+;'],
    ['æ', 'Quote', { metaKey: true }, "Mod+'"],
    ['`', 'Backquote', { metaKey: true }, 'Mod+`'],
    ['+', 'NumpadAdd', { metaKey: true }, 'Mod+Plus'],
    ['k', 'KeyK', { ctrlKey: true, metaKey: true }, 'Ctrl+Mod+K'],
  ] as const)(
    'with a modifier held, %s on %s reads the key where it sits',
    (key, code, held, wanted) => expect(chordOf(press(key, code, held), true)).toBe(wanted),
  )

  it('writes a chord a person wrote in one order of modifiers', () => {
    expect(normalChord(' shift + mod + k ')).toBe('Mod+Shift+K')
    expect(normalChord('alt+ctrl+escape')).toBe('Ctrl+Alt+Escape')
  })

  it('is written as the platform writes it', () => {
    expect(chordLabel('Ctrl+Tab', true)).toBe('⌃Tab')
    expect(chordLabel('Escape', true)).toBe('Esc')
    expect(chordLabel('Mod+Shift+F', true)).toBe('⌘⇧F')
    expect(chordLabel('Alt+Enter', true)).toBe('⌥↩')
    expect(chordLabel('Mod+Shift+F', false)).toBe('Ctrl+Shift+F')
  })
})

describe('where one key goes (表三)', () => {
  const idle = { composing: false, overlay: false, typing: false }
  it.each([
    ['composing takes every key', 'Mod+.', { ...idle, composing: true }, { kind: 'ignored' }],
    [
      'an overlay keeps its own key',
      'Mod+K',
      { ...idle, overlay: true },
      { kind: 'action', action: 'palette.toggle', layer: 'overlay' },
    ],
    [
      'an overlay keeps every other key from outside',
      'Mod+.',
      { ...idle, overlay: true },
      { kind: 'swallowed' },
    ],
    [
      'in a field a key with Mod is a command',
      'Mod+Enter',
      { ...idle, typing: true },
      { kind: 'action', action: 'session.send-first', layer: 'composer' },
    ],
    ['in a field a bare key types', '/', { ...idle, typing: true }, { kind: 'typed' }],
    [
      'in a field a bare key types even when bound there',
      'Enter',
      { ...idle, typing: true },
      { kind: 'typed' },
    ],
    [
      'in a field Escape gives the focus back',
      'Escape',
      { ...idle, typing: true },
      { kind: 'leave' },
    ],
    [
      'on the page a bare key is a command',
      '/',
      idle,
      { kind: 'action', action: 'session.start-command', layer: 'page' },
    ],
    [
      'a global key is found from the page',
      'Mod+.',
      idle,
      { kind: 'action', action: 'session.stop', layer: 'global' },
    ],
    [
      'a global key is found from a field',
      'Mod+.',
      { ...idle, typing: true },
      { kind: 'action', action: 'session.stop', layer: 'global' },
    ],
    ['a key of the composer is not one of the page', 'Mod+Enter', idle, { kind: 'unbound' }],
    ['Escape with nothing to close does nothing', 'Escape', idle, { kind: 'nothing' }],
  ])('%s', (_name, chord, view, wanted) => expect(resolveKey(MAP, chord, view)).toEqual(wanted))
})

describe('giving a key to an action', () => {
  const stop = action('session.stop', 'Mod+.', 'global', 'control')
  it.each([
    ['a free key', 'Mod+Shift+S', true],
    ['a reserved key', 'Mod+C', false],
    ['a key that types, outside the page', 'S', false],
    ['a key another action holds where both are seen', 'Mod+Enter', false],
  ])('%s', (_name, chord, ok) => expect(judgeBinding(MAP, stop, chord).ok).toBe(ok))

  it('names whom it clashes with, and a change of the account replaces the key or takes it off', () => {
    expect(judgeBinding(MAP, stop, 'mod+enter')).toMatchObject({ clash: 'session.send-first' })
    const changed = keymapOf([stop], { 'session.stop': 'Mod+Shift+S' })
    expect(changed).toEqual([{ layer: 'global', chord: 'Mod+Shift+S', action: 'session.stop' }])
    expect(keymapOf([stop], { 'session.stop': null })).toEqual([])
  })

  it('reads a key written with Ctrl as Mod off macOS, and finds the action a key holds in a layer', () => {
    const next = [action('session.next', 'Ctrl+Tab', 'global')]
    expect(keymapOf(next, {}, true)[0]?.chord).toBe('Ctrl+Tab')
    expect(keymapOf(next, {}, false)[0]?.chord).toBe('Mod+Tab')
    expect(keymapOf(next, { 'session.next': 'ctrl+shift+tab' }, false)[0]?.chord).toBe(
      'Mod+Shift+Tab',
    )
    expect(chordOf(press('Tab', 'Tab', { ctrlKey: true }), false)).toBe('Mod+Tab')
    expect(actionAt(MAP, 'composer', 'Enter')).toBe('session.send')
    expect(actionAt(MAP, 'page', 'Enter')).toBeUndefined()
  })

  it.each([
    'Mod+V',
    'Mod+X',
    'Mod+A',
    'Mod+Z',
    'Mod+Shift+Z',
    'Mod+Q',
    'Mod+W',
    'Tab',
    'Shift+Tab',
  ])('refuses the key of the system or of editing %s', chord =>
    expect(judgeBinding(MAP, stop, chord)).toMatchObject({
      ok: false,
      why: `${chord} 是系统或编辑的键，不能绑`,
    }),
  )

  it('gives a key only to a control or an action of the interface, and a typing key only where nobody types', () => {
    const command = { id: 'slash-command.x', kind: 'command', keys: [] } as const
    expect(judgeBinding(MAP, command, 'Mod+J')).toEqual({
      ok: false,
      why: '键只能绑到控制与界面动作上',
    })
    const onPage = action('a.page', 'G', 'page')
    expect(judgeBinding(MAP, onPage, 'J')).toEqual({ ok: true, chord: 'J' })
    expect(judgeBinding(MAP, action('a.field', 'Mod+J', 'composer'), 'Shift+J').ok).toBe(false)
    expect(judgeBinding(MAP, { id: 'a.none', kind: 'ui' }, 'J').ok).toBe(false)
  })

  it('sees a clash only where both keys are seen: the same layer, or one of them everywhere', () => {
    expect(judgeBinding(MAP, action('a.page', 'G', 'page'), 'Mod+Enter')).toEqual({
      ok: true,
      chord: 'Mod+Enter',
    })
    expect(judgeBinding(MAP, action('a.page', 'G', 'page'), 'Mod+.')).toMatchObject({
      ok: false,
      why: '和 session.stop 撞了',
    })
    expect(judgeBinding(MAP, action('a.all', 'G', 'global'), 'Mod+Enter')).toMatchObject({
      clash: 'session.send-first',
    })
    expect(judgeBinding(MAP, stop, 'Mod+.')).toEqual({ ok: true, chord: 'Mod+.' })
  })

  it('puts a changed key in the layer of the action, everywhere when it had none, and reads Ctrl and Mod as one off macOS', () => {
    expect(keymapOf([{ id: 'a.none' }], { 'a.none': 'Mod+J' })).toEqual([
      { layer: 'global', chord: 'Mod+J', action: 'a.none' },
    ])
    expect(keymapOf([{ id: 'a.none' }], { 'a.none': undefined as never })).toEqual([])
    expect(keymapOf([action('a.x', 'Ctrl+Mod+K', 'global')], {}, false)[0]?.chord).toBe('Mod+K')
    const twice = action('a.x', 'Mod+K', 'global')
    expect(keyClashes(keymapOf([{ ...twice, keys: [...twice.keys, ...twice.keys] }]))).toEqual([])
  })

  it('finds two actions on one key in one layer', () => {
    expect(keyClashes(MAP)).toEqual([])
    const twice = keymapOf([action('a.x', 'Mod+K', 'global'), action('b.y', 'mod+k', 'global')])
    expect(keyClashes(twice)).toEqual(['global Mod+K: a.x b.y'])
  })
})

describe('the actions slot', () => {
  it('holds what each module puts, and lets it go with the module', async () => {
    const { root, shell } = await startShell()
    const item: ActionItem = {
      id: 'demo.ping',
      title: 'Ping',
      group: 'demo',
      kind: 'ui',
      order: 0,
      keys: [{ chord: 'Mod+P', layer: 'global' }],
      available: () => true,
      run: () => {},
    }
    const fiber = root.plugin({
      name: 'demo',
      inject: ['shell'],
      apply: (ctx: Context) => ctx.shell.contribute('actions', item),
    })
    await fiber
    expect(shell.items('actions').map(each => each.id)).toEqual(['demo.ping'])
    await fiber.dispose()
    expect(shell.items('actions')).toEqual([])
  })
})
