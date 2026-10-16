import { execFileSync } from 'node:child_process'
import { repositoryEnv } from './git-environment.ts'
import { git } from './git.ts'

function blobTexts(output: Buffer, ids: readonly string[]): Map<string, string> {
  const texts = new Map<string, string>()
  let offset = 0
  for (const id of ids) {
    const headerEnd = output.indexOf(10, offset)
    const [actual, type, bytes] = output.toString('ascii', offset, headerEnd).split(' ')
    const size = Number(bytes)
    const start = headerEnd + 1
    const end = start + size
    if (
      headerEnd < offset ||
      actual !== id ||
      type !== 'blob' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      end >= output.length ||
      output[end] !== 10
    )
      throw new Error(`Cannot read complete Git blob ${id}`)
    texts.set(id, output.toString('utf8', start, end))
    offset = end + 1
  }
  if (offset !== output.length) throw new Error('Unexpected trailing Git batch output')
  return texts
}

/** Read selected paths from one tree, by immutable blob IDs. No per-file Git processes or cache. */
export function readRevisionTexts(
  root: string,
  commit: string,
  paths: readonly string[],
): Map<string, string> {
  if (paths.length === 0) return new Map()
  const wanted = new Set(paths)
  const objects = new Map<string, string>()
  for (const entry of git(root, ['ls-tree', '-r', '-z', commit]).split('\0')) {
    const tab = entry.indexOf('\t')
    const path = entry.slice(tab + 1)
    if (!wanted.has(path)) continue
    const [, type, id] = entry.slice(0, tab).split(' ')
    if (type !== 'blob' || id === undefined) throw new Error(`Not a Git blob: ${path}`)
    objects.set(path, id)
  }
  for (const path of wanted)
    if (!objects.has(path)) throw new Error(`Cannot read ${path} from fixed commit ${commit}`)
  const ids = [...new Set(objects.values())]
  const output = execFileSync('git', ['cat-file', '--batch'], {
    env: repositoryEnv(process.env),
    cwd: root,
    input: `${ids.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const texts = blobTexts(output, ids)
  return new Map(paths.map(path => [path, texts.get(objects.get(path)!)!]))
}
