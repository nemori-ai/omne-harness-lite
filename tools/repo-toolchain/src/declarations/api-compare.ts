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
import { sameText } from './api-normalize.ts'
import { consumerCompilerOptions } from './compat.ts'

export type CompareTarget =
  | { readonly kind: 'export'; readonly entry: string; readonly name: string }
  | { readonly kind: 'augmentation'; readonly target: string; readonly name: string }

export interface Verdict {
  readonly target: CompareTarget
  /** 新值仍能交给按旧形状写的读方。 */
  readonly readers: boolean
  /** 按旧形状写的写方产出的值仍被接受。 */
  readonly writers: boolean
  /** 两侧的声明文本相同（参数名不计）；双向可赋值且文本相同才是 none。 */
  readonly same: boolean
  /** 不兼容的具体原因：检查器报错、新增 any、能否当值用变了、实例化出的哪个比较不成立。 */
  readonly notes: readonly string[]
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

type Side = 'old' | 'new'

interface Augmentation {
  readonly target: string
  readonly name: string
  readonly kind: 'interface' | 'value' | 'type'
  readonly optionalOnly: boolean
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
  overlay.set(compareFile, 'export {};\n')
  const options = compareOptions(input.root)
  const first = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  const plan = planComparisons(first, base, input, old.augmentations, next.augmentations)
  overlay.set(compareFile, plan.lines.join('\n') + '\n')
  const second = ts.createProgram([...overlay.keys()], options, overlayHost(options, overlay, base))
  return readResults(second, compareFile, overlay, plan)
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
    text: statement.getText(at.source).replace(/\s+/gu, ' '),
  }
  if (ts.isInterfaceDeclaration(statement))
    return [
      {
        ...base,
        name: statement.name.text,
        kind: 'interface',
        optionalOnly:
          statement.heritageClauses === undefined && statement.members.every(isOptional),
      },
    ]
  if (ts.isTypeAliasDeclaration(statement))
    return [{ ...base, name: statement.name.text, kind: 'type', optionalOnly: false }]
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map(item => ({
      ...base,
      name: item.name.getText(at.source),
      kind: 'value',
      optionalOnly: false,
    }))
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined)
    return [{ ...base, name: statement.name.text, kind: 'value', optionalOnly: false }]
  return []
}

function isOptional(member: ts.TypeElement): boolean {
  return member.questionToken !== undefined
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
  /** 同一组的几种写法：某个方向任一写法成立即成立。 */
  readonly group?: string
}

interface Plan {
  readonly lines: string[]
  readonly checks: Check[]
  /** 不必跑检查器就能定的结论（含义变了、类型参数个数变了、新增 any、扩充增删）。 */
  readonly settled: Verdict[]
  readonly same: Map<string, boolean>
}

const targetId = (target: CompareTarget) =>
  `${target.kind}\u0000${target.kind === 'export' ? target.entry : target.target}\u0000${target.name}`

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
  const plan: Plan = { lines: [], checks: [], settled: [], same: new Map() }
  const checker = program.getTypeChecker()
  const enclosing = program.getSourceFile(join(base, 'compare.ts'))
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
      { checker, enclosing },
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
  return plan
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
    found =
      symbol === undefined
        ? undefined
        : symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol
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
  return {
    isType: (symbol.flags & ts.SymbolFlags.Type) !== 0,
    isValue: (symbol.flags & ts.SymbolFlags.Value) !== 0,
    typeParameters,
    constraints: typeParameters.map(item => item.getConstraint()),
    text: (symbol.declarations ?? []).map(sameText).join('\n'),
    declarations: (symbol.declarations ?? []).map(sameText),
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
}

function planExport(
  plan: Plan,
  target: CompareTarget,
  ref: { old: string; new: string },
  o: ExportInfo | undefined,
  n: ExportInfo | undefined,
  printing: Printing,
): void {
  const settle = (note: string): void => {
    plan.settled.push({ target, readers: false, writers: false, same: false, notes: [note] })
  }
  if (o === undefined || n === undefined) return settle('还原后的声明里找不到这个导出')
  if (o.isType !== n.isType || o.isValue !== n.isValue) return settle('导出的含义变了（类型与值）')
  if (o.typeParameters.length !== n.typeParameters.length) return settle('类型参数的个数变了')
  if (anyCount(n.text) > anyCount(o.text)) settle('新增了 any')
  if (reordered(o.declarations, n.declarations)) settle('重载的顺序变了，调用按顺序选重载')
  plan.same.set(targetId(target), o.text === n.text)
  if (o.isType) planType(plan, target, ref, o, n, printing)
  if (o.isValue) planValue(plan, target, ref)
}

function emit(
  plan: Plan,
  target: CompareTarget,
  label: string,
  oldType: string,
  newType: string,
  group?: string,
): void {
  plan.checks.push({
    target,
    line: plan.lines.length,
    label,
    kind: 'assign',
    ...(group === undefined ? {} : { group }),
  })
  plan.lines.push(
    `type __c${plan.lines.length} = [[${newType}] extends [${oldType}] ? 1 : 0, [${oldType}] extends [${newType}] ? 1 : 0];`,
  )
}

function planType(
  plan: Plan,
  target: CompareTarget,
  ref: { old: string; new: string },
  o: ExportInfo,
  n: ExportInfo,
  printing: Printing,
): void {
  for (const args of instantiations(printing, o)) {
    const applied = args.length > 0 ? `<${args.join(', ')}>` : ''
    emit(
      plan,
      target,
      `实例 ${applied === '' ? '（无类型参数）' : applied}`,
      `${ref.old}${applied}`,
      `${ref.new}${applied}`,
    )
  }
  if (o.typeParameters.length === 0) return
  // 延迟形式：类型参数不实例化，条件类型与索引访问保持未求值，按类型参数整体比较。
  // 检查器在两份相同、又互相嵌套的别名实例上会撞到递归深度的启发式，把相同的类型判成不可赋值；
  // 返回值位置与参数位置各有撞上的例子（tool-contract 的 ToolBindings、execution-environment-contract 的
  // EnvironmentLease）。所以两种写法都比，任一种证明了某个方向可赋值，这个方向就成立：检查器给出的「可赋值」
  // 是证明，「不可赋值」可能来自启发式。参数位置按逆变比较，所以两侧对调传给 emit。
  const parameters = (info: ExportInfo) =>
    info.constraints
      .map(
        (constraint, i) =>
          `G${i}${constraint === undefined ? '' : ` extends ${typeText(printing, constraint)}`}`,
      )
      .join(', ')
  const applied = `<${o.typeParameters.map((_, i) => `G${i}`).join(', ')}>`
  const returning = (info: ExportInfo, type: string) =>
    `(<${parameters(info)}>() => ${type}${applied})`
  const taking = (info: ExportInfo, type: string) =>
    `(<${parameters(info)}>(value: ${type}${applied}) => void)`
  const group = `${targetId(target)}\u0000deferred`
  emit(plan, target, '（泛型整体）', returning(o, ref.old), returning(n, ref.new), group)
  emit(plan, target, '（泛型整体）', taking(n, ref.new), taking(o, ref.old), group)
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

/** 类型参数的实例：约束是字面量联合时逐个展开，否则用不透明的品牌类型 `__Pi & 约束`；最多 16 组。 */
function instantiations(printing: Printing, info: ExportInfo): string[][] {
  let combos: string[][] = [[]]
  info.typeParameters.forEach((parameter, i) => {
    const args = parameterArguments(printing, parameter, i)
    combos = combos.flatMap(previous => args.map(arg => [...previous, arg]))
  })
  return combos.slice(0, 16)
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
  const key = (item: Augmentation) => `${item.target}\u0000${item.name}`
  for (const id of [...new Set([...olds, ...news].map(key))].sort(byCodeUnit)) {
    const o = olds.filter(item => key(item) === id)
    const n = news.filter(item => key(item) === id)
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
  const ref = (side: Side, list: readonly Augmentation[]) =>
    list.map(item => `${alias(side, item.file)}.${item.namespace}.${item.name}`)
  if (o.length === 0) {
    const additive = n.every(item => item.optionalOnly)
    plan.settled.push({
      target,
      readers: additive,
      writers: additive,
      same: false,
      notes: additive ? [] : ['新增的扩充有必填成员或不是接口'],
    })
    return
  }
  if (n.length === 0) {
    plan.settled.push({
      target,
      readers: false,
      writers: false,
      same: false,
      notes: ['扩充删除了'],
    })
    return
  }
  plan.same.set(
    targetId(target),
    o.map(item => item.text).join('|') === n.map(item => item.text).join('|'),
  )
  const first = o[0]
  if (first?.kind !== 'interface') {
    const prefix = first?.kind === 'value' ? 'typeof ' : ''
    emit(
      plan,
      target,
      '扩充',
      `${prefix}${ref('old', o)[0] ?? ''}`,
      `${prefix}${ref('new', n)[0] ?? ''}`,
    )
    return
  }
  const id = plan.lines.length
  plan.lines.push(
    `interface __AO${id} extends ${ref('old', o).join(', ')} {}`,
    `interface __AN${id} extends ${ref('new', n).join(', ')} {}`,
  )
  emit(plan, target, '扩充（合并后）', `__AO${id}`, `__AN${id}`)
}

interface Outcome {
  readonly check: Check
  readonly readers: boolean
  readonly writers: boolean
  readonly note: string
  /** 值检查：这一行没有报错（能当值用）。 */
  readonly usable: boolean
}

interface Accumulated {
  readonly target: CompareTarget
  readers: boolean
  writers: boolean
  readonly notes: string[]
  readonly value: { new?: boolean; old?: boolean }
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
    return { verdicts: plan.settled, problems: [...problems, '比较文件没有进程序'] }
  const outcomes = combineGroups(plan.checks.map(check => outcomeOf(program, source, check)))
  const byTarget = new Map<string, Accumulated>()
  for (const outcome of outcomes) accumulate(byTarget, outcome)
  const verdicts: Verdict[] = [...plan.settled]
  for (const [id, entry] of byTarget) verdicts.push(finish(entry, plan.same.get(id) === true))
  return { verdicts: mergeSettled(verdicts), problems }
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
    return { check, readers: true, writers: true, note: '', usable: errors.length === 0 }
  const declaration = source.statements
    .filter(ts.isTypeAliasDeclaration)
    .find(item => source.getLineAndCharacterOfPosition(item.getStart(source)).line === check.line)
  return { check, ...assignability(program.getTypeChecker(), declaration, errors), usable: true }
}

/** 同组的几种写法合成一条：每个方向任一写法成立即成立。没有组的检查原样保留。 */
function combineGroups(outcomes: readonly Outcome[]): Outcome[] {
  const groups = new Map<string, Outcome[]>()
  const order: (Outcome | string)[] = []
  for (const outcome of outcomes) {
    const group = outcome.check.group
    if (group === undefined) {
      order.push(outcome)
      continue
    }
    if (!groups.has(group)) order.push(group)
    groups.set(group, [...(groups.get(group) ?? []), outcome])
  }
  return order.flatMap(item => (typeof item === 'string' ? either(groups.get(item) ?? []) : [item]))
}

function either(forms: readonly Outcome[]): Outcome[] {
  const [first] = forms
  if (first === undefined) return []
  const readers = forms.some(item => item.readers)
  const writers = forms.some(item => item.writers)
  const note = readers && writers ? '' : (forms.find(item => item.note !== '')?.note ?? '')
  return [{ ...first, readers, writers, note }]
}

function accumulate(byTarget: Map<string, Accumulated>, outcome: Outcome): void {
  const id = targetId(outcome.check.target)
  const entry = byTarget.get(id) ?? {
    target: outcome.check.target,
    readers: true,
    writers: true,
    notes: [],
    value: {},
  }
  byTarget.set(id, entry)
  if (outcome.check.kind !== 'assign') {
    entry.value[outcome.check.kind === 'value-new' ? 'new' : 'old'] = outcome.usable
    return
  }
  if (outcome.readers && outcome.writers) return
  entry.readers &&= outcome.readers
  entry.writers &&= outcome.writers
  entry.notes.push(`${outcome.check.label}：${outcome.note}`)
}

function finish(entry: Accumulated, same: boolean): Verdict {
  if (entry.value.new !== entry.value.old) {
    entry.readers = false
    entry.notes.push(
      `能否当值用：旧 ${entry.value.old === true ? '能' : '不能'}，新 ${entry.value.new === true ? '能' : '不能'}`,
    )
  }
  return {
    target: entry.target,
    readers: entry.readers,
    writers: entry.writers,
    same,
    notes: entry.notes,
  }
}

/** 同一目标的多条结论合成一条：任一方向不成立即不成立。 */
function mergeSettled(verdicts: readonly Verdict[]): Verdict[] {
  const merged = new Map<string, Verdict>()
  for (const verdict of verdicts) {
    const previous = merged.get(targetId(verdict.target))
    merged.set(
      targetId(verdict.target),
      previous === undefined
        ? verdict
        : {
            target: verdict.target,
            readers: previous.readers && verdict.readers,
            writers: previous.writers && verdict.writers,
            same: previous.same && verdict.same,
            notes: [...previous.notes, ...verdict.notes],
          },
    )
  }
  return [...merged.values()]
}

function assignability(
  checker: ts.TypeChecker,
  declaration: ts.TypeAliasDeclaration | undefined,
  errors: readonly ts.Diagnostic[],
): { readers: boolean; writers: boolean; note: string } {
  const error = errors[0]
  if (error !== undefined)
    return {
      readers: false,
      writers: false,
      note: `检查器报错 ${ts.flattenDiagnosticMessageText(error.messageText, ' ').slice(0, 160)}`,
    }
  if (declaration === undefined) return { readers: false, writers: false, note: '比较没有生成' }
  // 比较结果是 `[1|0, 1|0]` 元组：按检查器打印出的文本读，免得转型。
  const printed = checker.typeToString(
    checker.getTypeFromTypeNode(declaration.type),
    undefined,
    ts.TypeFormatFlags.InTypeAlias,
  )
  const match = /^\[(0|1), (0|1)\]$/u.exec(printed)
  if (match === null) return { readers: false, writers: false, note: `比较结果认不出：${printed}` }
  const readers = match[1] === '1'
  const writers = match[2] === '1'
  const note = [readers ? '' : '新值不能交给旧读方', writers ? '' : '旧写方的值不被新声明接受']
    .filter(Boolean)
    .join('，')
  return { readers, writers, note }
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
