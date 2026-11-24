import {
  chordLabel,
  keymapOf,
  type ActionItem,
  type ActionLayer,
} from '@omne-harness/shell-contract'
import { CommandPalette, type PaletteItem } from '@omne-harness/ui-kit'
import { useSyncExternalStore } from 'react'
import type { Watched } from './state.ts'

export type PaletteMode = 'closed' | 'commands' | 'keys'
export type PaletteSwitch = Watched<PaletteMode> & { set(mode: PaletteMode): void }

export function paletteSwitch(): PaletteSwitch {
  let mode: PaletteMode = 'closed'
  const listeners = new Set<(mode: PaletteMode) => void>()
  return {
    get: () => mode,
    set(next) {
      if (next === mode) return
      mode = next
      for (const listener of Array.from(listeners)) listener(next)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

const GROUP = '帮助'
const always = (): true => true

/** ⌘K for the palette, again to shut it; ⌘/ and ? for the keys of this moment. */
export function paletteActions(palette: PaletteSwitch): readonly ActionItem[] {
  const flip = (mode: PaletteMode) => (): void =>
    palette.set(palette.get() === mode ? 'closed' : mode)
  return [
    {
      id: 'shell.palette',
      title: '打开或关上命令面板',
      group: GROUP,
      kind: 'ui',
      order: 40,
      keys: [
        { chord: 'Mod+K', layer: 'global' },
        { chord: 'Mod+K', layer: 'overlay' },
      ],
      available: always,
      run: flip('commands'),
    },
    {
      id: 'shell.shortcuts',
      title: '看此刻能按的键',
      group: GROUP,
      kind: 'ui',
      order: 41,
      keys: [
        { chord: 'Mod+/', layer: 'global' },
        { chord: '?', layer: 'page' },
      ],
      available: always,
      run: flip('keys'),
    },
    {
      id: 'shell.help',
      title: '怎样用命令与快捷键',
      group: GROUP,
      kind: 'ui',
      order: 42,
      available: always,
      run: () => palette.set('keys'),
    },
  ]
}

const LAYERS: readonly (readonly [ActionLayer, string])[] = [
  ['overlay', '浮层开着时'],
  ['composer', '光标在输入框里'],
  ['page', '没有在打字时'],
  ['global', '任何地方'],
]

/** Keys that belong to the control with the focus: they are in no action and cannot be changed. */
const NOT_COMMANDS: readonly (readonly [string, string])[] = [
  ['Shift+Enter', '输入框里换行'],
  ['↑ ↓', '菜单里选上一项、下一项'],
  ['Tab', '菜单里采用选中的一项；别处移焦点'],
  ['Escape', '收起菜单，关上最里面的一层'],
  ['⌘C ⌘V ⌘X ⌘A ⌘Z ⌘Q ⌘W', '系统与编辑的键，不能绑'],
]

export function commandItems(actions: readonly ActionItem[], mac: boolean): readonly PaletteItem[] {
  const keymap = keymapOf(actions, {}, mac)
  return actions.map(action => {
    const can = action.available()
    const key = keymap.find(row => row.action === action.id)
    const hint = key === undefined ? action.slash : chordLabel(key.chord, mac)
    return {
      id: action.id,
      title: action.title,
      group: action.group,
      words: action.slash ?? action.id,
      ...(hint === undefined ? {} : { hint }),
      ...(can === true ? {} : { unavailable: can }),
    }
  })
}

export function keyItems(actions: readonly ActionItem[], mac: boolean): readonly PaletteItem[] {
  const title = new Map(actions.map(action => [action.id, action.title]))
  const now = new Set(actions.filter(action => action.available() === true).map(a => a.id))
  const keymap = keymapOf(actions, {}, mac).filter(row => now.has(row.action))
  return [
    ...LAYERS.flatMap(([layer, group]) =>
      keymap
        .filter(row => row.layer === layer)
        .map(row => ({
          id: `${layer} ${row.chord}`,
          title: title.get(row.action) ?? row.action,
          group,
          hint: chordLabel(row.chord, mac),
        })),
    ),
    ...NOT_COMMANDS.map(([key, what]) => ({
      id: key,
      title: what,
      group: '不是命令的键',
      hint: key,
    })),
  ]
}

export function ShellPalette({
  palette,
  actions,
  mac,
  run,
}: {
  readonly palette: PaletteSwitch
  readonly actions: () => readonly ActionItem[]
  readonly mac: boolean
  readonly run: (action: ActionItem) => void
}) {
  const mode = useSyncExternalStore(palette.subscribe, palette.get)
  const now = mode === 'closed' ? [] : actions()
  const commands = mode !== 'keys'
  return (
    <CommandPalette
      open={mode !== 'closed'}
      onOpenChange={open => (open ? undefined : palette.set('closed'))}
      label={commands ? '命令面板' : '此刻能按的键'}
      placeholder={commands ? '找一条命令' : '找一个键'}
      empty={commands ? '没有对得上的命令' : '没有对得上的键'}
      items={commands ? commandItems(now, mac) : keyItems(now, mac)}
      {...(commands
        ? {
            onPick: (id: string) => {
              const action = now.find(item => item.id === id)
              if (action !== undefined) run(action)
            },
          }
        : {})}
    />
  )
}
