import type { ActionItem } from '@omne-harness/shell-contract'
import type { SlashCommandCatalog } from '@omne-harness/slash-command-protocol'
import { describe, expect, it } from 'vitest'
import { entryActions, typedAction, type ComposerWriter } from '../src/model/entries.ts'

const CATALOG: SlashCommandCatalog = {
  entries: [
    { full: 'system:archive', space: 'system', name: 'archive', kind: 'system', title: '归档' },
    {
      full: 'system:model',
      space: 'system',
      name: 'model',
      kind: 'system',
      title: '换模型',
      hint: '<模型名>',
    },
    { full: 'prompt:plan', space: 'prompt', name: 'plan', kind: 'prompt', title: '出计划' },
    {
      full: 'skill:review',
      space: 'skill',
      name: 'review',
      kind: 'reference',
      title: '评审',
      unavailable: '停用了',
    },
  ],
  missing: [],
}

function writer(answer: true | string = true) {
  const said: string[] = []
  const written: string[] = []
  const it: ComposerWriter = {
    say: text => (said.push(text), answer),
    write: text => (written.push(text), answer),
  }
  return { it, said, written }
}

const action = (
  id: string,
  kind: ActionItem['kind'],
  layers?: readonly ('global' | 'composer')[],
): ActionItem => ({
  id,
  title: id,
  group: 'g',
  kind,
  order: 0,
  ...(layers === undefined ? {} : { keys: layers.map(layer => ({ chord: 'Mod+.', layer })) }),
  available: () => true,
  run: () => undefined,
})

describe('the entries of the list as actions (C15)', () => {
  it('groups each kind, keeps the order of the list after the built-in actions, and names each by its full name', () => {
    const items = entryActions(CATALOG, () => writer().it)
    expect(items.map(item => [item.id, item.group, item.order, item.slash])).toEqual([
      ['slash-command.system:archive', '系统命令', 100, '/archive'],
      ['slash-command.system:model', '系统命令', 101, '/model'],
      ['slash-command.prompt:plan', '提示词命令', 102, '/plan'],
      ['slash-command.skill:review', 'Skill', 103, '/review'],
    ])
    expect(items.every(item => item.kind === 'command')).toBe(true)
  })

  it('says a system command that takes nothing and writes in every other entry', () => {
    const composer = writer()
    for (const item of entryActions(CATALOG, () => composer.it)) item.run()
    expect(composer.said).toEqual(['/archive'])
    expect(composer.written).toEqual(['/model ', '/plan ', '/review '])
  })

  it('with no composer open it cannot run and says why; a refusal of the composer is told; the entry says its own first', () => {
    const items = entryActions(CATALOG, () => undefined)
    expect(items[0]!.available()).toBe('没有打开的输入框')
    expect(items[3]!.available()).toBe('停用了')
    expect(() => items[0]!.run()).toThrow('没有打开的输入框')
    expect(() => items[1]!.run()).toThrow('没有打开的输入框')
    const refusing = entryActions(CATALOG, () => writer('正在发送').it)
    expect(refusing[0]!.available()).toBe(true)
    expect(() => refusing[2]!.run()).toThrow('正在发送')
  })
})

describe('an action typed whole (C15)', () => {
  const actions = [
    action('slash-command.system:stop', 'command'),
    action('session.stop', 'control', ['global']),
    action('session.send', 'control', ['global', 'composer']),
    action('shell.palette', 'ui'),
  ]

  it('finds a control or an interface action by the last part of its name, spaces around it aside', () => {
    expect(typedAction('  /stop  ', actions)?.id).toBe('session.stop')
    expect(typedAction('/palette', actions)?.id).toBe('shell.palette')
  })

  it('finds nothing for words around it, a command of the list, or an action with a key on the composer', () => {
    expect(typedAction('x/stop', actions)).toBeUndefined()
    expect(typedAction('/stop now', actions)).toBeUndefined()
    expect(typedAction('/send', actions)).toBeUndefined()
    expect(typedAction('/stop', [actions[0]!])).toBeUndefined()
    expect(typedAction('stop', actions)).toBeUndefined()
  })
})
