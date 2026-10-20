// Walks the import graph of one module file. It reads static imports and re-exports, bare
// side-effect imports and dynamic `import()` calls. It follows relative imports and the root entry
// of `@omne-harness/*` workspace packages. It records every other bare specifier without
// following it. The scanner reads text and needs no compiler API: the `typescript` of this package
// is the native compiler, which has no script interface.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ModuleKind = 'javascript' | 'declaration'

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

/** Removes comments and masks string and template literals, except a string that names a module. */
function withoutComments(text: string): string {
  let out = ''
  for (let i = 0; i < text.length;) {
    const c = text[i] as string
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
    } else if (c === '"' || c === "'" || c === '`') {
      const start = i
      i += 1
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1
      i += 1
      out += namesModule(out) ? text.slice(start, i) : `${c}${c}`
    } else {
      out += c
      i += 1
    }
  }
  return out
}

/** True when the text so far ends where a module specifier string can start. */
function namesModule(before: string): boolean {
  return /(?:\bfrom|\bimport)\s*$|\bimport\s*\(\s*$/u.test(before)
}

const forms = [
  /\bimport\s+(?:type\s+)?(?:[\w$*{][^'"`;]*?\sfrom\s*)?(['"])([^'"]+)\1/gu,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+[\w$]+)?\s*from\s*(['"])([^'"]+)\1/gu,
  /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/gu,
]

/** Lists the module specifiers of one source text, in the order that they appear. */
export function specifiersOf(text: string): string[] {
  const clean = withoutComments(text)
  return forms
    .flatMap(form => [...clean.matchAll(form)])
    .sort((a, b) => (a.index as number) - (b.index as number))
    .map(match => match[2] as string)
}

function relativeTarget(from: string, specifier: string, kind: ModuleKind): string {
  const path = join(dirname(from), specifier)
  if (kind === 'declaration') return path.replace(/\.(ts|js)$/u, '.d.ts')
  return path.replace(/\.ts$/u, '.js')
}

/** Resolves `@omne-harness/<name>` through the `exports` of its manifest; other names stay unfollowed. */
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
  const target = conditions[kind === 'javascript' ? 'import' : 'types']
  if (target === undefined) throw new Error(`${name}${subpath} has no matching condition`)
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
