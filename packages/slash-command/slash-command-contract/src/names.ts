export type EntryKind = 'reference' | 'prompt' | 'system'
export type Place = 'anywhere' | 'head'
export type Zone = 'head' | 'mid'

/** One argument of a command: its name, whether it may be left out, and whether its source answers candidates for it. */
export type Param = Readonly<{ name: string; optional?: true; candidates?: true }>

export type CommandEntry = Readonly<{
  space: string
  name: string
  kind: EntryKind
  title: string
  hint?: string
  params?: readonly Param[]
  unavailable?: string
  whileRunning?: 'now' | 'refuse'
  takesEffect?: 'now' | 'next-request' | 'next-run'
}>

export type Catalog = Readonly<{ entries: readonly CommandEntry[]; missing: readonly string[] }>

export type NamedEntry = CommandEntry & Readonly<{ full: string }>

export type Lookup = Readonly<{
  head: ReadonlyMap<string, NamedEntry>
  mid: ReadonlyMap<string, NamedEntry>
  entries: readonly NamedEntry[]
  missing: readonly string[]
}>

export const NAME_MAX = 64
export const RESERVED_SPACE = 'omne-official'
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const RANK: Readonly<Record<EntryKind, number>> = { system: 0, prompt: 1, reference: 2 }

export const isName = (text: string): boolean => SEGMENT.test(text)
export const fullName = (entry: Pick<CommandEntry, 'space' | 'name'>): string =>
  `${entry.space}:${entry.name}`
export const placeOf = (kind: EntryKind): Place => (kind === 'reference' ? 'anywhere' : 'head')
export const rankOf = (kind: EntryKind): number => RANK[kind]

export function isFullName(text: string): boolean {
  const colon = text.indexOf(':')
  return (
    colon > 0 &&
    text.length <= NAME_MAX &&
    isName(text.slice(0, colon)) &&
    isName(text.slice(colon + 1))
  )
}

/** Full names never collide; two entries that claim one full name both drop out. */
export function lookupOf(catalog: Catalog): Lookup {
  const counted = new Map<string, number>()
  for (const entry of catalog.entries)
    counted.set(fullName(entry), (counted.get(fullName(entry)) ?? 0) + 1)
  const entries = catalog.entries
    .filter(entry => isFullName(fullName(entry)) && counted.get(fullName(entry)) === 1)
    .map(entry => ({ ...entry, full: fullName(entry) }))
  const head = new Map<string, NamedEntry>()
  const mid = new Map<string, NamedEntry>()
  for (const entry of [...entries].sort((x, y) => rankOf(x.kind) - rankOf(y.kind))) {
    head.set(entry.full, entry)
    if (!head.has(entry.name)) head.set(entry.name, entry)
    if (placeOf(entry.kind) !== 'anywhere') continue
    mid.set(entry.full, entry)
    mid.set(entry.name, entry)
  }
  return { head, mid, entries, missing: catalog.missing }
}

/** The shortest spelling that names this entry where it stands. */
export const shortAt = (lookup: Lookup, zone: Zone, entry: NamedEntry): string =>
  lookup[zone].get(entry.name) === entry ? entry.name : entry.full
