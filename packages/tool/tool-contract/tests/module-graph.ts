// Walks the import graph of one module file. It reads static imports and re-exports, bare
// side-effect imports and dynamic `import()` calls. It follows relative imports and the root or
// subpath entries of `@omne-harness/*` workspace packages. It records every other bare
// specifier without following it.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export type ModuleKind = 'source' | 'javascript' | 'declaration'

export type ModuleGraph = Readonly<{
  /** Absolute paths of every module that the walk reached, the entry included. */
  files: ReadonlySet<string>
  /** Every specifier that the walk saw, with the file that imports it. */
  imports: readonly Readonly<{ from: string; specifier: string }>[]
}>

const memberRoot = fileURLToPath(new URL('..', import.meta.url))

export function memberPath(path: string): string {
  return join(memberRoot, path)
}

export function walkModules(entry: string, kind: ModuleKind): ModuleGraph {
  const files = new Set<string>()
  const imports: { from: string; specifier: string }[] = []
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      imports.push({ from: file, specifier })
      const target = specifier.startsWith('.')
        ? relativeTarget(file, specifier, kind)
        : workspaceTarget(file, specifier, kind)
      if (target !== undefined) pending.push(target)
    }
  }
  return { files, imports }
}

/** Lists the module specifiers of one source text, in the order that they appear. */
export function specifiersOf(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map(reference => reference.fileName)
}

function relativeTarget(from: string, specifier: string, kind: ModuleKind): string {
  const path = join(dirname(from), specifier)
  if (kind === 'declaration') return path.replace(/\.(ts|js)$/u, '.d.ts')
  if (kind === 'javascript') return path.replace(/\.ts$/u, '.js')
  return path
}

/** Resolves `@omne-harness/<name>[/<subpath>]` through the package manifest `exports`. */
function workspaceTarget(from: string, specifier: string, kind: ModuleKind): string | undefined {
  const match = /^(@omne-harness\/[^/]+)(\/.+)?$/u.exec(specifier)
  if (match === null) return undefined
  const name = match[1] as string
  const subpath = match[2] === undefined ? '.' : `.${match[2]}`
  const directory = packageDirectory(from, name)
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    exports?: Record<string, Record<string, string>>
  }
  const conditions = manifest.exports?.[subpath]
  if (conditions === undefined) throw new Error(`${name} does not export ${subpath}`)
  const condition = kind === 'source' ? 'source' : kind === 'javascript' ? 'import' : 'types'
  const target = conditions[condition]
  if (target === undefined) throw new Error(`${name}${subpath} has no ${condition} condition`)
  return join(directory, target)
}

function packageDirectory(from: string, name: string): string {
  for (let directory = dirname(from); ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(directory) === directory) throw new Error(`cannot find ${name} from ${from}`)
  }
}

/** Describes an import edge for an assertion message. */
export function describeImport(edge: Readonly<{ from: string; specifier: string }>): string {
  return `${relative(memberRoot, edge.from)} -> ${edge.specifier}`
}
