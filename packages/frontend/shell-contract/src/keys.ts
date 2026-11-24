import type { ActionItem, ActionLayer } from './slots.ts'

/** The keys of the system and of editing: copy, paste, undo, quit, close, and moving the focus. */
export const RESERVED_CHORDS: readonly string[] = Object.freeze([
  'Mod+C',
  'Mod+V',
  'Mod+X',
  'Mod+A',
  'Mod+Z',
  'Mod+Shift+Z',
  'Mod+Q',
  'Mod+W',
  'Tab',
  'Shift+Tab',
])

const ORDER = ['Ctrl', 'Mod', 'Alt', 'Shift']
const SIGNS: Readonly<Record<string, string>> = {
  Slash: '/',
  Period: '.',
  Comma: ',',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
}
const MODIFIERS = ['Meta', 'Control', 'Alt', 'Shift']
const NAMED = [
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  ...Array.from({ length: 12 }, (_, n) => `F${String(n + 1)}`),
]
const keyName = (key: string): string =>
  key.length === 1
    ? key.toUpperCase()
    : (NAMED.find(name => name.toLowerCase() === key.toLowerCase()) ?? key)

export type KeyPress = Readonly<{
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}>

function physical(code: string): string | undefined {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3)
  if (/^Digit\d$/u.test(code)) return code.slice(5)
  return SIGNS[code]
}

const SPOKEN: Readonly<Record<string, string>> = { ' ': 'Space', '+': 'Plus' }

function heldOf(press: KeyPress, mac: boolean): readonly string[] {
  const held = [
    [mac && press.ctrlKey, 'Ctrl'],
    [mac ? press.metaKey : press.ctrlKey, 'Mod'],
    [press.altKey, 'Alt'],
  ] as const
  return held.flatMap(([down, name]) => (down === true ? [name] : []))
}

/** One key press as a chord name: with ⌘, Ctrl or Alt held, the physical key, since ⌥/ types ÷. */
export function chordOf(press: KeyPress, mac: boolean): string | null {
  if (MODIFIERS.includes(press.key)) return null
  const held = heldOf(press, mac)
  const typed = held.length > 0 ? (physical(press.code) ?? press.key) : press.key
  const upper = typed.length === 1 ? typed.toUpperCase() : typed
  const key = SPOKEN[upper] ?? upper
  const shift = press.shiftKey && (key.length > 1 || held.length > 0)
  return [...held, ...(shift ? ['Shift'] : []), key].join('+')
}

export function normalChord(chord: string): string {
  const parts = chord.split('+').map(part => part.trim())
  const key = parts.pop() ?? ''
  const named = parts.map(
    part => ORDER.find(name => name.toLowerCase() === part.toLowerCase()) ?? part,
  )
  const sorted = named.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return [...sorted, keyName(key)].join('+')
}

export const bareChord = (chord: string): boolean => !/(^|\+)(Ctrl|Mod|Alt)\+/u.test(chord)
const printable = (chord: string): boolean =>
  bareChord(chord) && chord.replace('Shift+', '').length === 1

export function chordLabel(chord: string, mac: boolean): string {
  if (!mac) return chord.replace('Mod', 'Ctrl')
  return chord
    .replace('Mod+', '⌘')
    .replace('Ctrl+', '⌃')
    .replace('Alt+', '⌥')
    .replace('Shift+', '⇧')
    .replace('Enter', '↩')
    .replace('Escape', 'Esc')
}

export type KeymapRow = Readonly<{ layer: ActionLayer; chord: string; action: string }>

function hereChord(chord: string, mac: boolean): string {
  const normal = normalChord(chord)
  return mac
    ? normal
    : normalChord(normal.replace(/(^|\+)Ctrl\+/u, '$1Mod+').replace('Mod+Mod+', 'Mod+'))
}

/** The bindings now: each action's own keys, or what the account changed for it; null takes them off. */
export function keymapOf(
  actions: readonly Pick<ActionItem, 'id' | 'keys'>[],
  changes: Readonly<Record<string, string | null>> = {},
  mac = true,
): readonly KeymapRow[] {
  return actions.flatMap(action => {
    if (Object.hasOwn(changes, action.id)) {
      const changed = changes[action.id]
      const layer = action.keys?.[0]?.layer ?? 'global'
      return changed === null || changed === undefined
        ? []
        : [{ layer, chord: hereChord(changed, mac), action: action.id }]
    }
    return (action.keys ?? []).map(key => ({
      layer: key.layer,
      chord: hereChord(key.chord, mac),
      action: action.id,
    }))
  })
}

export const actionAt = (
  keymap: readonly KeymapRow[],
  layer: ActionLayer,
  chord: string,
): string | undefined => keymap.find(row => row.layer === layer && row.chord === chord)?.action

export type KeyView = Readonly<{ composing: boolean; overlay: boolean; typing: boolean }>

export function layersOf(view: KeyView): readonly ActionLayer[] {
  if (view.overlay) return ['overlay']
  return [view.typing ? 'composer' : 'page', 'global']
}

export type KeyAnswer =
  | Readonly<{ kind: 'action'; action: string; layer: ActionLayer }>
  | Readonly<{ kind: 'ignored' | 'swallowed' | 'typed' | 'leave' | 'nothing' | 'unbound' }>

/** Where one key goes: innermost layer first; an overlay keeps every key; in a field a bare key types, bound or not. */
export function resolveKey(keymap: readonly KeymapRow[], chord: string, view: KeyView): KeyAnswer {
  if (view.composing) return { kind: 'ignored' }
  for (const layer of layersOf(view)) {
    if (layer === 'composer' && bareChord(chord) && chord !== 'Escape') return { kind: 'typed' }
    const hit = actionAt(keymap, layer, chord)
    if (hit !== undefined) return { kind: 'action', action: hit, layer }
    if (layer === 'overlay') return { kind: 'swallowed' }
  }
  if (chord === 'Escape') return { kind: view.typing ? 'leave' : 'nothing' }
  return { kind: 'unbound' }
}

export type BindingJudgment =
  | Readonly<{ ok: true; chord: string }>
  | Readonly<{ ok: false; why: string; clash?: string }>

/** Whether a chord can be given to an action: not a reserved key, not a key that types, not one taken where it is seen. */
export function judgeBinding(
  keymap: readonly KeymapRow[],
  action: Pick<ActionItem, 'id' | 'kind' | 'keys'>,
  written: string,
): BindingJudgment {
  const chord = normalChord(written)
  if (action.kind !== 'control' && action.kind !== 'ui')
    return { ok: false, why: '键只能绑到控制与界面动作上' }
  if (RESERVED_CHORDS.includes(chord))
    return { ok: false, why: `${chord} 是系统或编辑的键，不能绑` }
  const layer = action.keys?.[0]?.layer ?? 'global'
  if (layer !== 'page' && printable(chord))
    return { ok: false, why: '不带修饰键的字符键会挡住打字，只能绑在「没有打字时」的动作上' }
  const sees = (other: ActionLayer): boolean =>
    other === layer || other === 'global' || layer === 'global'
  const clash = keymap.find(
    row => row.chord === chord && row.action !== action.id && sees(row.layer),
  )
  if (clash !== undefined) return { ok: false, why: `和 ${clash.action} 撞了`, clash: clash.action }
  return { ok: true, chord }
}

/** Two actions in one layer on one key: the defaults that come with the application have none. */
export function keyClashes(keymap: readonly KeymapRow[]): readonly string[] {
  const seen = new Map<string, string>()
  const clashes: string[] = []
  for (const row of keymap) {
    const at = `${row.layer} ${row.chord}`
    const before = seen.get(at)
    if (before !== undefined && before !== row.action)
      clashes.push(`${at}: ${before} ${row.action}`)
    else seen.set(at, row.action)
  }
  return clashes
}
