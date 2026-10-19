// Compares the exports that a built package really publishes with the machine-readable inventory
// in fixtures/exports.json. It reads the compiled `.d.ts` entries through the TypeScript 6
// compiler API, so `export *` chains are resolved and value and type exports stay apart. The
// inventory describes what a consumer can import. The functions at the end read the public-api page
// and the source files that its chapters link, never the declarations of the page.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import ts from '@typescript/typescript6'

export type ExportKind = 'type' | 'value' | 'class'

export type InventoryName = Readonly<{
  name: string
  kind: ExportKind
  /** True while the accepted declaration has no implementation in the built entry yet. */
  pending: boolean
  /** Set when another entry owns the declaration and this entry only re-exports it. */
  sameAs?: string
}>

export type InventoryChapter = Readonly<{ title: string; names: readonly InventoryName[] }>

export type Inventory = Readonly<{
  package: string
  source: string
  /**
   * Names that the inventory flags `pending`, summed over all entries. A stage that lands names
   * lowers it in the same change, so a flag cannot be flipped or deleted unnoticed.
   */
  expectedPending: number
  entries: Readonly<Record<string, Readonly<{ chapters: readonly InventoryChapter[] }>>>
  /** Module augmentations (`declare module`): not exports, so they are compared separately. */
  augmentations: readonly Augmentation[]
}>

export type Augmentation = Readonly<{
  module: string
  interface: string
  members: readonly string[]
  pending: boolean
  /**
   * Members that are already built while the augmentation as a whole is still pending. The built
   * set must equal this list exactly, so a pending augmentation cannot grow unnoticed. Every name
   * must also be one of `members`, so a misnamed built member is not accepted for a listed one.
   */
  landed?: readonly string[]
}>

export type EntryComparison = Readonly<{
  entry: string
  declaration: string
  /** Inventory names that are not pending but the entry does not export. */
  missing: readonly string[]
  /** Entry exports that the inventory does not list. */
  extra: readonly string[]
  /** Names flagged pending that the entry already exports: flip the flag. */
  stalePending: readonly string[]
  /** Names exported with a different kind than the inventory states. */
  kindMismatch: readonly string[]
  /** Re-exports whose declaration is not the one of the owning entry. */
  notSameDeclaration: readonly string[]
  total: number
  pending: number
}>

export function loadInventory(path: string): Inventory {
  return JSON.parse(readFileSync(path, 'utf8')) as Inventory
}

export function namesOf(entry: Inventory['entries'][string]): readonly InventoryName[] {
  return entry.chapters.flatMap(chapter => chapter.names)
}

function kindOf(symbol: ts.Symbol): ExportKind | 'both' {
  const flags = symbol.flags
  if (flags & ts.SymbolFlags.Class) return 'class'
  const isValue = (flags & ts.SymbolFlags.Value) !== 0
  const isType = (flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Interface)) !== 0
  if (isValue && isType) return 'both'
  return isValue ? 'value' : 'type'
}

/**
 * Compares the entries of one built package with its inventory. `declarations` maps an entry
 * subpath (`.`, `./cordis`) to the absolute path of its built declaration file.
 */
export function compareEntries(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): EntryComparison[] {
  const roots = Object.values(declarations)
  const program = ts.createProgram(roots, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const exportsByEntry = new Map<string, Map<string, ts.Symbol>>()
  for (const [entry, path] of Object.entries(declarations)) {
    const file = program.getSourceFile(path)
    const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (module === undefined) throw new Error(`${path} is not a module declaration file`)
    exportsByEntry.set(
      entry,
      new Map(checker.getExportsOfModule(module).map(symbol => [symbol.name, symbol])),
    )
  }
  const resolved = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

  return Object.entries(inventory.entries).map(([entry, value]) => {
    const exported = exportsByEntry.get(entry)
    const declaration = declarations[entry]
    if (exported === undefined || declaration === undefined)
      throw new Error(`no built declaration file given for entry ${entry}`)
    const listed = namesOf(value)
    const missing: string[] = []
    const stalePending: string[] = []
    const kindMismatch: string[] = []
    const notSameDeclaration: string[] = []
    for (const item of listed) {
      const symbol = exported.get(item.name)
      if (symbol === undefined) {
        if (!item.pending) missing.push(item.name)
        continue
      }
      if (item.pending) stalePending.push(item.name)
      const actual = kindOf(resolved(symbol))
      if (actual !== item.kind)
        kindMismatch.push(`${item.name}: ${item.kind} listed, ${actual} built`)
      if (item.sameAs !== undefined) {
        const owner = exportsByEntry.get(item.sameAs)?.get(item.name)
        if (owner === undefined || resolved(owner) !== resolved(symbol))
          notSameDeclaration.push(item.name)
      }
    }
    const names = new Set(listed.map(item => item.name))
    return {
      entry,
      declaration,
      missing,
      extra: [...exported.keys()].filter(name => !names.has(name)).sort(),
      stalePending,
      kindMismatch,
      notSameDeclaration,
      total: listed.length,
      pending: listed.filter(item => item.pending).length,
    }
  })
}

/** Resolves the built declaration file of every inventory entry from the package manifest. */
export function builtDeclarations(
  packageDirectory: string,
  inventory: Inventory,
): Record<string, string> {
  const manifestPath = resolve(packageDirectory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports: Record<string, { types: string }>
  }
  return Object.fromEntries(
    Object.keys(inventory.entries).map(entry => {
      const target = manifest.exports[entry]?.types
      if (target === undefined) throw new Error(`package.json exports has no types for ${entry}`)
      return [entry, resolve(dirname(manifestPath), target)]
    }),
  )
}

/** Members that built declaration files add to an interface of another module. */
function augmentedMembers(
  declarations: readonly string[],
  moduleName: string,
  interfaceName: string,
): string[] {
  const members: string[] = []
  for (const path of declarations) {
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)
    for (const statement of file.statements) {
      if (!ts.isModuleDeclaration(statement) || statement.name.text !== moduleName) continue
      if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue
      for (const inner of statement.body.statements)
        if (ts.isInterfaceDeclaration(inner) && inner.name.text === interfaceName)
          for (const member of inner.members)
            members.push(
              member.name !== undefined && ts.isStringLiteral(member.name)
                ? member.name.text
                : (member.name?.getText(file) ?? ''),
            )
    }
  }
  return members.sort()
}

/** Lists augmentation problems; an empty list means built augmentations match the inventory. */
export function compareAugmentations(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = []
  for (const augmentation of inventory.augmentations) {
    const built = augmentedMembers(
      Object.values(declarations),
      augmentation.module,
      augmentation.interface,
    )
    const label = `${augmentation.module} ${augmentation.interface}`
    const unlisted = (augmentation.landed ?? []).filter(
      name => !augmentation.members.includes(name),
    )
    if (unlisted.length > 0)
      problems.push(`${label}: landed ${unlisted.join(', ')} are not listed in members`)
    if (augmentation.pending) {
      const landed = [...(augmentation.landed ?? [])].sort()
      if (JSON.stringify(built) !== JSON.stringify(landed))
        problems.push(
          `${label}: pending, built members ${built.join(', ') || 'none'} differ from landed ${landed.join(', ') || 'none'}`,
        )
    } else if (JSON.stringify(built) !== JSON.stringify([...augmentation.members].sort()))
      problems.push(`${label}: built members ${built.join(', ')} differ from the inventory`)
  }
  return problems
}

export function isClean(comparison: EntryComparison): boolean {
  return (
    comparison.missing.length === 0 &&
    comparison.extra.length === 0 &&
    comparison.stalePending.length === 0 &&
    comparison.kindMismatch.length === 0 &&
    comparison.notSameDeclaration.length === 0
  )
}

/**
 * Inventory-only consistency of re-exports: a name with `sameAs: X` must also be listed in entry X,
 * with the same kind. Without it, the owning entry could lose a name together with its chapter and
 * the re-exporting entry would still point at it.
 */
export function sameAsProblems(inventory: Inventory): string[] {
  const problems: string[] = []
  for (const [entry, value] of Object.entries(inventory.entries))
    for (const item of namesOf(value)) {
      if (item.sameAs === undefined) continue
      const ownerEntry = inventory.entries[item.sameAs]
      if (ownerEntry === undefined) {
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which is not an entry`)
        continue
      }
      const owner = namesOf(ownerEntry).find(other => other.name === item.name)
      if (owner === undefined)
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which does not list it`)
      else if (owner.kind !== item.kind)
        problems.push(
          `${entry}: ${item.name} is ${item.kind}, but ${item.sameAs} lists it as ${owner.kind}`,
        )
    }
  return problems
}

/**
 * Names that one TypeScript source declares for its module: exported declarations, and
 * `export { local as name }` that introduces a new name. A plain re-export (`export { a } from
 * './b'`) only forwards a name, so it does not declare it. `declare module` bodies do not count.
 */
export function declaredNames(source: string): string[] {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.ESNext, true)
  const names: string[] = []
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause))
        for (const element of statement.exportClause.elements) {
          const renamed = element.propertyName !== undefined
          if (statement.moduleSpecifier === undefined || renamed) names.push(element.name.text)
        }
      continue
    }
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false
    if (!exported) continue
    if (ts.isVariableStatement(statement))
      names.push(...statement.declarationList.declarations.map(item => item.name.getText(file)))
    else if ('name' in statement && statement.name !== undefined)
      names.push((statement.name as ts.Identifier).text)
  }
  return names
}

/**
 * Names that a code block declares at its top level, exported or not: `type`, `interface`,
 * `class`, `function`, `enum`, `const`, `let`, `var` and `declare` forms, plus the names that an
 * export statement introduces. A block that declares an inventory name is a second copy of a
 * source declaration, with or without `export`.
 */
export function blockDeclaredNames(source: string): string[] {
  const file = ts.createSourceFile('block.ts', source, ts.ScriptTarget.ESNext, true)
  const names = new Set(declaredNames(source))
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement))
      for (const item of statement.declarationList.declarations) names.add(item.name.getText(file))
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined &&
      ts.isIdentifier(statement.name)
    )
      names.add(statement.name.text)
  }
  return [...names]
}

const TYPESCRIPT_FENCES: ReadonlySet<string> = new Set(['ts', 'typescript', 'tsx', 'mts', 'cts'])

/** A fence line: optional indent (a fence inside a list item is indented), three or more of one fence character, then the info string. */
const FENCE_LINE = /^(?<indent>\s*)(?<marks>`{3,}|~{3,})(?<info>.*)$/u

type OpenFence = Readonly<{ indent: number; marks: string; ts: boolean; lines: string[] }>

function openFence(line: string): OpenFence | undefined {
  const match = FENCE_LINE.exec(line)?.groups
  if (match === undefined) return undefined
  const label = match['info']?.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  const marks = match['marks'] ?? ''
  return {
    indent: match['indent']?.length ?? 0,
    marks,
    ts: TYPESCRIPT_FENCES.has(label),
    lines: [],
  }
}

/** Whether the line closes the fence: the same character, at least as many, and nothing else after them. */
function closesFence(line: string, fence: OpenFence): boolean {
  const match = FENCE_LINE.exec(line)?.groups
  const marks = match?.['marks'] ?? ''
  return (
    match !== undefined && marks.startsWith(fence.marks) && (match['info']?.trim() ?? '') === ''
  )
}

/** The line without the indent of the fence that holds it, so that a block in a list item parses as written. */
function dedented(line: string, fence: OpenFence): string {
  const indent = line.length - line.trimStart().length
  return line.slice(Math.min(indent, fence.indent))
}

export type PageChapter = Readonly<{
  /** Link targets as written, without anchor. Links with a URL scheme are left out. */
  links: readonly string[]
  /** Names that TypeScript code blocks of the chapter declare, exported or not. */
  blockNames: readonly string[]
}>

/** The chapters (`## ` headings) of a public-api page, with the file links and the `ts` block declarations of each. */
export function publicApiChapters(markdown: string): Map<string, PageChapter> {
  const chapters = new Map<string, { links: string[]; blockNames: string[] }>()
  let title = ''
  let fence: OpenFence | undefined
  const current = () => {
    const found = chapters.get(title) ?? { links: [], blockNames: [] }
    chapters.set(title, found)
    return found
  }
  for (const line of markdown.split('\n')) {
    if (fence !== undefined) {
      if (!closesFence(line, fence)) fence.lines.push(dedented(line, fence))
      else {
        if (fence.ts) current().blockNames.push(...blockDeclaredNames(fence.lines.join('\n')))
        fence = undefined
      }
      continue
    }
    const opened = openFence(line)
    if (opened !== undefined) fence = opened
    else if (line.startsWith('## ')) {
      title = line.slice(3).trim()
      current()
    } else
      for (const match of line.matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/gu)) {
        const target = match[1] ?? ''
        if (!/^[a-z][a-z0-9+.-]*:/iu.test(target)) current().links.push(target)
      }
  }
  return chapters
}

/**
 * Differences between the chapters of the public-api page and the inventory. The page does not
 * repeat declarations: each chapter that the inventory lists points to the source files that
 * declare its names. A problem is reported when a listed chapter is missing, links no source file,
 * links no file that declares one of its names, when a linked source or test file does not exist,
 * or when a TypeScript code block of any chapter declares a name that the inventory lists.
 */
export function navigationProblems(
  inventory: Inventory,
  chapters: ReadonlyMap<string, PageChapter>,
  packageDirectory: string,
  pageDirectory: string,
): string[] {
  const listed = new Map<string, Set<string>>()
  for (const entry of Object.values(inventory.entries))
    for (const chapter of entry.chapters)
      listed.set(
        chapter.title,
        new Set([...(listed.get(chapter.title) ?? []), ...chapter.names.map(item => item.name)]),
      )
  const inPackage = (path: string, folder: 'src' | 'tests') =>
    path.startsWith(`${resolve(packageDirectory, folder)}${sep}`) && path.endsWith('.ts')
  const inventoryNames = new Set([...listed.values()].flatMap(names => [...names]))
  const problems: string[] = []
  for (const [title, chapter] of chapters) {
    for (const name of chapter.blockNames)
      if (inventoryNames.has(name))
        problems.push(
          `${title}: a code block declares ${name} again; the source is the only declaration`,
        )
    for (const link of chapter.links) {
      const path = resolve(pageDirectory, link)
      if ((inPackage(path, 'src') || inPackage(path, 'tests')) && !existsSync(path))
        problems.push(`${title}: links ${link}, which does not exist`)
    }
  }
  for (const [title, names] of listed) {
    const chapter = chapters.get(title)
    if (chapter === undefined) {
      problems.push(`chapter "${title}" is in the inventory, not in the page`)
      continue
    }
    const sources = chapter.links
      .map(link => resolve(pageDirectory, link))
      .filter(path => inPackage(path, 'src') && existsSync(path))
    if (sources.length === 0) {
      problems.push(`${title}: links no source file under src/`)
      continue
    }
    const declared = new Set(sources.flatMap(path => declaredNames(readFileSync(path, 'utf8'))))
    for (const name of names)
      if (!declared.has(name)) problems.push(`${title}: no linked source file declares ${name}`)
  }
  return problems
}
