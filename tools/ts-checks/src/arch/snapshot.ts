import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileAt, git } from '../metrics/git.ts'
import { memberOf, type Member } from '../metrics/graph.ts'
import type { Snapshot } from './model.ts'

const ignored = new Set(['node_modules', 'dist', 'coverage', '.git'])
const retained = (path: string) =>
  /^(packages|apps)\//u.test(path) && (/\.[cm]?tsx?$/u.test(path) || path.endsWith('/package.json'))

export function snapshotOf(texts: ReadonlyMap<string, string>): Snapshot {
  const members = new Map<string, Member>()
  for (const path of texts.keys()) {
    if (!path.endsWith('/package.json')) continue
    const member = memberOf(path)
    if (member !== undefined && member.group !== 'examples') members.set(member.path, member)
  }
  return { texts, members: [...members.values()].sort((a, b) => a.path.localeCompare(b.path)) }
}

/** Full revision source set, including files deleted or moved in the working tree. */
export function readSnapshot(root: string, nodeRoot: string, revision?: string): Snapshot {
  const texts = new Map<string, string>()
  const wanted = (path: string) =>
    retained(path) || path.startsWith(`${nodeRoot}/`) || path === 'tsconfig.base.json'
  if (revision !== undefined) {
    for (const path of git(root, ['ls-tree', '-r', '--name-only', revision]).split('\n')) {
      if (!wanted(path)) continue
      const text = fileAt(root, revision, path)
      if (text !== undefined) texts.set(path, text)
    }
  } else {
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile()) {
          const path = relative(root, full).replaceAll('\\', '/')
          if (wanted(path)) texts.set(path, readFileSync(full, 'utf8'))
        }
      }
    }
    for (const top of ['packages', 'apps', nodeRoot])
      if (statSync(join(root, top), { throwIfNoEntry: false })?.isDirectory()) walk(join(root, top))
    if (statSync(join(root, 'tsconfig.base.json'), { throwIfNoEntry: false })?.isFile())
      texts.set('tsconfig.base.json', readFileSync(join(root, 'tsconfig.base.json'), 'utf8'))
  }
  return snapshotOf(texts)
}
