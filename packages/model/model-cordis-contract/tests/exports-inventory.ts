// Compares the exports that a built package really publishes with the machine-readable inventory
// in fixtures/exports.json. It reads the compiled `.d.ts` entries through the TypeScript 6
// compiler API, so `export *` chains are resolved and value and type exports stay apart. Source
// text is never read: the inventory describes what a consumer can import.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from '@typescript/typescript6'

export type ExportKind = 'type' | 'value' | 'class'

export type InventoryName = Readonly<{
  name: string
  kind: ExportKind
  /** True while the accepted declaration has no implementation in the built entry yet. */
  pending: boolean
  /** Set when another entry owns the declaration and this entry only re-exports it. */
  sameAs?: string
  origin?: string
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
    if (augmentation.pending) {
      if (built.length > 0) problems.push(`${label}: pending but built members ${built.join(', ')}`)
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

/** Names exported by the top-level statements of one TypeScript snippet; `declare module` bodies and unexported declarations do not count. */
function exportedNames(snippet: string): string[] {
  const file = ts.createSourceFile('block.ts', snippet, ts.ScriptTarget.ESNext, true)
  const names: string[] = []
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause))
        names.push(...statement.exportClause.elements.map(element => element.name.text))
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

/** Chapters (`## ` headings) of a public-api page that hold a `ts` block, with the names exported by those blocks. */
export function publicApiChapters(markdown: string): Map<string, string[]> {
  const chapters = new Map<string, string[]>()
  let title = ''
  let block: string[] | undefined
  for (const line of markdown.split('\n')) {
    if (block !== undefined) {
      if (!line.startsWith('```')) block.push(line)
      else {
        chapters.set(title, [...(chapters.get(title) ?? []), ...exportedNames(block.join('\n'))])
        block = undefined
      }
    } else if (line.startsWith('## ')) title = line.slice(3).trim()
    else if (line.startsWith('```ts')) block = []
  }
  return chapters
}

/**
 * Differences between the chapters and names of the public-api page and the inventory. Names with
 * an `origin` (adopted by a ruling but not yet written into the page) are allowed extras. Entries
 * that re-export the same name list it again, so names are compared per chapter over all entries.
 */
export function chapterProblems(
  inventory: Inventory,
  docs: ReadonlyMap<string, readonly string[]>,
): string[] {
  const listed = new Map<string, Set<string>>()
  for (const entry of Object.values(inventory.entries))
    for (const chapter of entry.chapters)
      for (const item of chapter.names)
        if (item.origin !== 'R-3')
          listed.set(chapter.title, (listed.get(chapter.title) ?? new Set()).add(item.name))
  const problems: string[] = []
  for (const title of new Set([...docs.keys(), ...listed.keys()])) {
    const inDocs = new Set(docs.get(title))
    const inInventory = listed.get(title)
    if (inInventory === undefined)
      problems.push(`chapter "${title}" is in the page, not in the inventory`)
    else if (!docs.has(title))
      problems.push(`chapter "${title}" is in the inventory, not in the page`)
    else {
      for (const name of inDocs)
        if (!inInventory.has(name))
          problems.push(`${title}: page exports ${name}, inventory lacks it`)
      for (const name of inInventory)
        if (!inDocs.has(name)) problems.push(`${title}: inventory lists ${name}, page lacks it`)
    }
  }
  return problems
}
