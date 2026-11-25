import { accept, complete, type Completion, type CompletionIndex, indexOf } from './complete.ts'
import { type Catalog, type Lookup, lookupOf } from './names.ts'
import { type Recognition, recognize } from './recognize.ts'
import { type SenderView, viewOf } from './view.ts'

export type Tone = 'reference' | 'command' | 'refused' | 'note'
export type Mark = Readonly<{ from: number; to: number; tone: Tone; label: string }>
export type MenuItem = Readonly<{
  id: string
  label: string
  title: string
  kind: string
  unavailable: string | null
}>
export type Menu = Readonly<{ items: readonly MenuItem[]; selected: number; note: string }>
export type Assist = Readonly<{
  marks: readonly Mark[]
  ghost: string
  menu: Menu | null
  blocked: string | null
  seen: SenderView | null
}>
export type Key = 'up' | 'down' | 'tab' | 'enter' | 'escape'
export type Answer =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'held' }>
  | Readonly<{ kind: 'send' }>
  | Readonly<{ kind: 'edit'; text: string; caret: number }>

/** The list as the composer knows it: not read yet, read, or not to be had now. */
export type Known =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'read'; catalog: Catalog; lookup: Lookup; index: CompletionIndex }>
  | Readonly<{ kind: 'failed' }>

export const known = (catalog: Catalog): Known => {
  const lookup = lookupOf(catalog)
  return { kind: 'read', catalog, lookup, index: indexOf(lookup) }
}

type Phase = 'closed' | 'open' | 'dismissed'
export type Composer = Readonly<{
  text: string
  caret: number
  phase: Phase
  composing: boolean
  selected: number
  known: Known
  found: Completion | null
}>

const KIND: Readonly<Record<string, string>> = {
  reference: 'Skill',
  prompt: '提示词命令',
  system: '系统命令',
}
const PASS: Answer = Object.freeze({ kind: 'pass' })
const HELD: Answer = Object.freeze({ kind: 'held' })
const SEND: Answer = Object.freeze({ kind: 'send' })

export const start = (state: Known = { kind: 'reading' }): Composer => ({
  text: '',
  caret: 0,
  phase: 'closed',
  composing: false,
  selected: 0,
  known: state,
  found: null,
})

function completionOf(c: Composer): Completion | null {
  if (c.known.kind !== 'read') return null
  return complete(c.text, c.caret, c.known.index, c.known.lookup)
}

/** Whether there is something to show at the caret: items, or the word that the list is not to be had. */
function worth(c: Composer, found: Completion | null): boolean {
  if (c.known.kind === 'failed') return /(^|\s)\/[^\s/]*$/u.test(c.text.slice(0, c.caret))
  return found !== null && found.items.length > 0
}

function recomputed(c: Composer, from: Phase): Composer {
  const found = completionOf(c)
  if (from === 'dismissed') return { ...c, found, phase: 'dismissed' }
  return { ...c, found, phase: worth(c, found) ? 'open' : 'closed', selected: 0 }
}

export function typed(c: Composer, text: string, caret: number): Composer {
  if (c.composing) return { ...c, text, caret }
  const next = { ...c, text, caret }
  return recomputed(next, c.phase === 'dismissed' ? 'closed' : c.phase)
}

export function moved(c: Composer, caret: number): Composer {
  if (c.composing || c.phase === 'dismissed' || caret === c.caret) return { ...c, caret }
  return recomputed({ ...c, caret }, c.phase)
}

export function composing(c: Composer, on: boolean): Composer {
  if (on) return { ...c, composing: true }
  return c.composing ? recomputed({ ...c, composing: false }, c.phase) : c
}

export function listed(c: Composer, state: Known): Composer {
  const next = { ...c, known: state }
  return c.phase === 'open' && !c.composing ? recomputed(next, 'open') : next
}

function take(c: Composer, at: number): Answer {
  const item = c.found?.items[at]
  if (c.found === null || item === undefined || item.entry.unavailable !== undefined) return HELD
  return { kind: 'edit', ...accept(c.text, c.found, item) }
}

type Pressed = Readonly<{ state: Composer; answer: Answer }>

const step = (c: Composer, by: (count: number) => number): Pressed => {
  const count = c.found?.items.length ?? 0
  return {
    state: { ...c, selected: count === 0 ? 0 : (c.selected + by(count)) % count },
    answer: HELD,
  }
}

function entered(c: Composer): Pressed {
  const item = c.found?.items[c.selected]
  if (item !== undefined && item.shown === c.found?.query)
    return { state: { ...c, phase: 'closed' }, answer: SEND }
  return { state: c, answer: take(c, c.selected) }
}

const KEYS: Readonly<Record<Key, (c: Composer) => Pressed>> = {
  up: c => step(c, count => count - 1),
  down: c => step(c, () => 1),
  tab: c => ({ state: c, answer: take(c, c.selected) }),
  enter: entered,
  escape: c => ({ state: { ...c, phase: 'dismissed' }, answer: HELD }),
}

/** What a key does to the menu: the composer does what is passed on. */
export function pressed(c: Composer, key: Key): Pressed {
  if (c.composing || c.phase !== 'open') return { state: c, answer: PASS }
  return KEYS[key](c)
}

export const picked = (c: Composer, at: number): Answer =>
  c.phase === 'open' && !c.composing ? take(c, at) : HELD

function marksOf(recognition: Recognition): Mark[] {
  if (recognition.kind === 'command')
    return [
      {
        from: recognition.span[0],
        to: recognition.span[1],
        tone: 'command',
        label: `命令 /${recognition.name}`,
      },
    ]
  if (recognition.kind === 'refused')
    return [
      {
        from: recognition.span[0],
        to: recognition.span[1],
        tone: 'refused',
        label: refusalOf(recognition),
      },
    ]
  return [
    ...recognition.references.map(reference => ({
      from: reference.span[0],
      to: reference.span[1],
      tone: 'reference' as const,
      label: `引用 /${reference.name}`,
    })),
    ...recognition.notes.map(note => ({
      from: note.span[0],
      to: note.span[1],
      tone: 'note' as const,
      label:
        note.kind === 'head-only'
          ? `/${note.name} 是命令，只在开头才算，这里是文字`
          : `/${note.name} 此刻不能用（${note.reason}），这里是文字`,
    })),
  ].sort((a, b) => a.from - b.from)
}

function refusalOf(refused: Extract<Recognition, { kind: 'refused' }>): string {
  return refused.reason === 'unavailable'
    ? `/${refused.name} 此刻不能用：${refused.why}`
    : `没有这个命令：/${refused.name}`
}

function rowOf(item: Completion['items'][number]): MenuItem {
  const { entry } = item
  return {
    id: entry.full,
    label: `/${item.shown}`,
    title: entry.hint === undefined ? entry.title : `${entry.title} ${entry.hint}`,
    kind: KIND[entry.kind] ?? entry.kind,
    unavailable: entry.unavailable ?? null,
  }
}

function menuOf(c: Composer): Menu | null {
  if (c.phase !== 'open') return null
  if (c.known.kind !== 'read') return { items: [], selected: 0, note: '现在取不到能点名的清单' }
  const found = c.found
  if (found === null) return null
  const where = found.zone === 'head' ? '开头：命令与 Skill' : '句中：只列能引用的 Skill'
  const more = found.total > found.items.length ? `，显示前 ${String(found.items.length)} 项` : ''
  const missing = c.known.catalog.missing
  const gap = missing.length === 0 ? '' : `；这一部分取不到：${missing.join('、')}`
  return {
    items: found.items.map(rowOf),
    selected: c.selected,
    note: `${where}，共 ${String(found.total)} 项${more}${gap}`,
  }
}

/** What the composer shows and sends for the words as they are now. */
export function assistOf(c: Composer): Assist {
  if (c.known.kind !== 'read')
    return { marks: [], ghost: '', menu: menuOf(c), blocked: null, seen: null }
  const recognition = recognize(c.text, c.known.lookup)
  const whole = c.known.catalog.missing.length === 0
  const blocked =
    recognition.kind === 'refused' && (whole || recognition.reason === 'unavailable')
      ? refusalOf(recognition)
      : null
  const open = c.phase === 'open' && !c.composing
  return {
    marks: marksOf(recognition),
    ghost: open && c.selected === 0 ? (c.found?.ghost ?? '') : '',
    menu: menuOf(c),
    blocked,
    seen: viewOf(recognition),
  }
}

/** The words sent as they are: a backslash before the slash at the head keeps it from being a command. */
export function literal(text: string): string {
  const at = text.length - text.trimStart().length
  return text[at] === '/' ? `${text.slice(0, at)}\\${text.slice(at)}` : text
}

/** One composer: the menu and what it shows, as a machine a client drives. */
export type ComposerMachine = Readonly<{
  listed(catalog: Catalog | null): void
  input(text: string, caret: number): void
  composing(on: boolean): void
  key(key: Key): Answer
  take(index: number): Answer
  read(): Assist
  literal(text: string): string
}>

export function createComposer(): ComposerMachine {
  let state = start()
  let shown = assistOf(state)
  const set = (next: Composer): void => {
    state = next
    shown = assistOf(state)
  }
  return {
    listed: catalog => set(listed(state, catalog === null ? { kind: 'failed' } : known(catalog))),
    input: (text, caret) =>
      set(text === state.text ? moved(state, caret) : typed(state, text, caret)),
    composing: on => set(composing(state, on)),
    key(key) {
      const step = pressed(state, key)
      set(step.state)
      return step.answer
    },
    take: at => picked(state, at),
    read: () => shown,
    literal,
  }
}
