import { resolve } from 'node:path'
import { ownerOf, type WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'
import { fields, IntegrationError, json, safePath, string } from '../integration/parse.ts'
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
 * The engineering method and verification text. A read conflict on these paths does not stop:
 * the reader consumes the version at the wave's freeze point. `trees` are whole directories or
 * files; `pageTrees` count only their `*.md` pages, so source and configuration below them stay
 * product semantics. Every other path is product semantics, and a read conflict on it stops.
 */
export const FROZEN_READ_PATHS = {
  trees: [
    '.meta_harness/agents',
    'docs/engineering',
    'docs/development.md',
    'docs/verification.md',
  ],
  pageTrees: ['tools', 'scripts'],
  pageSuffix: '.md',
} as const

/** True when `path` lies in the engineering method and verification text of `FROZEN_READ_PATHS`. */
export function frozenReadPath(path: string): boolean {
  const { trees, pageTrees, pageSuffix } = FROZEN_READ_PATHS
  return (
    trees.some(tree => under(path, tree)) ||
    (path.endsWith(pageSuffix) && pageTrees.some(tree => under(path, tree)))
  )
}

/**
 * Splits read conflicts by the narrower of the two paths, the range both cards touch. One path
 * always lies below or equals the other. `stopping` keeps the conflicts on product semantics,
 * `frozen` the conflicts on engineering method and verification text. Both keep the input order.
 */
export function classifyReadConflicts(conflicts: readonly ReadConflict[]): {
  stopping: ReadConflict[]
  frozen: ReadConflict[]
} {
  const stopping: ReadConflict[] = [],
    frozen: ReadConflict[] = []
  for (const conflict of conflicts) {
    const narrower = under(conflict.writePath, conflict.readPath)
      ? conflict.writePath
      : conflict.readPath
    ;(frozenReadPath(narrower) ? frozen : stopping).push(conflict)
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
