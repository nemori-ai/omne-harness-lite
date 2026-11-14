import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import ts from '@typescript/typescript6'
import {
  byCodeUnit,
  type ApiSnapshot,
  type DeclarationFile,
  type EntryExport,
  type EntrySection,
  type ExportOrigin,
} from './api-format.ts'
import {
  consumerCompilerOptions,
  declarationsIn,
  distOf,
  sharingInstalledDeclarations,
} from './compat.ts'

export interface ContractMember {
  readonly directory: string
  readonly packageName: string
  readonly entries: readonly { readonly subpath: string; readonly types: string }[]
}

export interface MemberProblem {
  readonly directory: string
  readonly message: string
}

export type MemberRead =
  | { readonly kind: 'member'; readonly member: ContractMember }
  | { readonly kind: 'invalid'; readonly problem: MemberProblem }

export type ReadFile = (path: string) => string | undefined

export const readWorkingFile =
  (root: string): ReadFile =>
  path => {
    const full = join(root, path)
    return existsSync(full) ? readFileSync(full, 'utf8') : undefined
  }

export function readContractMember(read: ReadFile, directory: string): MemberRead {
  const invalid = (message: string): MemberRead => ({
    kind: 'invalid',
    problem: { directory, message },
  })
  const text = read(`${directory}/package.json`)
  if (text === undefined) return invalid('没有 package.json')
  const manifest: unknown = JSON.parse(text)
  if (typeof manifest !== 'object' || manifest === null) return invalid('package.json 不是对象')
  const name = 'name' in manifest ? manifest.name : undefined
  if (typeof name !== 'string' || name === '') return invalid('package.json 没有 name')
  const entries = entriesOf('exports' in manifest ? manifest.exports : undefined)
  if (typeof entries === 'string') return invalid(entries)
  return { kind: 'member', member: { directory, packageName: name, entries } }
}

function entriesOf(exports: unknown): { subpath: string; types: string }[] | string {
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports))
    return 'package.json 的 exports 不是按子路径的对象'
  const entries: { subpath: string; types: string }[] = []
  for (const [subpath, target] of Object.entries(exports)) {
    const types =
      typeof target === 'object' && target !== null && 'types' in target ? target.types : undefined
    if (typeof types !== 'string') return `exports 的 ${subpath} 没有 types`
    entries.push({ subpath, types })
  }
  return entries.sort((a, b) => byCodeUnit(a.subpath, b.subpath))
}

export type SnapshotResult =
  | { readonly kind: 'snapshot'; readonly directory: string; readonly snapshot: ApiSnapshot }
  | { readonly kind: 'unbuilt'; readonly directory: string }
  | { readonly kind: 'invalid'; readonly directory: string; readonly message: string }

export function snapshotContracts(
  root: string,
  members: readonly ContractMember[],
): { readonly typescript: string; readonly results: readonly SnapshotResult[] } {
  const realRoot = realpathSync(root)
  const results: SnapshotResult[] = []
  const built: ContractMember[] = []
  for (const member of members) {
    const missing = member.entries.find(
      entry => !existsSync(join(realRoot, member.directory, entry.types)),
    )
    if (!existsSync(distOf(realRoot, member.directory)))
      results.push({ kind: 'unbuilt', directory: member.directory })
    else if (missing !== undefined)
      results.push({
        kind: 'invalid',
        directory: member.directory,
        message: `入口 ${missing.subpath} 的 ${missing.types} 不存在`,
      })
    else built.push(member)
  }
  const rootNames = built.flatMap(member => declarationsIn(distOf(realRoot, member.directory)))
  const options = consumerCompilerOptions(realRoot)
  const host = ts.createCompilerHost(options)
  host.getSourceFile = sharingInstalledDeclarations(options, host.getSourceFile)
  const program = ts.createProgram({ rootNames, options, host })
  for (const member of built) results.push(snapshotMember(program, realRoot, member))
  results.sort((a, b) => byCodeUnit(a.directory, b.directory))
  return { typescript: ts.version, results }
}

interface Context {
  readonly program: ts.Program
  readonly checker: ts.TypeChecker
  readonly root: string
  readonly dist: string
  readonly own: (node: ts.Node) => boolean
}

function contextFor(program: ts.Program, root: string, member: ContractMember): Context {
  const dist = distOf(root, member.directory) + sep
  const owned = new Map<string, boolean>()
  const own = (node: ts.Node) => {
    const file = node.getSourceFile().fileName
    let answer = owned.get(file)
    if (answer === undefined) {
      answer = realpathSync(file).startsWith(dist)
      owned.set(file, answer)
    }
    return answer
  }
  return { program, checker: program.getTypeChecker(), root, dist, own }
}

function distPath(ctx: Context, fileName: string): string {
  return relative(ctx.dist, realpathSync(fileName)).split(sep).join('/')
}

function snapshotMember(program: ts.Program, root: string, member: ContractMember): SnapshotResult {
  const ctx = contextFor(program, root, member)
  const files = program.getSourceFiles().filter(ctx.own)
  const problems = diagnosticsOf(ctx, files)
  if (problems.length > 0)
    return {
      kind: 'invalid',
      directory: member.directory,
      message: `dist 有编译诊断：${problems.join('；')}`,
    }
  const entries: EntrySection[] = member.entries.map(entry => {
    const file = program.getSourceFile(join(root, member.directory, entry.types))
    return {
      subpath: entry.subpath,
      file: file === undefined ? entry.types : distPath(ctx, file.fileName),
      exports: entryExports(ctx, file),
    }
  })
  return {
    kind: 'snapshot',
    directory: member.directory,
    snapshot: {
      packageName: member.packageName,
      entries,
      files: files.map(file => declarationFile(ctx, file)),
    },
  }
}

function diagnosticsOf(ctx: Context, files: readonly ts.SourceFile[]): string[] {
  return files
    .flatMap(file => [
      ...ctx.program.getSyntacticDiagnostics(file),
      ...ctx.program.getSemanticDiagnostics(file),
    ])
    .slice(0, 3)
    .map(diagnostic => {
      const file = diagnostic.file
      const at =
        file === undefined
          ? ''
          : `${relative(ctx.root, file.fileName)}:${file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1} `
      return `${at}TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
    })
}

const filePrinter = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

function declarationFile(ctx: Context, file: ts.SourceFile): DeclarationFile {
  return { path: distPath(ctx, file.fileName), code: filePrinter.printFile(file).trimEnd() }
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function moduleFileOf(symbol: ts.Symbol): ts.SourceFile | undefined {
  return (symbol.declarations ?? []).find(ts.isSourceFile)
}

function entryExports(
  ctx: Context,
  file: ts.SourceFile | undefined,
  prefix = '',
  seen = new Set<ts.Symbol>(),
): EntryExport[] {
  const moduleSymbol = file === undefined ? undefined : ctx.checker.getSymbolAtLocation(file)
  if (moduleSymbol === undefined) return []
  return ctx.checker.getExportsOfModule(moduleSymbol).flatMap(symbol => {
    const target = resolveAlias(ctx.checker, symbol)
    const namespace = moduleFileOf(target)
    if (namespace !== undefined)
      return namespaceExports(ctx, moduleSymbol, symbol, target, namespace, prefix, seen)
    const origin = originOf(ctx, target)
    if (origin === undefined) return []
    return [exportOf(ctx, moduleSymbol, symbol, target, prefix, origin)]
  })
}

function namespaceExports(
  ctx: Context,
  moduleSymbol: ts.Symbol,
  symbol: ts.Symbol,
  target: ts.Symbol,
  file: ts.SourceFile,
  prefix: string,
  seen: ReadonlySet<ts.Symbol>,
): EntryExport[] {
  const typeOnly = isTypeOnlyExport(ctx.checker, moduleSymbol, symbol)
  const name = prefix + symbol.name
  if (!ctx.own(file) || seen.has(target))
    return [
      { name, typeOnly, origin: { kind: 'package', name: packageOf(ctx.root, file.fileName) } },
    ]
  const head: EntryExport = {
    name,
    typeOnly,
    origin: { kind: 'namespace', path: distPath(ctx, file.fileName) },
  }
  return [head, ...entryExports(ctx, file, `${name}.`, new Set([...seen, target]))]
}

function originOf(ctx: Context, target: ts.Symbol): ExportOrigin | undefined {
  const declarations = sortDeclarations(
    (target.declarations ?? []).filter(node => !insideAugmentation(node)),
  )
  const first = declarations[0]
  if (first === undefined) return undefined
  const mine = declarations.find(ctx.own)
  if (mine !== undefined)
    return { kind: 'file', path: distPath(ctx, mine.getSourceFile().fileName) }
  return { kind: 'package', name: packageOf(ctx.root, first.getSourceFile().fileName) }
}

function exportOf(
  ctx: Context,
  moduleSymbol: ts.Symbol,
  symbol: ts.Symbol,
  target: ts.Symbol,
  prefix: string,
  origin: ExportOrigin,
): EntryExport {
  const typeOnly =
    isTypeOnlyExport(ctx.checker, moduleSymbol, symbol) &&
    (target.flags & ts.SymbolFlags.Value) !== 0
  const renamed = target.name !== symbol.name && target.name !== 'default'
  return {
    name: prefix + symbol.name,
    ...(renamed ? { renamedFrom: target.name } : {}),
    typeOnly,
    origin,
  }
}

function isTypeOnlyExport(
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
  symbol: ts.Symbol,
): boolean {
  if (symbol.flags & ts.SymbolFlags.Alias) return typeOnlyAlias(checker, symbol)
  if (moduleSymbol.exports?.get(symbol.escapedName) === symbol) return false
  return typeOnlyThroughStar(checker, moduleSymbol, symbol.name, new Set())
}

function typeOnlyAlias(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const seen = new Set<ts.Symbol>()
  for (let current: ts.Symbol | undefined = symbol; current !== undefined && !seen.has(current);) {
    if (!(current.flags & ts.SymbolFlags.Alias)) return false
    seen.add(current)
    if ((current.declarations ?? []).some(ts.isTypeOnlyImportOrExportDeclaration)) return true
    current = checker.getImmediateAliasedSymbol(current)
  }
  return false
}

function typeOnlyThroughStar(
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
  name: string,
  seen: Set<ts.Symbol>,
): boolean {
  if (seen.has(moduleSymbol)) return false
  seen.add(moduleSymbol)
  for (const star of starExports(moduleSymbol)) {
    const from = checker.getSymbolAtLocation(star.moduleSpecifier)
    const found =
      from === undefined
        ? undefined
        : checker.getExportsOfModule(from).find(item => item.name === name)
    if (from === undefined || found === undefined) continue
    if (star.isTypeOnly) return true
    if (found.flags & ts.SymbolFlags.Alias) return typeOnlyAlias(checker, found)
    if (from.exports?.get(found.escapedName) === found) return false
    return typeOnlyThroughStar(checker, from, name, seen)
  }
  return false
}

function starExports(
  moduleSymbol: ts.Symbol,
): { readonly isTypeOnly: boolean; readonly moduleSpecifier: ts.Expression }[] {
  return (moduleSymbol.declarations ?? [])
    .filter(ts.isSourceFile)
    .flatMap(file => file.statements.filter(ts.isExportDeclaration))
    .flatMap(statement =>
      statement.exportClause === undefined && statement.moduleSpecifier !== undefined
        ? [{ isTypeOnly: statement.isTypeOnly, moduleSpecifier: statement.moduleSpecifier }]
        : [],
    )
}

function insideAugmentation(node: ts.Node): boolean {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent)
    if (
      ts.isModuleDeclaration(parent) &&
      (ts.isStringLiteral(parent.name) || (parent.flags & ts.NodeFlags.GlobalAugmentation) !== 0)
    )
      return true
  return false
}

function sortDeclarations(nodes: readonly ts.Node[]): ts.Node[] {
  return [...nodes].sort(
    (a, b) =>
      byCodeUnit(a.getSourceFile().fileName, b.getSourceFile().fileName) ||
      a.getStart() - b.getStart(),
  )
}

function packageOf(root: string, fileName: string): string {
  for (
    let directory = dirname(realpathSync(fileName));
    directory !== dirname(directory);
    directory = dirname(directory)
  ) {
    const name = manifestName(join(directory, 'package.json'))
    if (name !== undefined) return name
    if (directory === root) break
  }
  return relative(root, fileName)
}

function manifestName(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) return undefined
  return typeof parsed.name === 'string' ? parsed.name : undefined
}
