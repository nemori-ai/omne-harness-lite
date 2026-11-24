import { type Lookup, NAME_MAX } from './names.ts'

export type Span = readonly [number, number]
export type Reference = Readonly<{ name: string; span: Span; first: boolean }>
export type Note =
  | Readonly<{ kind: 'unavailable'; name: string; span: Span; reason: string }>
  | Readonly<{ kind: 'head-only'; name: string; span: Span }>

export type Message = Readonly<{
  kind: 'message'
  text: string
  references: readonly Reference[]
  notes: readonly Note[]
}>
export type Command = Readonly<{
  kind: 'command'
  name: string
  command: 'prompt' | 'system'
  span: Span
  args: string
}>
export type Refusal =
  | Readonly<{ kind: 'refused'; reason: 'no-such-command'; name: string; span: Span }>
  | Readonly<{ kind: 'refused'; reason: 'unavailable'; name: string; span: Span; why: string }>
export type Recognition = Message | Command | Refusal

const NAME = /[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)*/iy
const LEFT_BLOCK = /[A-Za-z0-9_/.:~<\\\-=&?#%@+$*]/u
const RIGHT_BLOCK = /[/_\\=@*]/u
const ALNUM = /[A-Za-z0-9]/u

/** Marks every character inside inline code or a fenced block. */
export function codeMask(text: string): Uint8Array {
  const mask = new Uint8Array(text.length)
  let fence = -1
  for (let at = 0; at < text.length;) {
    if (text.startsWith('```', at)) {
      if (fence < 0) fence = at
      else {
        mask.fill(1, fence, at + 3)
        fence = -1
      }
      at += 3
    } else if (fence < 0 && text[at] === '`') {
      const end = text.indexOf('`', at + 1)
      const line = text.indexOf('\n', at + 1)
      if (end > 0 && (line < 0 || end < line)) {
        mask.fill(1, at, end + 1)
        at = end + 1
      } else at += 1
    } else at += 1
  }
  if (fence >= 0) mask.fill(1, fence)
  return mask
}

function nameAt(text: string, at: number): { name: string; end: number } | null {
  NAME.lastIndex = at
  const hit = NAME.exec(text)
  if (hit === null || hit[0].length > NAME_MAX) return null
  return { name: hit[0].toLowerCase(), end: at + hit[0].length }
}

export const leftOk = (text: string, slash: number): boolean =>
  slash === 0 || !LEFT_BLOCK.test(text[slash - 1] ?? '')

export function rightOk(text: string, end: number): boolean {
  if (end >= text.length) return true
  const next = text[end] ?? ''
  if (RIGHT_BLOCK.test(next)) return false
  return !(next === '.' && ALNUM.test(text[end + 1] ?? ''))
}

export const firstInk = (text: string): number => text.length - text.trimStart().length

type Candidate = Readonly<{ name: string; span: Span }>

/** Whether a slash is a candidate depends on the text alone; the catalogue only decides what it binds. */
function* candidates(text: string, mask: Uint8Array, from: number): Generator<Candidate> {
  for (let at = from; at < text.length; at += 1) {
    if (text[at] !== '/' || mask[at] === 1 || !leftOk(text, at)) continue
    const hit = nameAt(text, at + 1)
    if (hit === null || !rightOk(text, hit.end)) continue
    yield { name: hit.name, span: [at, hit.end] }
    at = hit.end - 1
  }
}

function atHead(text: string, lookup: Lookup): Command | Refusal | null {
  const start = firstInk(text)
  if (text[start] !== '/') return null
  const hit = nameAt(text, start + 1)
  if (hit === null || !rightOk(text, hit.end)) return null
  const span: Span = [start, hit.end]
  const entry = lookup.head.get(hit.name)
  if (entry === undefined)
    return { kind: 'refused', reason: 'no-such-command', name: hit.name, span }
  if (entry.unavailable !== undefined)
    return {
      kind: 'refused',
      reason: 'unavailable',
      name: entry.full,
      span,
      why: entry.unavailable,
    }
  if (entry.kind === 'reference') return null
  return {
    kind: 'command',
    name: entry.full,
    command: entry.kind,
    span,
    args: text.slice(hit.end).trim(),
  }
}

/** What one input means under one catalogue. The answer is data; nothing is sent here. */
export function recognize(text: string, lookup: Lookup): Recognition {
  const mask = codeMask(text)
  const head = atHead(text, lookup)
  if (head !== null) return head
  const references: Reference[] = []
  const notes: Note[] = []
  const seen = new Set<string>()
  for (const { name, span } of candidates(text, mask, firstInk(text))) {
    const entry = lookup.mid.get(name)
    const other = lookup.head.get(name)
    if (entry === undefined) {
      if (other !== undefined) notes.push({ kind: 'head-only', name: other.full, span })
    } else if (entry.unavailable !== undefined)
      notes.push({ kind: 'unavailable', name: entry.full, span, reason: entry.unavailable })
    else {
      references.push({ name: entry.full, span, first: !seen.has(entry.full) })
      seen.add(entry.full)
    }
  }
  return { kind: 'message', text: unescape(text, mask), references, notes }
}

/** `\/` is a slash meant as text; the text handed on drops the backslash. */
export function unescape(text: string, mask: Uint8Array = codeMask(text)): string {
  let out = ''
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '\\' && text[at + 1] === '/' && mask[at] !== 1) continue
    out += text[at]
  }
  return out
}
