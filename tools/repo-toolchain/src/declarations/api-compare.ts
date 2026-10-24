// 用 TypeScript 检查器比较两份快照：把新旧两份声明文件放进同一个程序，对每个导出名做双向可赋值性判断。
//   新 → 旧（readers）：已有的读方按旧形状读新值，仍然接受；
//   旧 → 新（writers）：已有的写方（提供者、替身、实现者）按旧形状产出的值，仍被接受。
// 判断全部由检查器做；这里只负责还原声明、生成比较文件、读结果。还原前对每侧做几项归一化，
// 让检查器的结论贴近「消费者还能不能编译」：
//   - 对别的模块与 `global` 的扩充改写成本侧的命名空间，两侧能同时存在；对本成员模块的扩充保留，各侧自然生效；
//   - 方法签名改成函数类型的属性，避开方法参数的双变；
//   - 本成员的 `unique symbol` 改成按文件与名字定位的字面量，两侧的品牌才能互相比较；
//   - 类的 private 与 `#` 成员删除、protected 放开，避开名义性；
//   - 新增 `any` 与「能否当值用」的变化另记为不兼容。
// 每个目标的结论带着比较条数与结构化的问题：方向不成立、检查器未完成、实例组合超限分开报，不合并成「失败」。
// 另给每个导出算它经本成员内部声明能到达的顶层语句，以及到达的、本次有扩充改动的外部接口：
// 分类层用前者判断哪些导出被改动「涉及」，用后者实现「导出引用了被扩充的外部接口」判 review。
// 规则来源与探针见 SPEC.md「分类」。
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from '@typescript/typescript6'
import {
  byCodeUnit,
  type ApiSnapshot,
  type DeclarationFile,
  type EntrySection,
} from './api-format.ts'
import { sameText, statementId } from './api-normalize.ts'
import { consumerCompilerOptions } from './compat.ts'

export type CompareTarget =
  | { readonly kind: 'export'; readonly entry: string; readonly name: string }
  | { readonly kind: 'augmentation'; readonly target: string; readonly name: string }

/** 被本成员扩充的外部接口：模块名（或 `global`）与接口名。 */
export interface AugmentedInterface {
  readonly target: string
  readonly name: string
}

/**
 * 一个目标上检查器发现的问题。direction：某条比较有一个方向不成立，或不必比较就能定的不兼容
 * （含义变了、类型参数个数变了、新增 any、重载换序、扩充增删）；incomplete：检查器没有给出结论；
 * truncated：类型参数的实例组合超过上限，没有全部比较。
 */
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
  /** 跑完的比较里没有一条说新值不能交给旧读方。 */
  readonly readers: boolean
  /** 跑完的比较里没有一条说旧写方的值不被新声明接受。 */
  readonly writers: boolean
  /** 两侧的声明文本相同（参数名不计）。 */
  readonly same: boolean
  /** 跑完的可赋值比较条数；0 表示没有任何比较覆盖这个目标。 */
  readonly comparisons: number
  readonly problems: readonly VerdictProblem[]
  /** 导出经本成员内部声明能到达的顶层语句（`statementId`，两侧并集）；扩充为空。 */
  readonly reaches: readonly string[]
  /** 导出到达的、本次有扩充改动的外部接口；扩充为空。 */
  readonly augmentedReferences: readonly AugmentedInterface[]
}

export interface CheckerComparison {
  readonly verdicts: readonly Verdict[]
  /** 还原出的声明本身有编译诊断（例如依赖没有构建）：结论不可信，按 review 计。 */
  readonly problems: readonly string[]
}

export interface CompareInput {
  /** 检出根（真实路径）；外部包从这里的 node_modules 解析，两侧解析到同一份。 */
  readonly root: string
  /** 成员目录；还原的声明放在它下面的虚拟目录里。 */
  readonly directory: string
  readonly before: ApiSnapshot
  readonly after: ApiSnapshot
  /** 两侧都有的导出：由调用方按入口对齐。 */
  readonly exports: readonly { readonly entry: string; readonly name: string }[]
}

/** 类型参数实例组合的上限；超过的目标记 truncated，不静默截断。 */
export const INSTANCE_LIMIT = 16

type Side = 'old' | 'new'

interface Augmentation {
  readonly target: string
  readonly name: string
  /** other：扩充块里的类、枚举、命名空间等，检查器不比较，变了就算没有覆盖。 */
  readonly kind: 'interface' | 'value' | 'type' | 'other'
  /** 写这个扩充的文件（dist 内相对路径）与它改写成的命名空间。 */
  readonly file: string
  readonly namespace: string
  readonly text: string
}

/** 一侧还原后的文件与扩充。 */
interface Restored {
  readonly files: Map<string, string>
  readonly augmentations: readonly Augmentation[]
}

export function compareSnapshots(input: CompareInput): CheckerComparison {
  const base = join(input.root, input.directory, '.omne-contract-api')
  const old = restore(base, 'old', input.before.files)
  const next = restore(base, 'new', input.after.files)
  const overlay = new Map([...old.files, ...next.files])
  const compareFile = join(base, 'compare.ts')
  overlay.set(compareFile, probeImports([...old.augmentations, ...next.augmentations]))
  const options = compareOptions(input.root)
  const first = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  const plan = planComparisons(first, base, input, old.augmentations, next.augmentations)
  overlay.set(compareFile, plan.lines.join('\n') + '\n')
  const second = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  return readResults(second, compareFile, overlay, plan)
}

/** 第一个程序的比较文件：导入每个被扩充的外部模块，供可达分析解析被扩充的接口。 */
function probeImports(augmentations: readonly Augmentation[]): string {
  const targets = [...new Set(augmentations.map(item => item.target))]
    .filter(target => target !== 'global')
    .sort(byCodeUnit)
  return [
    ...targets.map((target, i) => `import * as __m${i} from ${JSON.stringify(target)};`),
    'export {};',
    '',
  ].join('\n')
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
    getSourceFile: (file, language) => {
      const text = read(file)
      return text === undefined ? undefined : ts.createSourceFile(file, text, language, true)
    },
    fileExists: file => overlay.has(file) || existsSync(file),
    readFile: read,
    directoryExists: directory =>
      directory === base || directory.startsWith(base + '/') || existsSync(directory),
    realpath: file => (overlay.has(file) || file.startsWith(base) ? file : realpathSync(file)),
  }
}

function sidePath(base: string, side: Side, path: string): string {
  return join(base, side, path)
}

function restore(base: string, side: Side, files: readonly DeclarationFile[]): Restored {
  const restored = new Map<string, string>()
  const augmentations: Augmentation[] = []
  for (const file of files) {
    const result = prepareForChecker(file.path, file.code)
    restored.set(sidePath(base, side, file.path), result.text)
    augmentations.push(...result.augmentations)
  }
  return { files: restored, augmentations }
}

type Edit = readonly [start: number, end: number, replacement: string]

/** 一个声明文件的归一化（见文件开头）；返回改写后的文本与它写的对外扩充。 */
export function prepareForChecker(
  path: string,
  text: string,
): { text: string; augmentations: Augmentation[] } {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  const augmentations: Augmentation[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isModuleDeclaration(node) && node.parent === source && isForeignAugmentation(node)) {
      const result = rewriteAugmentation(source, path, node)
      edits.push(...result.edits)
      augmentations.push(...result.augmentations)
    }
    const edit =
      brandEdit(source, path, node) ?? classMemberEdit(source, node) ?? methodEdit(source, node)
    if (edit !== undefined) {
      edits.push(...edit)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { text: applyEdits(text, edits), augmentations }
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

function rewriteAugmentation(
  source: ts.SourceFile,
  path: string,
  node: ts.ModuleDeclaration,
): { edits: Edit[]; augmentations: Augmentation[] } {
  const target = ts.isStringLiteral(node.name) ? node.name.text : 'global'
  const namespace = '__aug_' + target.replace(/[^A-Za-z0-9]/gu, '_')
  const body = node.body !== undefined && ts.isModuleBlock(node.body) ? node.body : undefined
  if (body === undefined) return { edits: [], augmentations: [] }
  const edits: Edit[] = [
    [node.getStart(source), body.getStart(source), `export declare namespace ${namespace} `],
  ]
  const augmentations: Augmentation[] = []
  for (const statement of body.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    const exported = modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)
    if (exported !== true)
      edits.push([statement.getStart(source), statement.getStart(source), 'export '])
    augmentations.push(...augmentationsOf(statement, { target, namespace, file: path, source }))
  }
  return { edits, augmentations }
}

function augmentationsOf(
  statement: ts.Statement,
  at: { target: string; namespace: string; file: string; source: ts.SourceFile },
): Augmentation[] {
  const base = {
    target: at.target,
    namespace: at.namespace,
    file: at.file,
    text: sameText(statement, at.source),
  }
  if (ts.isInterfaceDeclaration(statement))
    return [{ ...base, name: statement.name.text, kind: 'interface' }]
  if (ts.isTypeAliasDeclaration(statement))
    return [{ ...base, name: statement.name.text, kind: 'type' }]
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map(item => ({
      ...base,
      name: item.name.getText(at.source),
      kind: 'value',
    }))
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined)
    return [{ ...base, name: statement.name.text, kind: 'value' }]
  if (
    (ts.isClassDeclaration(statement) || ts.isModuleDeclaration(statement)) &&
    statement.name !== undefined &&
    ts.isIdentifier(statement.name)
  )
    return [{ ...base, name: statement.name.text, kind: 'other' }]
  if (ts.isEnumDeclaration(statement))
    return [{ ...base, name: statement.name.text, kind: 'other' }]
  return []
}

/** `unique symbol` 改成按文件与外层名字定位的字面量：两侧同一处声明的品牌相同，不同处的仍不同。 */
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

/** 类的 private 与 `#` 成员删除，protected 去掉：两侧的类按结构而不是按声明比较。 */
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

/** `m(p): r` 改成 `m: (p) => r`，重载合成一个调用签名集合，让 strictFunctionTypes 生效。 */
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
  /** 各个声明的比较文本，按出现顺序（重载）。 */
  readonly declarations: readonly string[]
}

interface Check {
  readonly target: CompareTarget
  readonly line: number
  readonly label: string
  readonly kind: 'assign' | 'value-new' | 'value-old'
}

/** 一个目标在计划与读结果期间积累的结论。 */
interface Pending {
  readonly target: CompareTarget
  same: boolean
  readers: boolean
  writers: boolean
  comparisons: number
  readonly problems: VerdictProblem[]
  reaches: readonly string[]
  augmentedReferences: readonly AugmentedInterface[]
  readonly value: { new?: boolean; old?: boolean }
}

interface Plan {
  readonly lines: string[]
  readonly checks: Check[]
  /** 辅助行（合并扩充的接口声明）属于哪个目标：这些行上的诊断记为该目标未完成。 */
  readonly helpers: Map<number, CompareTarget>
  readonly pending: Map<string, Pending>
}

const targetId = (target: CompareTarget) =>
  `${target.kind}\u0000${target.kind === 'export' ? target.entry : target.target}\u0000${target.name}`

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
    augmentedReferences: [],
    value: {},
  }
  plan.pending.set(id, created)
  return created
}

/** 不必跑检查器就能定的不兼容：两个方向都不成立。 */
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

function planComparisons(
  program: ts.Program,
  base: string,
  input: CompareInput,
  oldAugmentations: readonly Augmentation[],
  newAugmentations: readonly Augmentation[],
): Plan {
  const plan: Plan = { lines: [], checks: [], helpers: new Map(), pending: new Map() }
  const checker = program.getTypeChecker()
  const enclosing = program.getSourceFile(join(base, 'compare.ts'))
  const reach = new Reachability(
    checker,
    base,
    augmentedTargets(checker, enclosing, changedAugmentations(oldAugmentations, newAugmentations)),
  )
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
    planExport(
      plan,
      { kind: 'export', entry: item.entry, name: item.name },
      refs(before, after, item.name),
      o,
      n,
      { checker, enclosing, reach },
    )
  }
  for (const augmentation of oldAugmentations) use('old', augmentation.file)
  for (const augmentation of newAugmentations) use('new', augmentation.file)
  planAugmentations(plan, oldAugmentations, newAugmentations)
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
  const helpers = [...plan.helpers].map(([line, target]): [number, CompareTarget] => [
    line + shift,
    target,
  ])
  plan.helpers.clear()
  for (const [line, target] of helpers) plan.helpers.set(line, target)
  return plan
}

const augmentationKey = (item: AugmentedInterface) => `${item.target}\u0000${item.name}`

/** 两侧扩充文本不同（含只在一侧有）的（目标，名字）。 */
function changedAugmentations(
  olds: readonly Augmentation[],
  news: readonly Augmentation[],
): AugmentedInterface[] {
  const texts = (list: readonly Augmentation[], key: string) =>
    list
      .filter(item => augmentationKey(item) === key)
      .map(item => item.text)
      .join('|')
  const all = [...olds, ...news]
  return [...new Set(all.map(augmentationKey))]
    .filter(key => texts(olds, key) !== texts(news, key))
    .map(key => {
      const [target = '', name = ''] = key.split('\u0000')
      return { target, name }
    })
}

/** 被扩充的外部接口在检查器里的符号：模块的导出经第一个程序的探针导入解析，`global` 按名字解析。 */
function augmentedTargets(
  checker: ts.TypeChecker,
  enclosing: ts.SourceFile | undefined,
  changed: readonly AugmentedInterface[],
): Map<ts.Symbol, AugmentedInterface> {
  const targets = new Map<ts.Symbol, AugmentedInterface>()
  if (enclosing === undefined) return targets
  const modules = new Map<string, ts.Symbol>()
  for (const statement of enclosing.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const symbol = checker.getSymbolAtLocation(statement.moduleSpecifier)
    if (symbol !== undefined) modules.set(statement.moduleSpecifier.text, symbol)
  }
  for (const item of changed) {
    const symbol =
      item.target === 'global'
        ? checker.resolveName(item.name, enclosing, ts.SymbolFlags.Type, false)
        : lookup(checker, modules.get(item.target), item.name)
    if (symbol !== undefined) targets.set(symbol, item)
  }
  return targets
}

/** 从一个符号出发，沿本成员还原的声明里的标识符走：收集到达的顶层语句与被扩充的外部接口。 */
class Reachability {
  private readonly adjacency = new Map<ts.Symbol, readonly ts.Symbol[]>()
  private readonly checker: ts.TypeChecker
  private readonly base: string
  private readonly targets: ReadonlyMap<ts.Symbol, AugmentedInterface>

  constructor(
    checker: ts.TypeChecker,
    base: string,
    targets: ReadonlyMap<ts.Symbol, AugmentedInterface>,
  ) {
    this.checker = checker
    this.base = base
    this.targets = targets
  }

  from(start: ts.Symbol): { reaches: string[]; augmented: AugmentedInterface[] } {
    const visited = new Set<ts.Symbol>()
    const reaches = new Set<string>()
    const augmented = new Map<string, AugmentedInterface>()
    const queue = [start]
    for (let symbol = queue.pop(); symbol !== undefined; symbol = queue.pop()) {
      if (visited.has(symbol)) continue
      visited.add(symbol)
      const target = this.targets.get(symbol)
      if (target !== undefined) augmented.set(augmentationKey(target), target)
      for (const declaration of symbol.declarations ?? []) {
        const id = this.statementOf(declaration)
        if (id === undefined) continue
        reaches.add(id)
        queue.push(...this.referenced(symbol))
      }
    }
    return {
      reaches: [...reaches].sort(byCodeUnit),
      augmented: [...augmented.values()].sort((a, b) =>
        byCodeUnit(augmentationKey(a), augmentationKey(b)),
      ),
    }
  }

  /** 声明所在的顶层语句的 `statementId`；不在还原的文件里（外部包、lib）时是 undefined。 */
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

/** 同一组声明（重载）只是换了顺序。 */
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
  const oldReach = printing.reach.from(o.symbol)
  const newReach = printing.reach.from(n.symbol)
  pending.reaches = [...new Set([...oldReach.reaches, ...newReach.reaches])].sort(byCodeUnit)
  pending.augmentedReferences = [
    ...new Map(
      [...oldReach.augmented, ...newReach.augmented].map(item => [augmentationKey(item), item]),
    ).values(),
  ]
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
  // 实例取两侧约束的并集：新侧放宽了约束时，新的实参在旧侧不成立，比较行报错，记为未完成。
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
  // 延迟形式：类型参数不实例化，条件类型与索引访问保持未求值，按类型参数整体比较。
  // 只用一种写法（泛型函数的返回值）证明两个方向；检查器在两份相同、又互相嵌套的别名实例上
  // 可能撞到递归深度的启发式而判不可赋值，这类误报落向 review（SPEC「已知限制」）。
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

/**
 * 类型参数的实例：约束是字面量联合时逐个展开，否则用不透明的品牌类型 `__Pi & 约束`。
 * 两侧各算一组再取并集（按文本去重）。返回前 INSTANCE_LIMIT 组与总数；总数超限由调用方记 truncated。
 */
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

/** 对外扩充按（目标，名字）合并后比较：接口取各侧全部扩充的合并，值取类型。 */
function planAugmentations(
  plan: Plan,
  olds: readonly Augmentation[],
  news: readonly Augmentation[],
): void {
  for (const id of [...new Set([...olds, ...news].map(augmentationKey))].sort(byCodeUnit)) {
    const o = olds.filter(item => augmentationKey(item) === id)
    const n = news.filter(item => augmentationKey(item) === id)
    const first = o[0] ?? n[0]
    if (first === undefined) continue
    const target: CompareTarget = { kind: 'augmentation', target: first.target, name: first.name }
    planAugmentation(plan, target, o, n)
  }
}

function planAugmentation(
  plan: Plan,
  target: CompareTarget,
  o: readonly Augmentation[],
  n: readonly Augmentation[],
): void {
  const pending = pendingFor(plan, target)
  const ref = (side: Side, list: readonly Augmentation[]) =>
    list.map(item => `${alias(side, item.file)}.${item.namespace}.${item.name}`)
  const texts = (list: readonly Augmentation[]) => list.map(item => item.text).join('|')
  pending.same = o.length > 0 && n.length > 0 && texts(o) === texts(n)
  if (n.length === 0) return settle(pending, '扩充删除了')
  const kind = (o[0] ?? n[0])?.kind
  if (o.length === 0 && n.every(item => item.kind === 'interface')) {
    // 新增的扩充对着空接口比：全是可选成员、没有继承时两个方向都成立。
    const id = helperLines(plan, target, [
      `interface __AO${id0(plan)} {}`,
      `interface __AN${id0(plan)} extends ${ref('new', n).join(', ')} {}`,
    ])
    return emit(plan, target, '新增的扩充（对空接口）', `__AO${id}`, `__AN${id}`)
  }
  if (o.length === 0) return settle(pending, '新增的扩充不是接口')
  if (kind === 'other') return
  if (kind !== 'interface') {
    const prefix = kind === 'value' ? 'typeof ' : ''
    return emit(
      plan,
      target,
      '扩充',
      `${prefix}${ref('old', o)[0] ?? ''}`,
      `${prefix}${ref('new', n)[0] ?? ''}`,
    )
  }
  const id = helperLines(plan, target, [
    `interface __AO${id0(plan)} extends ${ref('old', o).join(', ')} {}`,
    `interface __AN${id0(plan)} extends ${ref('new', n).join(', ')} {}`,
  ])
  emit(plan, target, '扩充（合并后）', `__AO${id}`, `__AN${id}`)
}

const id0 = (plan: Plan) => plan.lines.length

/** 写几行属于某个目标的辅助声明，返回它们的编号（第一行的行号）。 */
function helperLines(plan: Plan, target: CompareTarget, lines: readonly string[]): number {
  const id = plan.lines.length
  for (const line of lines) {
    plan.helpers.set(plan.lines.length, target)
    plan.lines.push(line)
  }
  return id
}

interface Outcome {
  readonly check: Check
  readonly readers: boolean
  readonly writers: boolean
  readonly incomplete: string | undefined
  readonly why: string
  /** 值检查：这一行没有报错（能当值用）。 */
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
    const message = `TS${item.code} ${ts.flattenDiagnosticMessageText(item.messageText, ' ').slice(0, 160)}`
    const target = plan.helpers.get(line)
    if (target !== undefined)
      pendingFor(plan, target).problems.push({
        kind: 'incomplete',
        why: `合并扩充的声明报错 ${message}`,
      })
    else stray.push(`比较文件第 ${line + 1} 行 ${message}`)
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
    augmentedReferences: entry.augmentedReferences,
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
  // 比较结果是 `[1|0, 1|0]` 元组：按检查器打印出的文本读，免得转型。
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
