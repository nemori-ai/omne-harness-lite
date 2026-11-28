import { argumentAt } from './arguments.ts'
import {
  acceptCandidate,
  type ArgumentCompletion,
  argumentBlock,
  argumentCompletion,
  type Asking,
  askingAt,
  type Offered,
} from './candidates.ts'
import { accept, complete, type Completion, type CompletionIndex, indexOf } from './complete.ts'
import { type Catalog, type Lookup, lookupOf } from './names.ts'
import { type Recognition, recognize } from './recognize.ts'
import type { Candidate } from './source.ts'
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
  asking: Asking | null
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
  offered: Offered | null
  argument: ArgumentCompletion | null
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
  offered: null,
  argument: null,
})

type Shown = Readonly<{ found: Completion | null; argument: ArgumentCompletion | null }>

/** Names at the caret come first; the candidates of the argument at the caret when no name is being typed. */
function completionOf(c: Composer): Shown {
  if (c.known.kind !== 'read') return { found: null, argument: null }
  const found = complete(c.text, c.caret, c.known.index, c.known.lookup)
  if (found !== null && found.items.length > 0) return { found, argument: null }
  return { found, argument: argumentCompletion(c.text, c.caret, c.known.lookup, c.offered) }
}

const named = (c: Pick<Composer, 'found'>): boolean => (c.found?.items.length ?? 0) > 0
const offering = (c: Pick<Composer, 'found' | 'argument'>): readonly unknown[] =>
  named(c) ? (c.found?.items ?? []) : (c.argument?.items ?? [])

/** Whether there is something to show at the caret: items, or the word that the list is not to be had. */
function worth(c: Composer, shown: Shown): boolean {
  if (c.known.kind === 'failed') return /(^|\s)\/[^\s/]*$/u.test(c.text.slice(0, c.caret))
  return offering(shown).length > 0
}

function recomputed(c: Composer, from: Phase): Composer {
  const shown = completionOf(c)
  if (from === 'dismissed') return { ...c, ...shown, phase: 'dismissed' }
  return { ...c, ...shown, phase: worth(c, shown) ? 'open' : 'closed', selected: 0 }
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

export function offeredTo(c: Composer, offered: Offered): Composer {
  const next = { ...c, offered }
  if (c.composing) return next
  return recomputed(next, c.phase === 'dismissed' ? 'dismissed' : 'closed')
}

function take(c: Composer, at: number): Answer {
  if (named(c)) {
    const item = c.found?.items[at]
    if (c.found === null || item === undefined || item.entry.unavailable !== undefined) return HELD
    return { kind: 'edit', ...accept(c.text, c.found, item) }
  }
  const offer = c.argument?.items?.[at]
  if (c.argument === null || offer === undefined || offer.candidate.unavailable !== undefined)
    return HELD
  return { kind: 'edit', ...acceptCandidate(c.text, c.argument, offer.candidate) }
}

type Pressed = Readonly<{ state: Composer; answer: Answer }>

const step = (c: Composer, by: (count: number) => number): Pressed => {
  const count = offering(c).length
  return {
    state: { ...c, selected: count === 0 ? 0 : (c.selected + by(count)) % count },
    answer: HELD,
  }
}

function entered(c: Composer): Pressed {
  const whole = named(c)
    ? c.found?.items[c.selected]?.shown === c.found?.query
    : c.argument?.items?.[c.selected]?.candidate.value === c.argument?.query
  if (whole) return { state: { ...c, phase: 'closed' }, answer: SEND }
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
export function pressed(c: Composer, key: Key): Readonly<{ state: Composer; answer: Answer }> {
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

const SHOWN = 50

function candidateRow(argument: ArgumentCompletion, candidate: Candidate): MenuItem {
  const title = [candidate.current === true ? '在用' : '', candidate.title ?? '']
    .filter(part => part !== '')
    .join('，')
  return {
    id: candidate.value,
    label: candidate.value,
    title,
    kind: argument.param.name,
    unavailable: candidate.unavailable ?? null,
  }
}

function argumentMenu(c: Composer, argument: ArgumentCompletion): Menu {
  const items = argument.items ?? []
  const more = items.length > SHOWN ? `，显示前 ${String(SHOWN)} 项` : ''
  return {
    items: items.slice(0, SHOWN).map(offer => candidateRow(argument, offer.candidate)),
    selected: c.selected,
    note: `/${argument.entry.name} 的${argument.param.name}，共 ${String(items.length)} 项${more}`,
  }
}

function menuOf(c: Composer): Menu | null {
  if (c.phase !== 'open') return null
  if (c.known.kind !== 'read') return { items: [], selected: 0, note: '现在取不到能点名的清单' }
  if (!named(c) && c.argument !== null) return argumentMenu(c, c.argument)
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

function argumentsLeft(c: Composer, lookup: Lookup): string {
  if (c.caret !== c.text.length) return ''
  const place = argumentAt(c.text, c.caret)
  if (place === null) return ''
  const named = lookup.entries.find(entry => entry.full === place.command)
  const entry = named ?? lookup.head.get(place.command)
  const left = (entry?.params ?? []).slice(place.query === '' ? place.index : place.index + 1)
  const words = left.map(param => (param.optional ? `[${param.name}]` : `<${param.name}>`))
  if (words.length === 0) return ''
  return `${place.query === '' ? '' : ' '}${words.join(' ')}`
}

function refusedBlock(c: Composer, recognition: Recognition): string | null {
  const whole = c.known.kind === 'read' && c.known.catalog.missing.length === 0
  return recognition.kind === 'refused' && (whole || recognition.reason === 'unavailable')
    ? refusalOf(recognition)
    : null
}

function ghostOf(c: Composer, lookup: Lookup): string {
  if (c.composing) return ''
  if (c.phase !== 'open') return argumentsLeft(c, lookup)
  if (c.selected !== 0) return ''
  if (named(c)) return c.found?.ghost ?? ''
  const top = c.argument?.items?.[0]?.candidate.value ?? ''
  const typed = c.argument?.query ?? ''
  return top.startsWith(typed) ? top.slice(typed.length) : ''
}

export function assistOf(c: Composer): Assist {
  if (c.known.kind !== 'read')
    return { marks: [], ghost: '', menu: menuOf(c), blocked: null, seen: null, asking: null }
  const { lookup } = c.known
  const recognition = recognize(c.text, lookup)
  return {
    marks: marksOf(recognition),
    ghost: ghostOf(c, lookup),
    menu: menuOf(c),
    blocked: refusedBlock(c, recognition) ?? argumentBlock(recognition, lookup, c.offered),
    seen: viewOf(recognition),
    asking: c.composing ? null : askingAt(c.text, c.caret, lookup),
  }
}

/** The words as they are: a command whose argument names no candidate still goes, for the server to judge. */
function asWritten(c: Composer, text: string): string {
  if (c.known.kind !== 'read') return literal(text)
  const recognition = recognize(text, c.known.lookup)
  const argumentOnly =
    refusedBlock(c, recognition) === null &&
    argumentBlock(recognition, c.known.lookup, c.offered) !== null
  return argumentOnly ? text : literal(text)
}

/** The words sent as they are: a backslash before the slash at the head keeps it from being a command. */
export function literal(text: string): string {
  const at = text.length - text.trimStart().length
  return text[at] === '/' ? `${text.slice(0, at)}\\${text.slice(at)}` : text
}

export type ComposerMachine = Readonly<{
  listed(catalog: Catalog | null): void
  offered(command: string, param: number, candidates: readonly Candidate[] | null): void
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
    offered: (command, param, candidates) => set(offeredTo(state, { command, param, candidates })),
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
    literal: text => asWritten(state, text),
  }
}
