import { dirname, isAbsolute, join, relative, sep } from 'node:path'

/** Inputs are canonical host directories. The root is both the first candidate and the boundary. */
export function guidanceDirectories(root: string, visited: Iterable<string>): readonly string[] {
  const suffixes = new Set(['.'])
  for (const leaf of visited) {
    if (!isAbsolute(leaf)) continue
    const path = relative(root, leaf)
    if (path === '' || path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) continue
    for (let at = path; !suffixes.has(at); at = dirname(at)) suffixes.add(at)
  }
  suffixes.delete('.')
  return [root, ...[...suffixes].sort().map(path => join(root, path))]
}
