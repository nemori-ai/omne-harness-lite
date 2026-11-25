import { type ArgumentPlace, argumentAt, splitArguments } from './arguments.ts'
import { type Tier, tierOf } from './complete.ts'
import type { Lookup, NamedEntry, Param } from './names.ts'
import type { Recognition } from './recognize.ts'
import type { Candidate } from './source.ts'

/** Which argument's candidates the composer wants: a command by its full name, and the argument's place. */
export type Asking = Readonly<{ command: string; param: number }>

/** The candidates the composer holds: those of the argument last asked, or null when none were to be had. */
export type Offered = Asking & Readonly<{ candidates: readonly Candidate[] | null }>

export type Offer = Readonly<{ candidate: Candidate; tier: Tier }>

/** The argument at the caret, when its command says it has candidates; items are null until they are held. */
export type ArgumentCompletion = ArgumentPlace &
  Readonly<{ entry: NamedEntry; param: Param; items: readonly Offer[] | null }>

const SEPARATORS = '-/'

const entryAt = (lookup: Lookup, command: string): NamedEntry | undefined =>
  lookup.entries.find(entry => entry.full === command) ?? lookup.head.get(command)

function placed(text: string, caret: number, lookup: Lookup) {
  const place = argumentAt(text, caret)
  const entry = place === null ? undefined : entryAt(lookup, place.command)
  const param = place === null ? undefined : entry?.params?.[place.index]
  return place === null || entry === undefined || param?.candidates !== true
    ? null
    : { place, entry, param }
}

export function askingAt(text: string, caret: number, lookup: Lookup): Asking | null {
  const at = placed(text, caret, lookup)
  return at === null ? null : { command: at.entry.full, param: at.place.index }
}

function tierOfCandidate(query: string, candidate: Candidate): Tier | null {
  const typed = query.toLowerCase()
  const tier = tierOf(typed, candidate.value.toLowerCase(), SEPARATORS)
  if (tier !== null) return tier
  return typed !== '' && (candidate.title ?? '').toLowerCase().includes(typed) ? 6 : null
}

/** The candidates that match what is typed, most alike first; ties keep the order the owner gave. */
export function rankCandidates(candidates: readonly Candidate[], query: string): readonly Offer[] {
  return candidates
    .map((candidate, at) => ({ candidate, at, tier: tierOfCandidate(query, candidate) }))
    .filter((offer): offer is Offer & { at: number } => offer.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.at - b.at)
    .map(({ candidate, tier }) => ({ candidate, tier }))
}

export function argumentCompletion(
  text: string,
  caret: number,
  lookup: Lookup,
  offered: Offered | null,
): ArgumentCompletion | null {
  const at = placed(text, caret, lookup)
  if (at === null) return null
  const held =
    offered?.command === at.entry.full && offered.param === at.place.index
      ? offered.candidates
      : null
  return {
    ...at.place,
    entry: at.entry,
    param: at.param,
    items: held === null ? null : rankCandidates(held, at.place.query),
  }
}

/** The words with the argument at the caret replaced by the whole value; a space follows when more arguments come. */
export function acceptCandidate(
  text: string,
  found: ArgumentCompletion,
  candidate: Candidate,
): Readonly<{ text: string; caret: number }> {
  const value = /\s/u.test(candidate.value) ? `"${candidate.value}"` : candidate.value
  const after = text.slice(found.to)
  const more = (found.entry.params?.length ?? 0) > found.index + 1 && !/^\s/u.test(after)
  const space = more ? ' ' : ''
  return {
    text: `${text.slice(0, found.from)}${value}${space}${after}`,
    caret: found.from + value.length + space.length,
  }
}

/** Why a command cannot go as written: an argument with candidates names none of them, or one not to be chosen now. */
export function argumentBlock(
  recognition: Recognition,
  lookup: Lookup,
  offered: Offered | null,
): string | null {
  if (recognition.kind !== 'command' || offered === null || offered.candidates === null) return null
  const entry = entryAt(lookup, recognition.name)
  const param = entry?.params?.[offered.param]
  if (entry?.full !== offered.command || param?.candidates !== true) return null
  const word = splitArguments(recognition.args)[offered.param]
  if (word === undefined || word.value === '') return null
  const hit = offered.candidates.find(candidate => candidate.value === word.value)
  if (hit === undefined) return `「${word.value}」不在 /${entry.name} 的${param.name}候选里`
  return hit.unavailable === undefined ? null : `「${word.value}」此刻不能选：${hit.unavailable}`
}
