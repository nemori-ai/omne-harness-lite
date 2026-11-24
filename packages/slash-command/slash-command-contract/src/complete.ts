import { type Lookup, type NamedEntry, placeOf, rankOf, shortAt, type Zone } from './names.ts'
import { codeMask, firstInk, leftOk, recognize, rightOk } from './recognize.ts'

export type Tier = 0 | 1 | 2 | 3 | 4
export const TIERS = [
  '一模一样',
  '开头相同',
  '某一段的开头',
  '首字母或跳着匹配',
  '说明里有',
] as const

export type CompletionIndex = Readonly<{
  byName: readonly NamedEntry[]
  segments: readonly Readonly<{ key: string; entry: NamedEntry }>[]
}>
export type Found = Readonly<{ entry: NamedEntry; tier: Tier }>
export type Typing = Readonly<{
  slash: number
  from: number
  to: number
  query: string
  zone: Zone
}>
export type Item = Found & Readonly<{ shown: string }>
export type Completion = Typing & Readonly<{ total: number; items: readonly Item[]; ghost: string }>

const SCAN = 400
const nonAscii = (text: string): boolean =>
  text !== '' && [...text].every(char => (char.codePointAt(0) ?? 0) > 0x7f)
const isNameChar = (char: string): boolean => /^[A-Za-z0-9:-]$/u.test(char) || nonAscii(char)
const byKey =
  <T>(key: (value: T) => string) =>
  (a: T, b: T): number =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0

function lowerBound<T>(list: readonly T[], key: string, of: (value: T) => string): number {
  let low = 0
  let high = list.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (of(list[middle] as T) < key) low = middle + 1
    else high = middle
  }
  return low
}

export function indexOf(lookup: Lookup): CompletionIndex {
  const byName = [...lookup.entries].sort(byKey(entry => entry.name))
  const segments: { key: string; entry: NamedEntry }[] = []
  for (const entry of byName) {
    let at = 0
    entry.name.split('-').forEach((part, n) => {
      if (n > 0) segments.push({ key: entry.name.slice(at), entry })
      at += part.length + 1
    })
    segments.push({ key: entry.full, entry })
  }
  return { byName, segments: segments.sort(byKey(segment => segment.key)) }
}

/** The first letters of the name's parts, or its letters in order. */
function loose(query: string, name: string): boolean {
  if (
    query.length >= 2 &&
    name
      .split('-')
      .map(part => part[0])
      .join('')
      .startsWith(query)
  )
    return true
  if (query.length < 3 || name[0] !== query[0]) return false
  let at = 0
  for (let n = 0; n < name.length && at < query.length; n += 1) if (name[n] === query[at]) at += 1
  return at === query.length
}

export function search(
  index: CompletionIndex,
  query: string,
  zone: Zone,
  limit = 8,
): Readonly<{ total: number; items: readonly Found[] }> {
  const found = new Map<string, Found>()
  const put = (entry: NamedEntry, tier: Tier): void => {
    if ((zone === 'head' || placeOf(entry.kind) === 'anywhere') && !found.has(entry.full))
      found.set(entry.full, { entry, tier })
  }
  if (/^[a-z0-9:-]*$/u.test(query)) {
    for (
      let at = lowerBound(index.byName, query, entry => entry.name);
      at < index.byName.length;
      at += 1
    ) {
      const entry = index.byName[at] as NamedEntry
      if (!entry.name.startsWith(query) || found.size >= SCAN) break
      put(entry, entry.name === query ? 0 : 1)
    }
    if (query !== '') {
      for (
        let at = lowerBound(index.segments, query, segment => segment.key);
        at < index.segments.length;
        at += 1
      ) {
        const segment = index.segments[at] as { key: string; entry: NamedEntry }
        if (!segment.key.startsWith(query)) break
        put(segment.entry, 2)
      }
      if (found.size < limit)
        for (const entry of index.byName) if (loose(query, entry.name)) put(entry, 3)
    }
  }
  if (query !== '' && found.size < limit)
    for (const entry of index.byName) if (entry.title.toLowerCase().includes(query)) put(entry, 4)
  const items = [...found.values()].sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(a.entry.unavailable !== undefined) - Number(b.entry.unavailable !== undefined) ||
      rankOf(a.entry.kind) - rankOf(b.entry.kind) ||
      (query === '' ? 0 : a.entry.name.length - b.entry.name.length) ||
      byKey<Found>(one => one.entry.name)(a, b),
  )
  return { total: items.length, items: items.slice(0, limit) }
}

/** Which part of the input is a name being typed, given the caret. */
export function typing(text: string, caret: number): Typing | null {
  let from = caret
  while (from > 0 && isNameChar(text[from - 1] ?? '')) from -= 1
  if (from === 0 || text[from - 1] !== '/') return null
  const slash = from - 1
  const query = text.slice(from, caret)
  if (!/^[A-Za-z0-9:-]*$/u.test(query) && !nonAscii(query)) return null
  if (codeMask(text)[slash] === 1 || !leftOk(text, slash)) return null
  return {
    slash,
    from,
    to: caret,
    query: query.toLowerCase(),
    zone: slash === firstInk(text) ? 'head' : 'mid',
  }
}

const nameEnd = (text: string, from: number): number => {
  let end = from
  while (end < text.length && isNameChar(text[end] ?? '')) end += 1
  return end
}

export function complete(
  text: string,
  caret: number,
  index: CompletionIndex,
  lookup: Lookup,
): Completion | null {
  const at = typing(text, caret)
  if (at === null) return null
  if (at.zone === 'mid' && recognize(text.slice(0, at.slash), lookup).kind === 'command')
    return null
  const found = search(index, at.query, at.zone)
  const items = found.items.map(item => ({ ...item, shown: shortAt(lookup, at.zone, item.entry) }))
  const top = items[0]
  const ghost =
    top !== undefined &&
    at.query !== '' &&
    top.entry.unavailable === undefined &&
    top.shown.startsWith(at.query) &&
    caret === nameEnd(text, at.from)
      ? top.shown.slice(at.query.length)
      : ''
  return { ...at, total: found.total, items, ghost }
}

/** Taking an item writes its shortest spelling and keeps it apart from what follows. */
export function accept(
  text: string,
  completion: Completion,
  item: Item,
): Readonly<{ text: string; caret: number }> {
  const end = nameEnd(text, completion.from)
  const tail = text.slice(end)
  const apart =
    tail === '' ||
    !rightOk(`x${tail}`, 1) ||
    /^[A-Za-z0-9:-]/u.test(tail) ||
    (placeOf(item.entry.kind) === 'head' && !/^\s/u.test(tail))
  const gap = apart ? ' ' : ''
  return {
    text: text.slice(0, completion.from) + item.shown + gap + tail,
    caret: completion.from + item.shown.length + gap.length,
  }
}
