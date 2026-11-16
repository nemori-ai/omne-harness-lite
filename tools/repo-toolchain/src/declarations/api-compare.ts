import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, posix, sep } from 'node:path'
import ts from '@typescript/typescript6'
import {
  byCodeUnit,
  type ApiSnapshot,
  type DeclarationFile,
  type EntrySection,
} from './api-format.ts'
import { sameText, statementId } from './api-normalize.ts'
import { consumerCompilerOptions, sharingInstalledDeclarations } from './compat.ts'

export interface CompareTarget {
  readonly entry: string
  readonly name: string
}

export type VerdictProblem =
  | {
      readonly kind: 'direction'
      readonly label: string
      readonly readers: boolean
      readonly writers: boolean
      readonly why: string
    }
  | { readonly kind: 'incomplete'; readonly why: string }
  | { readonly kind: 'truncated'; readonly limit: number; readonly total: number }

export interface Verdict {
  readonly target: CompareTarget
  readonly readers: boolean
  readonly writers: boolean
  readonly same: boolean
  readonly comparisons: number
  readonly problems: readonly VerdictProblem[]
  readonly reaches: readonly string[]
}

export interface CheckerComparison {
  readonly verdicts: readonly Verdict[]
  readonly problems: readonly string[]
}

export interface CompareInput {
  readonly root: string
  readonly directory: string
  readonly before: ApiSnapshot
  readonly after: ApiSnapshot
  readonly exports: readonly CompareTarget[]
}

export const INSTANCE_LIMIT = 16

type Side = 'old' | 'new'

export function compareSnapshots(input: CompareInput): CheckerComparison {
  const base = checkerPath(join(input.root, input.directory, '.omne-contract-api'))
  const scripts = new Map(input.after.files.filter(isScript).map(file => [file.path, file.code]))
  const dropped = input.before.files
    .filter(file => scripts.has(file.path) && scripts.get(file.path) !== file.code)
    .map(file => `脚本文件 ${file.path} 两侧不同，旧侧没有还原`)
  const overlay = new Map([
    ...restore(base, 'old', input.before.files, new Set(scripts.keys())),
    ...restore(base, 'new', input.after.files, new Set()),
  ])
  const compareFile = posix.join(base, 'compare.ts')
  overlay.set(compareFile, 'export {};\n')
  const options = compareOptions(input.root)
  const first = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  const plan = planComparisons(first, base, input)
  overlay.set(compareFile, plan.lines.join('\n') + '\n')
  const second = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  const results = readResults(second, compareFile, overlay, plan)
  return { ...results, problems: [...dropped, ...results.problems] }
}

function isScript(file: DeclarationFile): boolean {
  return !ts.isExternalModule(
    ts.createSourceFile(file.path, file.code, ts.ScriptTarget.Latest, false),
  )
}

function compareOptions(root: string): ts.CompilerOptions {
  return { ...consumerCompilerOptions(root), noEmit: true, allowImportingTsExtensions: true }
}

function overlayHost(
  options: ts.CompilerOptions,
  overlay: ReadonlyMap<string, string>,
  base: string,
): ts.CompilerHost {
  const host = ts.createCompilerHost(options)
  const read = (file: string) =>
    overlay.get(file) ?? (existsSync(file) ? readFileSync(file, 'utf8') : undefined)
  return {
    ...host,
    getSourceFile: sharingInstalledDeclarations(options, (file, language) => {
      const text = read(file)
      return text === undefined ? undefined : ts.createSourceFile(file, text, language, true)
    }),
    fileExists: file => overlay.has(file) || existsSync(file),
    readFile: read,
    directoryExists: directory =>
      directory === base || directory.startsWith(base + '/') || existsSync(directory),
    realpath: file => (overlay.has(file) || file.startsWith(base) ? file : realpathSync(file)),
  }
}

function checkerPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

function sidePath(base: string, side: Side, path: string): string {
  return posix.join(base, side, path)
}

export type NameResolution =
  | { readonly kind: 'free' }
  | { readonly kind: 'taken'; readonly where: string }
  | { readonly kind: 'unknown'; readonly why: string }

export interface ScopeInput {
  readonly root: string
  readonly directory: string
  readonly files: readonly DeclarationFile[]
}

const ANY_MEANING = ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace

export function oldSideScope(input: ScopeInput): (path: string, name: string) => NameResolution {
  const base = checkerPath(join(input.root, input.directory, '.omne-contract-api'))
  let program: ts.Program | undefined
  return (path, name) => {
    try {
      if (program === undefined) {
        const overlay = restore(base, 'old', input.files, new Set())
        const options = compareOptions(input.root)
        program = ts.createProgram(
          [...overlay.keys()],
          options,
          overlayHost(options, overlay, base),
        )
      }
      const location = program.getSourceFile(sidePath(base, 'old', path))
      const symbol = program.getTypeChecker().resolveName(name, location, ANY_MEANING, false)
      if (symbol === undefined) return { kind: 'free' }
      const file = symbol.declarations?.[0]?.getSourceFile().fileName
      return { kind: 'taken', where: file === undefined ? name : whereOf(file, base, input.root) }
    } catch (error) {
      return { kind: 'unknown', why: error instanceof Error ? error.message : String(error) }
    }
  }
}

function whereOf(file: string, base: string, root: string): string {
  const old = sidePath(base, 'old', '') + '/'
  if (file.startsWith(old)) return file.slice(old.length)
  const marker = '/node_modules/'
  const modules = file.lastIndexOf(marker)
  if (modules >= 0) return file.slice(modules + marker.length)
  const top = checkerPath(root)
  return file.startsWith(top + '/') ? file.slice(top.length + 1) : file
}

function restore(
  base: string,
  side: Side,
  files: readonly DeclarationFile[],
  skip: ReadonlySet<string>,
): Map<string, string> {
  const restored = new Map<string, string>()
  for (const file of files)
    if (!skip.has(file.path))
      restored.set(sidePath(base, side, file.path), prepareForChecker(file.path, file.code))
  return restored
}

type Edit = readonly [start: number, end: number, replacement: string]

export function prepareForChecker(path: string, text: string): string {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  const visit = (node: ts.Node): void => {
    if (node.parent === source && ts.isModuleDeclaration(node) && isForeignAugmentation(node))
      edits.push(...rewriteAugmentation(source, node))
    const edit =
      brandEdit(source, path, node) ?? classMemberEdit(source, node) ?? methodEdit(source, node)
    if (edit !== undefined) {
      edits.push(...edit)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return applyEdits(text, edits)
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => b[0] - a[0] || b[1] - a[1])
  let out = text
  for (const [start, end, replacement] of ordered)
    out = out.slice(0, start) + replacement + out.slice(end)
  return out
}

function isForeignAugmentation(node: ts.ModuleDeclaration): boolean {
  if ((node.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true
  return ts.isStringLiteral(node.name) && !node.name.text.startsWith('.')
}

function rewriteAugmentation(source: ts.SourceFile, node: ts.ModuleDeclaration): Edit[] {
  const target = ts.isStringLiteral(node.name) ? node.name.text : 'global'
  const namespace = '__aug_' + target.replace(/[^A-Za-z0-9]/gu, '_')
  const body = node.body !== undefined && ts.isModuleBlock(node.body) ? node.body : undefined
  if (body === undefined) return []
  const edits: Edit[] = [
    [node.getStart(source), body.getStart(source), `export declare namespace ${namespace} `],
  ]
  for (const statement of body.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    const exported = modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)
    if (exported !== true)
      edits.push([statement.getStart(source), statement.getStart(source), 'export '])
  }
  return edits
}

function brandEdit(source: ts.SourceFile, path: string, node: ts.Node): Edit[] | undefined {
  if (!ts.isTypeOperatorNode(node) || node.operator !== ts.SyntaxKind.UniqueKeyword)
    return undefined
  const chain: string[] = []
  for (let parent = node.parent; parent !== source; parent = parent.parent) {
    const name = nameOf(parent)
    if (name !== undefined && ts.isIdentifier(name)) chain.unshift(name.text)
  }
  return [
    [node.getStart(source), node.getEnd(), JSON.stringify(`__brand:${path}#${chain.join('.')}`)],
  ]
}

function nameOf(node: ts.Node): ts.Node | undefined {
  const named: ts.Node & { readonly name?: ts.Node } = node
  return named.name
}

function classMemberEdit(source: ts.SourceFile, node: ts.Node): Edit[] | undefined {
  if (node.kind === ts.SyntaxKind.ProtectedKeyword)
    return [[node.getStart(source), node.getEnd(), '']]
  const member =
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  if (!member || !ts.isClassLike(node.parent)) return undefined
  const hidden =
    ts.isPrivateIdentifier(node.name) ||
    ts.getModifiers(node)?.some(item => item.kind === ts.SyntaxKind.PrivateKeyword)
  return hidden === true ? [[node.getStart(source), node.getEnd(), '']] : undefined
}

type MethodLike = ts.MethodSignature | ts.MethodDeclaration

function methodEdit(source: ts.SourceFile, node: ts.Node): Edit[] | undefined {
  const method =
    ts.isMethodSignature(node) || (ts.isMethodDeclaration(node) && ts.isClassLike(node.parent))
  if (!method) return undefined
  const name = node.name.getText(source)
  const siblings = membersOf(node.parent).filter(
    (item): item is MethodLike =>
      (ts.isMethodSignature(item) || ts.isMethodDeclaration(item)) &&
      item.name.getText(source) === name,
  )
  if (siblings[0] !== node) return []
  const signature = (item: MethodLike) =>
    `${item.typeParameters === undefined ? '' : `<${item.typeParameters.map(p => p.getText(source)).join(', ')}>`}(${item.parameters.map(p => p.getText(source)).join(', ')})`
  const result = (item: MethodLike) => (item.type === undefined ? 'any' : item.type.getText(source))
  const type =
    siblings.length === 1
      ? `${signature(node)} => ${result(node)}`
      : `{ ${siblings.map(item => `${signature(item)}: ${result(item)}`).join('; ')} }`
  const modifiers = (ts.getModifiers(node) ?? [])
    .filter(item => item.kind !== ts.SyntaxKind.ProtectedKeyword)
    .map(item => item.getText(source) + ' ')
    .join('')
  const replacement = `${modifiers}${name}${node.questionToken === undefined ? '' : '?'}: ${type};`
  return [
    [node.getStart(source), node.getEnd(), replacement],
    ...siblings.slice(1).map((item): Edit => [item.getStart(source), item.getEnd(), '']),
  ]
}

function membersOf(parent: ts.Node): readonly ts.Node[] {
  if (ts.isInterfaceDeclaration(parent) || ts.isTypeLiteralNode(parent) || ts.isClassLike(parent))
    return parent.members
  return []
}

interface ExportInfo {
  readonly symbol: ts.Symbol
  readonly isType: boolean
  readonly isValue: boolean
  readonly typeParameters: readonly ts.Type[]
  readonly constraints: readonly (ts.Type | undefined)[]
  readonly text: string
  readonly declarations: readonly string[]
}

interface Check {
  readonly target: CompareTarget
  readonly line: number
  readonly label: string
  readonly kind: 'assign' | 'value-new' | 'value-old'
}

interface Pending {
  readonly target: CompareTarget
  same: boolean
  readers: boolean
  writers: boolean
  comparisons: number
  readonly problems: VerdictProblem[]
  reaches: readonly string[]
  readonly value: { new?: boolean; old?: boolean }
}

interface Plan {
  readonly lines: string[]
  readonly checks: Check[]
  readonly pending: Map<string, Pending>
}

const targetId = (target: CompareTarget) => `${target.entry}\u0000${target.name}`

function pendingFor(plan: Plan, target: CompareTarget): Pending {
  const id = targetId(target)
  const existing = plan.pending.get(id)
  if (existing !== undefined) return existing
  const created: Pending = {
    target,
    same: false,
    readers: true,
    writers: true,
    comparisons: 0,
    problems: [],
    reaches: [],
    value: {},
  }
  plan.pending.set(id, created)
  return created
}

function settle(pending: Pending, why: string): void {
  pending.readers = false
  pending.writers = false
  pending.problems.push({ kind: 'direction', label: '声明', readers: false, writers: false, why })
}

function moduleSpecifier(side: Side, path: string): string {
  return `./${side}/${path.replace(/\.d\.ts$/u, '.ts')}`
}

function alias(side: Side, path: string): string {
  return `${side === 'old' ? 'O' : 'N'}_${path.replace(/\W/gu, '_')}`
}

function planComparisons(program: ts.Program, base: string, input: CompareInput): Plan {
  const plan: Plan = { lines: [], checks: [], pending: new Map() }
  const checker = program.getTypeChecker()
  const enclosing = program.getSourceFile(posix.join(base, 'compare.ts'))
  const reach = new Reachability(checker, base)
  const entryFile = (snapshot: ApiSnapshot, subpath: string) =>
    snapshot.entries.find(item => item.subpath === subpath)
  const files = new Map<string, { side: Side; path: string }>()
  const use = (side: Side, path: string) => files.set(`${side}:${path}`, { side, path })
  for (const item of input.exports) {
    const before = entryFile(input.before, item.entry)
    const after = entryFile(input.after, item.entry)
    if (before === undefined || after === undefined) continue
    use('old', before.file)
    use('new', after.file)
    const o = exportInfo(checker, program, sidePath(base, 'old', before.file), item.name)
    const n = exportInfo(checker, program, sidePath(base, 'new', after.file), item.name)
    planExport(plan, item, refs(before, after, item.name), o, n, { checker, enclosing, reach })
  }
  const imports = [...files]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(
      ([, { side, path }]) =>
        `import * as ${alias(side, path)} from '${moduleSpecifier(side, path)}';`,
    )
  const brands = Array.from(
    { length: 8 },
    (_, i) =>
      `declare const __b${i}: unique symbol; interface __P${i} { readonly [__b${i}]: ${i} }`,
  )
  plan.lines.unshift(...imports, ...brands)
  const shift = imports.length + brands.length
  plan.checks.splice(
    0,
    plan.checks.length,
    ...plan.checks.map(check => ({ ...check, line: check.line + shift })),
  )
  return plan
}

class Reachability {
  private readonly adjacency = new Map<ts.Symbol, readonly ts.Symbol[]>()
  private readonly checker: ts.TypeChecker
  private readonly base: string

  constructor(checker: ts.TypeChecker, base: string) {
    this.checker = checker
    this.base = base
  }

  from(start: ts.Symbol): string[] {
    const visited = new Set<ts.Symbol>()
    const reaches = new Set<string>()
    const queue = [start]
    for (let symbol = queue.pop(); symbol !== undefined; symbol = queue.pop()) {
      if (visited.has(symbol)) continue
      visited.add(symbol)
      let own = false
      for (const declaration of symbol.declarations ?? []) {
        const id = this.statementOf(declaration)
        if (id === undefined) continue
        reaches.add(id)
        own = true
      }
      if (own) queue.push(...this.referenced(symbol))
    }
    return [...reaches].sort(byCodeUnit)
  }

  private statementOf(declaration: ts.Declaration): string | undefined {
    const file = declaration.getSourceFile().fileName
    const path = ['old', 'new']
      .map(side => `${this.base}/${side}/`)
      .find(prefix => file.startsWith(prefix))
    if (path === undefined) return undefined
    let node: ts.Node = declaration
    while (node.parent !== undefined && !ts.isSourceFile(node.parent)) node = node.parent
    return statementId(file.slice(path.length), node)
  }

  private referenced(symbol: ts.Symbol): readonly ts.Symbol[] {
    const known = this.adjacency.get(symbol)
    if (known !== undefined) return known
    const found: ts.Symbol[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const resolved = this.checker.getSymbolAtLocation(node)
        if (resolved !== undefined) found.push(resolveAlias(this.checker, resolved))
      }
      ts.forEachChild(node, visit)
    }
    for (const declaration of symbol.declarations ?? [])
      if (this.statementOf(declaration) !== undefined) visit(declaration)
    this.adjacency.set(symbol, found)
    return found
  }
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol
}

function refs(
  before: EntrySection,
  after: EntrySection,
  name: string,
): { old: string; new: string } {
  return { old: `${alias('old', before.file)}.${name}`, new: `${alias('new', after.file)}.${name}` }
}

function lookup(
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol | undefined,
  dotted: string,
): ts.Symbol | undefined {
  let current = moduleSymbol
  let found: ts.Symbol | undefined
  for (const part of dotted.split('.')) {
    if (current === undefined) return undefined
    const symbol = checker.getExportsOfModule(current).find(item => item.name === part)
    found = symbol === undefined ? undefined : resolveAlias(checker, symbol)
    current = found
  }
  return found
}

function exportInfo(
  checker: ts.TypeChecker,
  program: ts.Program,
  file: string,
  name: string,
): ExportInfo | undefined {
  const source = program.getSourceFile(file)
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)
  const symbol = lookup(checker, moduleSymbol, name)
  if (symbol === undefined) return undefined
  const declaration = symbol.declarations?.[0]
  const parameters =
    declaration !== undefined &&
    (ts.isInterfaceDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isClassDeclaration(declaration))
      ? (declaration.typeParameters ?? [])
      : []
  const typeParameters = parameters.map(item => checker.getTypeAtLocation(item))
  const declarations = (symbol.declarations ?? []).map(item => sameText(item))
  return {
    symbol,
    isType: (symbol.flags & ts.SymbolFlags.Type) !== 0,
    isValue: (symbol.flags & ts.SymbolFlags.Value) !== 0,
    typeParameters,
    constraints: typeParameters.map(item => item.getConstraint()),
    text: declarations.join('\n'),
    declarations,
  }
}

function reordered(before: readonly string[], after: readonly string[]): boolean {
  if (before.length < 2 || before.join('\n') === after.join('\n')) return false
  return [...before].sort().join('\n') === [...after].sort().join('\n')
}

const anyCount = (text: string) => (text.match(/\bany\b/gu) ?? []).length

interface Printing {
  readonly checker: ts.TypeChecker
  readonly enclosing: ts.SourceFile | undefined
  readonly reach: Reachability
}

function planExport(
  plan: Plan,
  target: CompareTarget,
  ref: { old: string; new: string },
  o: ExportInfo | undefined,
  n: ExportInfo | undefined,
  printing: Printing,
): void {
  const pending = pendingFor(plan, target)
  if (o === undefined || n === undefined) {
    pending.problems.push({ kind: 'incomplete', why: '还原后的声明里找不到这个导出' })
    return
  }
  pending.reaches = [
    ...new Set([...printing.reach.from(o.symbol), ...printing.reach.from(n.symbol)]),
  ].sort(byCodeUnit)
  pending.same = o.text === n.text
  if (o.isType !== n.isType || o.isValue !== n.isValue)
    return settle(pending, '导出的含义变了（类型与值）')
  if (o.typeParameters.length !== n.typeParameters.length)
    return settle(pending, '类型参数的个数变了')
  if (anyCount(n.text) > anyCount(o.text)) settle(pending, '新增了 any')
  if (reordered(o.declarations, n.declarations)) settle(pending, '重载的顺序变了，调用按顺序选重载')
  if (o.isType) planType(plan, pending, ref, o, n, printing)
  if (o.isValue) planValue(plan, target, ref)
}

function emit(
  plan: Plan,
  target: CompareTarget,
  label: string,
  oldType: string,
  newType: string,
): void {
  plan.checks.push({ target, line: plan.lines.length, label, kind: 'assign' })
  plan.lines.push(
    `type __c${plan.lines.length} = [[${newType}] extends [${oldType}] ? 1 : 0, [${oldType}] extends [${newType}] ? 1 : 0];`,
  )
}

function planType(
  plan: Plan,
  pending: Pending,
  ref: { old: string; new: string },
  o: ExportInfo,
  n: ExportInfo,
  printing: Printing,
): void {
  const { combos, total } = instantiations(printing, o, n)
  if (total > INSTANCE_LIMIT)
    pending.problems.push({ kind: 'truncated', limit: INSTANCE_LIMIT, total })
  for (const args of combos) {
    const applied = args.length > 0 ? `<${args.join(', ')}>` : ''
    emit(
      plan,
      pending.target,
      `实例 ${applied === '' ? '（无类型参数）' : applied}`,
      `${ref.old}${applied}`,
      `${ref.new}${applied}`,
    )
  }
  if (o.typeParameters.length === 0) return
  const parameters = o.constraints
    .map(
      (constraint, i) =>
        `G${i}${constraint === undefined ? '' : ` extends ${typeText(printing, constraint)}`}`,
    )
    .join(', ')
  const applied = `<${o.typeParameters.map((_, i) => `G${i}`).join(', ')}>`
  const returning = (type: string) => `(<${parameters}>() => ${type}${applied})`
  emit(plan, pending.target, '（泛型整体）', returning(ref.old), returning(ref.new))
}

function planValue(plan: Plan, target: CompareTarget, ref: { old: string; new: string }): void {
  emit(plan, target, 'typeof', `typeof ${ref.old}`, `typeof ${ref.new}`)
  plan.checks.push({ target, line: plan.lines.length, label: '当值用（新）', kind: 'value-new' })
  plan.lines.push(`void ${ref.new};`)
  plan.checks.push({ target, line: plan.lines.length, label: '当值用（旧）', kind: 'value-old' })
  plan.lines.push(`void ${ref.old};`)
}

function typeText(printing: Printing, type: ts.Type): string {
  return printing.checker.typeToString(
    type,
    printing.enclosing,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
  )
}

function instantiations(
  printing: Printing,
  ...sides: readonly ExportInfo[]
): { combos: string[][]; total: number } {
  const seen = new Map<string, string[]>()
  for (const info of sides) {
    let combos: string[][] = [[]]
    info.typeParameters.forEach((parameter, i) => {
      const args = parameterArguments(printing, parameter, i)
      combos = combos.flatMap(previous => args.map(arg => [...previous, arg]))
    })
    for (const combo of combos) if (!seen.has(combo.join(', '))) seen.set(combo.join(', '), combo)
  }
  return { combos: [...seen.values()].slice(0, INSTANCE_LIMIT), total: seen.size }
}

function parameterArguments(printing: Printing, parameter: ts.Type, i: number): string[] {
  const constraint = printing.checker.getBaseConstraintOfType(parameter)
  if (constraint === undefined || (constraint.flags & ts.TypeFlags.Unknown) !== 0)
    return [`__P${i}`]
  const members = constraint.isUnion() ? constraint.types : [constraint]
  const literal = (type: ts.Type) =>
    (type.flags &
      (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral)) !==
    0
  if (members.every(literal)) return members.map(type => printing.checker.typeToString(type))
  return [`(__P${i} & ${typeText(printing, constraint)})`]
}

interface Outcome {
  readonly check: Check
  readonly readers: boolean
  readonly writers: boolean
  readonly incomplete: string | undefined
  readonly why: string
  readonly usable: boolean
}

function readResults(
  program: ts.Program,
  compareFile: string,
  overlay: ReadonlyMap<string, string>,
  plan: Plan,
): CheckerComparison {
  const source = program.getSourceFile(compareFile)
  const problems = sideProblems(program, compareFile, overlay)
  if (source === undefined)
    return {
      verdicts: [...plan.pending.values()].map(finish),
      problems: [...problems, '比较文件没有进程序'],
    }
  for (const check of plan.checks) accumulate(plan, outcomeOf(program, source, check))
  const owned = new Set(plan.checks.map(check => check.line))
  const stray: string[] = []
  for (const item of [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ]) {
    const line =
      item.start === undefined ? undefined : source.getLineAndCharacterOfPosition(item.start).line
    if (line === undefined || owned.has(line)) continue
    stray.push(
      `比较文件第 ${line + 1} 行 TS${item.code} ${ts.flattenDiagnosticMessageText(item.messageText, ' ').slice(0, 160)}`,
    )
  }
  return {
    verdicts: [...plan.pending.values()].map(finish),
    problems: [...problems, ...stray.slice(0, 3)],
  }
}

function outcomeOf(program: ts.Program, source: ts.SourceFile, check: Check): Outcome {
  const errors = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ].filter(
    item =>
      item.start !== undefined &&
      source.getLineAndCharacterOfPosition(item.start).line === check.line,
  )
  if (check.kind !== 'assign')
    return {
      check,
      readers: true,
      writers: true,
      incomplete: undefined,
      why: '',
      usable: errors.length === 0,
    }
  const declaration = source.statements
    .filter(ts.isTypeAliasDeclaration)
    .find(item => source.getLineAndCharacterOfPosition(item.getStart(source)).line === check.line)
  return { check, ...assignability(program.getTypeChecker(), declaration, errors), usable: true }
}

function accumulate(plan: Plan, outcome: Outcome): void {
  const entry = pendingFor(plan, outcome.check.target)
  if (outcome.check.kind !== 'assign') {
    entry.value[outcome.check.kind === 'value-new' ? 'new' : 'old'] = outcome.usable
    return
  }
  if (outcome.incomplete !== undefined) {
    entry.problems.push({
      kind: 'incomplete',
      why: `${outcome.check.label}：${outcome.incomplete}`,
    })
    return
  }
  entry.comparisons += 1
  if (outcome.readers && outcome.writers) return
  entry.readers &&= outcome.readers
  entry.writers &&= outcome.writers
  entry.problems.push({
    kind: 'direction',
    label: outcome.check.label,
    readers: outcome.readers,
    writers: outcome.writers,
    why: outcome.why,
  })
}

function finish(entry: Pending): Verdict {
  if (entry.value.new !== entry.value.old) {
    entry.readers = false
    entry.problems.push({
      kind: 'direction',
      label: '当值用',
      readers: false,
      writers: entry.writers,
      why: `能否当值用：旧 ${entry.value.old === true ? '能' : '不能'}，新 ${entry.value.new === true ? '能' : '不能'}`,
    })
  }
  return {
    target: entry.target,
    readers: entry.readers,
    writers: entry.writers,
    same: entry.same,
    comparisons: entry.comparisons,
    problems: entry.problems,
    reaches: entry.reaches,
  }
}

function assignability(
  checker: ts.TypeChecker,
  declaration: ts.TypeAliasDeclaration | undefined,
  errors: readonly ts.Diagnostic[],
): { readers: boolean; writers: boolean; incomplete: string | undefined; why: string } {
  const unfinished = (why: string) => ({ readers: true, writers: true, incomplete: why, why: '' })
  const error = errors[0]
  if (error !== undefined)
    return unfinished(
      `检查器报错 ${ts.flattenDiagnosticMessageText(error.messageText, ' ').slice(0, 160)}`,
    )
  if (declaration === undefined) return unfinished('比较没有生成')
  const printed = checker.typeToString(
    checker.getTypeFromTypeNode(declaration.type),
    undefined,
    ts.TypeFormatFlags.InTypeAlias,
  )
  const match = /^\[(0|1), (0|1)\]$/u.exec(printed)
  if (match === null) return unfinished(`比较结果认不出：${printed}`)
  const readers = match[1] === '1'
  const writers = match[2] === '1'
  const why = [readers ? '' : '新值不能交给旧读方', writers ? '' : '旧写方的值不被新声明接受']
    .filter(Boolean)
    .join('，')
  return { readers, writers, incomplete: undefined, why }
}

function sideProblems(
  program: ts.Program,
  compareFile: string,
  overlay: ReadonlyMap<string, string>,
): string[] {
  return program
    .getSourceFiles()
    .filter(file => file.fileName !== compareFile && overlay.has(file.fileName))
    .flatMap(file => [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ])
    .slice(0, 3)
    .map(
      item =>
        `${item.file === undefined ? '' : dirname(item.file.fileName).split('/').slice(-2).join('/') + ' '}TS${item.code} ${ts.flattenDiagnosticMessageText(item.messageText, ' ').slice(0, 160)}`,
    )
}
