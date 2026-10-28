import { matchesGlob, resolve } from 'node:path'
import { ownerOf, type WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'
import {
  array,
  fields,
  IntegrationError,
  json,
  object,
  safePath,
  string,
  strings,
} from '../integration/parse.ts'
import { under } from './lines.ts'
import type { ScopeEntries } from './scope-overlap.ts'

/**
 * A read-set file: the pages one card reads besides its own workspace members. `source` names
 * the card it belongs to: `#<Issue number>` or the path of a binding file given in the same run.
 */
export type ReadSetFile = { path: string; source: string; reads: string[] }
/** One card's counted write entries with the pages its read-set file adds. */
export type ReadSetCard = { source: string; counted: readonly string[]; pages: readonly string[] }
/**
 * `members` holds the paths of the workspace members the card writes and their transitive
 * workspace dependencies; `pages` holds the paths from its read-set file.
 */
export type ReadSet = { source: string; members: string[]; pages: string[] }
/** A counted write entry of `writer` that equals or contains, or lies below, a read of `reader`. */
export type ReadConflict = { writer: string; reader: string; writePath: string; readPath: string }

/**
 * The engineering method and verification text: the pages that people and agents read. A read
 * conflict on them does not stop, because the reader consumes the version at the wave's freeze
 * point. A file is such a page only when all three hold: it lies in one of `areas`; it ends with
 * `pageSuffix` or matches `skillStrategy`, the skill adapter files that only decide how a skill is
 * projected to a host; and no pattern of `REGISTERED_READ_PATTERNS` matches it, since those files
 * are read by code. Every other file is product semantics, and a read conflict on it stops.
 */
export const FROZEN_READ_PATHS = {
  areas: [
    '.meta_harness/agents',
    'docs/engineering',
    'docs/development.md',
    'docs/verification.md',
    'tools',
    'scripts',
  ],
  pageSuffix: '.md',
  skillStrategy: '.meta_harness/agents/skills/*/adapters/**/strategy.yaml',
} as const

/**
 * The test-runs configuration and the parts of its `affected` object that name files read by
 * code: the paths of each reader rule and the global paths. `pythonPaths` is not among them: it
 * names where a change runs pytest, not data that a card's code reads at run time.
 */
export const REGISTERED_READ_PATTERNS = {
  config: 'tools/test-runner/test-runs.config.json',
  fields: ['affected.readers[].paths', 'affected.globalPaths'],
} as const

/** Reads the reader rule paths and the global paths from parsed test-runs configuration. */
export function registeredReadPatterns(value: unknown, path: string): string[] {
  const affected = object(object(value, path).affected, `${path}: affected`)
  return [
    ...array(affected.readers, `${path}: affected.readers`).flatMap((reader, index) =>
      strings(
        object(reader, `${path}: affected.readers[${index}]`).paths,
        `${path}: affected.readers[${index}].paths`,
      ),
    ),
    ...strings(affected.globalPaths, `${path}: affected.globalPaths`),
  ]
}

/** A `.` that starts a path segment. */
const DOT_SEGMENT = /(^|\/)\./gu
/**
 * True when the registered `pattern` matches `file`. It calls `matchesGlob` from `node:path`
 * after it replaces the `.` that starts each segment, in both, with the same other character. So
 * `*` and `**` also match segments that start with `.`, as the test runner's patterns do.
 */
export function matchesRegistered(file: string, pattern: string): boolean {
  const hide = (value: string) => value.replace(DOT_SEGMENT, '$1\u0001')
  return matchesGlob(hide(file), hide(pattern))
}

/**
 * Why `file` is not a frozen page, or undefined when it is one. `registered` holds the patterns
 * of `registeredReadPatterns`, matched with `matchesRegistered`.
 */
export function frozenPageStop(file: string, registered: readonly string[]): string | undefined {
  const { areas, pageSuffix, skillStrategy } = FROZEN_READ_PATHS
  if (!areas.some(area => under(file, area)))
    return 'outside the engineering method and verification areas'
  if (!file.endsWith(pageSuffix) && !matchesGlob(file, skillStrategy))
    return `neither a ${pageSuffix} page nor a skill adapter strategy.yaml`
  const pattern = registered.find(item => matchesRegistered(file, item))
  return pattern === undefined
    ? undefined
    : `read by code: ${REGISTERED_READ_PATTERNS.config} registers ${pattern}`
}

/**
 * The narrower of the two paths of a conflict: the range both cards touch. Throws when neither
 * path equals or contains the other, which `readOverlap` never produces.
 */
export function narrowerReadPath(conflict: ReadConflict): string {
  if (under(conflict.writePath, conflict.readPath)) return conflict.writePath
  if (under(conflict.readPath, conflict.writePath)) return conflict.readPath
  throw new IntegrationError(
    'invariant',
    `read conflict ${conflict.writePath} -> ${conflict.readPath}: neither path contains the other`,
  )
}

/**
 * What classification reads from the freeze point: the registered patterns and every tracked
 * file. `unknown` gives the reason when the caller could not read them.
 */
export type ReadBasis =
  | { registered: readonly string[]; tracked: readonly string[] }
  | { unknown: string }
/** A stopping conflict names the first file that is not a frozen page, when one is known. */
export type StoppingReadConflict = ReadConflict & { file?: string; reason: string }

/**
 * Splits read conflicts by the narrower of the two paths. When tracked files lie below that path,
 * it is a directory and each file is checked; otherwise the path itself is. A conflict is frozen
 * only when every checked file is a frozen page. `stopping` names the first file that is not, or
 * the reason the basis is unknown. Both lists keep the input order.
 */
export function classifyReadConflicts(
  conflicts: readonly ReadConflict[],
  basis: ReadBasis,
): { stopping: StoppingReadConflict[]; frozen: ReadConflict[] } {
  const stopping: StoppingReadConflict[] = [],
    frozen: ReadConflict[] = []
  for (const conflict of conflicts) {
    const narrower = narrowerReadPath(conflict)
    if ('unknown' in basis) {
      stopping.push({ ...conflict, reason: `cannot classify: ${basis.unknown}` })
      continue
    }
    const below = basis.tracked.filter(file => under(file, narrower))
    const files = below.length === 0 ? [narrower] : below
    const stop = files
      .map(file => ({ file, reason: frozenPageStop(file, basis.registered) }))
      .find(item => item.reason !== undefined)
    if (stop === undefined) frozen.push(conflict)
    else stopping.push({ ...conflict, file: stop.file, reason: `${stop.file}: ${stop.reason}` })
  }
  return { stopping, frozen }
}

/**
 * Reads a read-set file: a JSON object with a `reads` array. Returns undefined for any other
 * content, which the caller reads as a binding file.
 */
export function parseReadSetFile(path: string, content: string): ReadSetFile | undefined {
  if (!content.trimStart().startsWith('{')) return undefined
  const value = json(content, path)
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, 'reads'))
    return undefined
  const v = fields(value, ['source', 'reads'], path)
  if (!Array.isArray(v.reads))
    throw new IntegrationError('input-error', `${path}: reads must be an array`)
  return {
    path,
    source: string(v.source, `${path}: source`),
    reads: v.reads.map(item => safePath(item, `${path}: reads`)),
  }
}

/** `#<n>` names an Issue; any other source is a file path, compared after resolving it on `base`. */
function sourceKey(source: string, base: string): string {
  return /^#[1-9]\d*$/.test(source) ? source : resolve(base, source)
}
/**
 * Maps each card source to the reads of its read-set file. File sources resolve against `base`,
 * the directory the command line paths are relative to. A file whose source names no card, or a
 * second file for one card, is an input error.
 */
export function assignReadSets(
  sources: readonly string[],
  files: readonly ReadSetFile[],
  base: string,
): Map<string, string[]> {
  const byKey = new Map(sources.map(source => [sourceKey(source, base), source]))
  const pages = new Map<string, string[]>()
  for (const file of files) {
    const source = byKey.get(sourceKey(file.source, base))
    if (source === undefined)
      throw new IntegrationError(
        'input-error',
        `${file.path}: source ${file.source} names no card of this run`,
      )
    if (pages.has(source))
      throw new IntegrationError('input-error', `${source} has more than one read-set file`)
    pages.set(source, file.reads)
  }
  return pages
}

/**
 * The read set of each card: the workspace members its counted write entries lie in, closed
 * over declared workspace dependencies, plus its pages. An entry outside every member adds no
 * member. Members keep the order of `members`.
 */
export function readSets(
  cards: readonly ReadSetCard[],
  members: readonly WorkspaceMember[],
): ReadSet[] {
  const byName = new Map(members.map(member => [member.name, member]))
  return cards.map(card => {
    const reached = new Set<WorkspaceMember>()
    const pending = card.counted.flatMap(path => {
      // ownerOf only matches paths strictly below a member; an entry naming the member itself counts too.
      const owner = members.find(member => member.path === path) ?? ownerOf(path, members)
      return owner === undefined ? [] : [owner]
    })
    for (let member = pending.pop(); member !== undefined; member = pending.pop()) {
      if (reached.has(member)) continue
      reached.add(member)
      for (const name of member.dependencies) {
        const dependency = byName.get(name)
        if (dependency !== undefined) pending.push(dependency)
      }
    }
    return {
      source: card.source,
      members: members.filter(member => reached.has(member)).map(member => member.path),
      pages: [...card.pages],
    }
  })
}

/**
 * Intersects the counted write entries of each card with the read sets of the other cards, in
 * both directions. A card's own read set is not compared with its own writes.
 */
export function readOverlap(
  entries: readonly ScopeEntries[],
  sets: readonly ReadSet[],
): ReadConflict[] {
  return entries.flatMap(writer =>
    sets
      .filter(reader => reader.source !== writer.source)
      .flatMap(reader =>
        writer.counted.flatMap(writePath =>
          [...reader.members, ...reader.pages]
            .filter(readPath => under(writePath, readPath) || under(readPath, writePath))
            .map(readPath => ({
              writer: writer.source,
              reader: reader.source,
              writePath,
              readPath,
            })),
        ),
      ),
  )
}
