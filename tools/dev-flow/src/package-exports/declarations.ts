// Reads what a built package really publishes: the compiled `.d.ts` entries go through the
// TypeScript 6 compiler API, so `export *` chains resolve and value and type exports stay apart.
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import ts from '@typescript/typescript6'
import { isOwnEntry, namesOf, type ExportKind, type Inventory } from './inventory.ts'

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
  /** Re-exports whose declaration is not the one of the entry or module named by `sameAs`. */
  notSameDeclaration: readonly string[]
  total: number
  pending: number
}>

const OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
  noEmit: true,
  types: [],
}

/** The `exports` subpaths of the manifest and the absolute declaration file of each, where it states one. */
export function manifestDeclarations(packageDirectory: string): Readonly<{
  entries: readonly string[]
  declarations: Readonly<Record<string, string>>
}> {
  const manifestPath = resolve(packageDirectory, 'package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const exports =
    typeof manifest === 'object' && manifest !== null && 'exports' in manifest
      ? manifest.exports
      : undefined
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports))
    throw new Error(`${manifestPath} has no exports map`)
  const declarations: Record<string, string> = {}
  for (const [entry, target] of Object.entries(exports)) {
    const types =
      typeof target === 'object' && target !== null && 'types' in target ? target.types : undefined
    if (typeof types === 'string') declarations[entry] = resolve(dirname(manifestPath), types)
  }
  return { entries: Object.keys(exports), declarations }
}

/** Whether some link of the alias chain is type-only (`export type { X }`, `import type { X }`). */
function typeOnly(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  let current: ts.Symbol | undefined = symbol
  const seen = new Set<ts.Symbol>()
  while (current !== undefined && current.flags & ts.SymbolFlags.Alias && !seen.has(current)) {
    seen.add(current)
    if (current.declarations?.some(node => ts.isTypeOnlyImportOrExportDeclaration(node)))
      return true
    current = checker.getImmediateAliasedSymbol(current)
  }
  return false
}

function kindOf(checker: ts.TypeChecker, symbol: ts.Symbol): ExportKind {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  // A type-only re-export of a value or class is usable only as a type.
  if (typeOnly(checker, symbol)) return 'type'
  const flags = target.flags
  if (flags & ts.SymbolFlags.Class) return 'class'
  const isValue = (flags & ts.SymbolFlags.Value) !== 0
  const isType = (flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Interface)) !== 0
  if (isValue && isType) return 'both'
  return isValue ? 'value' : 'type'
}

type Program = Readonly<{
  program: ts.Program
  checker: ts.TypeChecker
  /** Exports per own entry and per foreign `sameAs` module specifier. */
  modules: ReadonlyMap<string, ReadonlyMap<string, ts.Symbol>>
}>

function moduleExports(
  program: ts.Program,
  checker: ts.TypeChecker,
  path: string,
): Map<string, ts.Symbol> {
  const file = program.getSourceFile(path)
  const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
  if (module === undefined) throw new Error(`${path} is not a module declaration file`)
  return new Map(checker.getExportsOfModule(module).map(symbol => [symbol.name, symbol]))
}

function openProgram(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): Program {
  const foreign = new Map<string, string>()
  for (const [entry, value] of Object.entries(inventory.entries)) {
    const from = declarations[entry]
    if (from === undefined) continue
    for (const item of namesOf(value)) {
      if (item.sameAs === undefined || isOwnEntry(item.sameAs) || foreign.has(item.sameAs)) continue
      const resolved = ts.resolveModuleName(item.sameAs, from, OPTIONS, ts.sys).resolvedModule
      if (resolved === undefined) throw new Error(`${entry}: cannot resolve sameAs ${item.sameAs}`)
      foreign.set(item.sameAs, resolved.resolvedFileName)
    }
  }
  const program = ts.createProgram([...Object.values(declarations), ...foreign.values()], OPTIONS)
  const checker = program.getTypeChecker()
  // The public compiler API loses type-only provenance for star exports. Refuse that
  // syntax instead of reporting a type-only export as a runtime value. Named type exports
  // retain their alias declarations and are checked below.
  const visited = new Set<ts.SourceFile>()
  function checkReExports(file: ts.SourceFile): void {
    if (visited.has(file)) return
    visited.add(file)
    for (const statement of file.statements) {
      if (!ts.isExportDeclaration(statement)) continue
      if (statement.isTypeOnly && statement.exportClause === undefined)
        throw new Error(
          `${file.fileName}: type-only star exports are not supported; use named type exports`,
        )
      // Imported types may refer to a dependency with a different export style. Only
      // forwarding its exports changes this entry's public names.
      if (statement.moduleSpecifier === undefined) continue
      const dependency = checker.getSymbolAtLocation(statement.moduleSpecifier)
      for (const declaration of dependency?.declarations ?? [])
        if (ts.isSourceFile(declaration)) checkReExports(declaration)
    }
  }
  for (const path of Object.values(declarations)) {
    const file = program.getSourceFile(path)
    if (file !== undefined) checkReExports(file)
  }
  const modules = new Map<string, ReadonlyMap<string, ts.Symbol>>()
  for (const [entry, path] of Object.entries(declarations))
    modules.set(entry, moduleExports(program, checker, path))
  for (const [specifier, path] of foreign)
    modules.set(specifier, moduleExports(program, checker, path))
  return { program, checker, modules }
}

/**
 * Compares the entries of one built package with its inventory. `declarations` maps an entry
 * subpath (`.`, `./cordis`) to the absolute path of its built declaration file.
 */
export function compareEntries(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): EntryComparison[] {
  const { checker, modules } = openProgram(inventory, declarations)
  const resolved = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

  return Object.entries(inventory.entries).map(([entry, value]) => {
    const exported = modules.get(entry)
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
      const actual = kindOf(checker, symbol)
      if (actual !== item.kind)
        kindMismatch.push(`${item.name}: ${item.kind} listed, ${actual} built`)
      if (item.sameAs !== undefined) {
        const owner = modules.get(item.sameAs)?.get(item.name)
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

export function isClean(comparison: EntryComparison): boolean {
  return (
    comparison.missing.length === 0 &&
    comparison.extra.length === 0 &&
    comparison.stalePending.length === 0 &&
    comparison.kindMismatch.length === 0 &&
    comparison.notSameDeclaration.length === 0
  )
}

/** One line per difference, prefixed with the entry. */
export function comparisonProblems(comparison: EntryComparison): string[] {
  const at = comparison.entry
  return [
    ...comparison.missing.map(
      name => `${at}: ${name} is listed, the built entry does not export it`,
    ),
    ...comparison.extra.map(name => `${at}: ${name} is exported, the inventory does not list it`),
    ...comparison.stalePending.map(name => `${at}: ${name} is flagged pending but already built`),
    ...comparison.kindMismatch.map(text => `${at}: ${text}`),
    ...comparison.notSameDeclaration.map(
      name => `${at}: ${name} is not the declaration that its sameAs names`,
    ),
  ]
}

/** Members that a built file adds to an interface of another module through `declare module`. */
function augmentedMembers(
  file: ts.SourceFile,
  moduleName: string,
  interfaceName: string,
): string[] {
  const members: string[] = []
  for (const statement of file.statements) {
    if (!ts.isModuleDeclaration(statement) || statement.name.text !== moduleName) continue
    if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue
    for (const inner of statement.body.statements)
      if (ts.isInterfaceDeclaration(inner) && inner.name.text === interfaceName)
        for (const member of inner.members)
          if (member.name !== undefined)
            members.push(
              ts.isStringLiteral(member.name) || ts.isIdentifier(member.name)
                ? member.name.text
                : member.name.getText(file),
            )
  }
  return members
}

/**
 * Lists augmentation problems; an empty list means built augmentations match the inventory. Every
 * built declaration file of the package that an entry reaches is read, so an augmentation that a
 * non-entry module carries is seen as a consumer sees it.
 */
export function compareAugmentations(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
  packageDirectory: string,
): string[] {
  const { program } = openProgram(inventory, declarations)
  const own = `${realpathSync(packageDirectory)}${sep}`
  // The compiler names files with `/` on every platform; `resolve` gives them the separator of
  // `realpathSync` (on Windows `D:/a/b` becomes `D:\a\b`) and leaves POSIX paths unchanged.
  const files = program.getSourceFiles().filter(file => {
    const path = resolve(file.fileName)
    return path.startsWith(own) && !path.slice(own.length).includes(`node_modules${sep}`)
  })
  const problems: string[] = []
  const listed = new Set(
    inventory.augmentations.map(item => `${item.module}\u0000${item.interface}`),
  )
  for (const augmentation of inventory.augmentations) {
    const built = files
      .flatMap(file => augmentedMembers(file, augmentation.module, augmentation.interface))
      .sort()
    const label = `${augmentation.module} ${augmentation.interface}`
    if (augmentation.pending) {
      const landed = [...(augmentation.landed ?? [])].sort()
      if (JSON.stringify(built) !== JSON.stringify(landed))
        problems.push(
          `${label}: pending, built members ${built.join(', ') || 'none'} differ from landed ${landed.join(', ') || 'none'}`,
        )
    } else if (JSON.stringify(built) !== JSON.stringify([...augmentation.members].sort()))
      problems.push(
        `${label}: built members ${built.join(', ') || 'none'} differ from the inventory`,
      )
  }
  for (const file of files)
    for (const statement of file.statements) {
      if (!ts.isModuleDeclaration(statement) || !ts.isStringLiteral(statement.name)) continue
      if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue
      for (const inner of statement.body.statements)
        if (
          ts.isInterfaceDeclaration(inner) &&
          !listed.has(`${statement.name.text}\u0000${inner.name.text}`)
        )
          problems.push(
            `${statement.name.text} ${inner.name.text}: built augmentation the inventory does not list`,
          )
    }
  return [...new Set(problems)]
}
