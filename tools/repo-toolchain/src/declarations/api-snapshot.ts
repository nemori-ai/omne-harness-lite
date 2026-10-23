// 契约 API 快照：用 TypeScript 6 读契约成员 dist 里的声明，按 `exports` 入口列出导出符号与声明文本。
// 程序与选项同声明兼容检查（compat.ts）：消费者视角，成员之间的导入解析到对方的 dist。
// 输出只取决于成员自己的声明：注释与空白经 TypeScript 打印器规范化，符号按名字的码位排序，
// 别的成员写进来的模块扩充不进本成员的快照，记在写扩充的那个成员里。
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from '@typescript/typescript6'
import { consumerCompilerOptions } from './compat.ts'

/** 快照的三类节；分类时按节的类别取规则。 */
export const SECTION_ENTRY = '入口'
export const SECTION_INTERNAL = '内部引用'
export const SECTION_AUGMENTATION = '模块扩充'

export interface ContractMember {
  /** 仓库相对目录，例如 `packages/common/message`。 */
  readonly path: string
  /** `package.json` 的 `name`。 */
  readonly name: string
  /** `exports` 的子路径与它的 `types` 文件（成员相对）。 */
  readonly entries: readonly { readonly subpath: string; readonly types: string }[]
}

export interface MemberSnapshot {
  readonly member: string
  readonly name: string
  readonly text: string
}

export interface SnapshotRun {
  readonly typescript: string
  readonly snapshots: readonly MemberSnapshot[]
  /** 没有 dist 的成员：这次没生成。 */
  readonly unbuilt: readonly string[]
  /** 成员声明不全（入口文件缺失、`exports` 没有 `types`）：逐条说明，不生成该成员的快照。 */
  readonly problems: readonly { readonly member: string; readonly message: string }[]
}

/** 读成员的 `package.json`；`exports` 每个子路径取 `types` 条件。 */
export function readContractMember(
  root: string,
  member: string,
): ContractMember | { readonly member: string; readonly message: string } {
  const manifestPath = join(root, member, 'package.json')
  if (!existsSync(manifestPath)) return { member, message: '没有 package.json' }
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (typeof manifest !== 'object' || manifest === null)
    return { member, message: 'package.json 不是对象' }
  const name = 'name' in manifest ? manifest.name : undefined
  const exports = 'exports' in manifest ? manifest.exports : undefined
  if (typeof name !== 'string' || name === '') return { member, message: 'package.json 没有 name' }
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports))
    return { member, message: 'package.json 的 exports 不是按子路径的对象' }
  const entries: { subpath: string; types: string }[] = []
  for (const [subpath, target] of Object.entries(exports)) {
    const types =
      typeof target === 'object' && target !== null && 'types' in target ? target.types : undefined
    if (typeof types !== 'string') return { member, message: `exports 的 ${subpath} 没有 types` }
    entries.push({ subpath, types })
  }
  entries.sort((a, b) => compareCodePoints(a.subpath, b.subpath))
  return { path: member, name, entries }
}

/** 为 `members`（仓库相对）各生成一份快照文本；它们共用一个程序。 */
export function snapshotContracts(root: string, members: readonly string[]): SnapshotRun {
  const realRoot = realpathSync(root)
  const unbuilt: string[] = []
  const problems: { member: string; message: string }[] = []
  const built: ContractMember[] = []
  for (const path of members) {
    const read = readContractMember(realRoot, path)
    if (!('entries' in read)) {
      problems.push(read)
      continue
    }
    if (!existsSync(join(realRoot, path, 'dist'))) {
      unbuilt.push(path)
      continue
    }
    const missing = read.entries.find(entry => !existsSync(join(realRoot, path, entry.types)))
    if (missing !== undefined) {
      problems.push({ member: path, message: `入口 ${missing.subpath} 的 ${missing.types} 不存在` })
      continue
    }
    built.push(read)
  }
  const rootNames = built.flatMap(member =>
    member.entries.map(entry => join(realRoot, member.path, entry.types)),
  )
  const program = ts.createProgram({ rootNames, options: consumerCompilerOptions(realRoot) })
  const snapshots = built.map(member => ({
    member: member.path,
    name: member.name,
    text: renderMember(program, realRoot, member),
  }))
  return { typescript: ts.version, snapshots, unbuilt, problems }
}

export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

interface Item {
  readonly heading: string
  readonly code: string
}

function renderMember(program: ts.Program, root: string, member: ContractMember): string {
  const checker = program.getTypeChecker()
  const dist = join(root, member.path, 'dist') + sep
  const own = (node: ts.Node) => realpathSync(node.getSourceFile().fileName).startsWith(dist)
  const lines = [
    `# ${member.name} 的 API 快照`,
    '',
    '> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。',
  ]
  const exported = new Set<ts.Symbol>()
  const entries: { subpath: string; items: Item[] }[] = []
  for (const entry of member.entries) {
    const file = program.getSourceFile(join(root, member.path, entry.types))
    const moduleSymbol = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    const symbols = moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol)
    const items: Item[] = []
    for (const symbol of [...symbols].sort((a, b) => compareCodePoints(a.name, b.name))) {
      const item = exportItem(checker, root, symbol, own)
      if (item === undefined) continue
      exported.add(resolveAlias(checker, symbol))
      items.push(item)
    }
    entries.push({ subpath: entry.subpath, items })
  }
  for (const entry of entries)
    appendSection(lines, `${SECTION_ENTRY} \`${entry.subpath}\``, entry.items)
  appendSection(lines, SECTION_INTERNAL, internalItems(checker, exported, own))
  for (const [target, items] of augmentations(program, root, member, own))
    appendSection(lines, `${SECTION_AUGMENTATION} \`${target}\``, items)
  return lines.join('\n') + '\n'
}

function appendSection(lines: string[], title: string, items: readonly Item[]): void {
  lines.push('', `## ${title}`)
  if (items.length === 0) lines.push('', '（无）')
  for (const item of items) lines.push('', `### ${item.heading}`, '', '```ts', item.code, '```')
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

/** 别名链上任何一层是 `export type`／`import type`，消费者就只能当类型用。 */
function typeOnlyAlias(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  let current: ts.Symbol | undefined = symbol
  const seen = new Set<ts.Symbol>()
  while (current !== undefined && current.flags & ts.SymbolFlags.Alias && !seen.has(current)) {
    seen.add(current)
    if ((current.declarations ?? []).some(isTypeOnlyDeclaration)) return true
    current = checker.getImmediateAliasedSymbol(current)
  }
  return false
}

function isTypeOnlyDeclaration(node: ts.Declaration): boolean {
  if (ts.isExportSpecifier(node) || ts.isImportSpecifier(node))
    return node.isTypeOnly || ts.isTypeOnlyImportOrExportDeclaration(node)
  return ts.isTypeOnlyImportOrExportDeclaration(node)
}

/** 声明在 `declare module '…'`／`declare global` 里：它是模块扩充，归写它的成员的扩充节。 */
function insideAugmentation(node: ts.Node): boolean {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent)
    if (ts.isModuleDeclaration(parent) && isAugmentationBlock(parent)) return true
  return false
}

function isAugmentationBlock(node: ts.ModuleDeclaration): boolean {
  return ts.isStringLiteral(node.name) || (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0
}

function exportItem(
  checker: ts.TypeChecker,
  root: string,
  symbol: ts.Symbol,
  own: (node: ts.Node) => boolean,
): Item | undefined {
  const target = resolveAlias(checker, symbol)
  const declarations = sortDeclarations(
    (target.declarations ?? []).filter(node => !insideAugmentation(node)),
  )
  // 只由别的成员的模块扩充加进来的名字，不算本成员导出的。
  if (declarations.length === 0) return undefined
  const mine = declarations.filter(own)
  const typeOnly = typeOnlyAlias(checker, symbol) && (target.flags & ts.SymbolFlags.Value) !== 0
  const renamed = target.name !== symbol.name && target.name !== 'default'
  const heading =
    `\`${symbol.name}\`` + (renamed ? ` = \`${target.name}\`` : '') + (typeOnly ? ' 仅类型' : '')
  if (mine.length > 0) return { heading, code: mine.map(printDeclaration).join('\n') }
  const first = declarations[0]
  const from = first === undefined ? '?' : packageOf(root, first.getSourceFile().fileName)
  return { heading, code: `export { ${target.name} } from '${from}';` }
}

function sortDeclarations(nodes: readonly ts.Node[]): ts.Node[] {
  return [...nodes].sort(
    (a, b) =>
      compareCodePoints(a.getSourceFile().fileName, b.getSourceFile().fileName) ||
      a.getStart() - b.getStart(),
  )
}

/** 声明所在文件归哪个包：向上找最近的 `package.json` 的 `name`。 */
function packageOf(root: string, fileName: string): string {
  for (let directory = dirname(realpathSync(fileName)); ; directory = dirname(directory)) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && 'name' in parsed)
        if (typeof parsed.name === 'string') return parsed.name
    }
    if (dirname(directory) === directory || directory === root) return relative(root, fileName)
  }
}

const EXPORT_MODIFIERS = new Set([
  ts.SyntaxKind.ExportKeyword,
  ts.SyntaxKind.DefaultKeyword,
  ts.SyntaxKind.DeclareKeyword,
])

/** 打印一个声明：去注释与空白差异，去掉顶层的 export／default／declare，导出方式不进快照。 */
export function printDeclaration(node: ts.Node): string {
  const source = node.getSourceFile()
  if (ts.isVariableDeclaration(node)) {
    const list = node.parent
    const flags = ts.isVariableDeclarationList(list) ? list.flags & ts.NodeFlags.BlockScoped : 0
    const statement = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList([node], flags),
    )
    return printer.printNode(ts.EmitHint.Unspecified, statement, source)
  }
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
  if (ts.canHaveModifiers(node) && modifiers !== undefined) {
    // 声明文件里没有装饰器；getModifiers 只给关键字修饰符。
    const kept = modifiers.filter(modifier => !EXPORT_MODIFIERS.has(modifier.kind))
    const stripped = ts.factory.replaceModifiers(node, kept)
    return printer.printNode(ts.EmitHint.Unspecified, stripped, source)
  }
  return printer.printNode(ts.EmitHint.Unspecified, node, source)
}

/** 公开声明引用到、却没有从任何入口导出的本成员声明；它们的形状同样是公开面的一部分。 */
function internalItems(
  checker: ts.TypeChecker,
  exported: ReadonlySet<ts.Symbol>,
  own: (node: ts.Node) => boolean,
): Item[] {
  const found = new Map<ts.Symbol, ts.Node[]>()
  const queue: ts.Node[] = [...exported].flatMap(symbol =>
    (symbol.declarations ?? []).filter(node => own(node) && !insideAugmentation(node)),
  )
  const visit = (node: ts.Node): void => {
    const name = referencedName(node)
    if (name !== undefined) {
      const symbol = checker.getSymbolAtLocation(name)
      const target = symbol === undefined ? undefined : resolveAlias(checker, symbol)
      if (target !== undefined && !exported.has(target) && !found.has(target)) {
        const declarations = (target.declarations ?? []).filter(
          declaration =>
            own(declaration) &&
            !insideAugmentation(declaration) &&
            !ts.isTypeParameterDeclaration(declaration) &&
            !ts.isParameter(declaration),
        )
        if (declarations.length > 0) {
          found.set(target, sortDeclarations(declarations))
          queue.push(...declarations)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift())
    ts.forEachChild(next, visit)
  const items = [...found].map(([symbol, declarations]) => ({
    name: symbol.name,
    file: declarations[0]?.getSourceFile().fileName ?? '',
    code: declarations.map(printDeclaration).join('\n'),
  }))
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1)
  return items
    .map(item => ({
      heading:
        `\`${item.name}\`` +
        ((counts.get(item.name) ?? 0) > 1 ? ` · ${item.file.split(sep).slice(-1)[0] ?? ''}` : ''),
      code: item.code,
    }))
    .sort((a, b) => compareCodePoints(a.heading, b.heading) || compareCodePoints(a.code, b.code))
}

function referencedName(node: ts.Node): ts.Node | undefined {
  if (ts.isTypeReferenceNode(node)) return node.typeName
  if (ts.isExpressionWithTypeArguments(node)) return node.expression
  if (ts.isTypeQueryNode(node)) return node.exprName
  return undefined
}

/**
 * 本成员 dist 里的 `declare module '…'` 与 `declare global`，按扩充的目标分节。
 * 同一目标下同名的接口合并成一项，成员按出现的文件与位置排序；其他语句各成一项。
 * 相对目标改写成成员 dist 内的路径（`./facility.ts`），文件挪动不影响别的成员。
 */
function augmentations(
  program: ts.Program,
  root: string,
  member: ContractMember,
  own: (node: ts.Node) => boolean,
): [string, Item[]][] {
  const distRoot = join(root, member.path, 'dist')
  const byTarget = new Map<string, ts.Statement[]>()
  const files = program
    .getSourceFiles()
    .filter(own)
    .sort((a, b) => compareCodePoints(a.fileName, b.fileName))
  for (const file of files)
    for (const statement of file.statements) {
      if (!ts.isModuleDeclaration(statement) || !isAugmentationBlock(statement)) continue
      const target = augmentationTarget(statement, distRoot)
      const body =
        statement.body !== undefined && ts.isModuleBlock(statement.body)
          ? statement.body
          : undefined
      const list = byTarget.get(target) ?? []
      list.push(...(body?.statements ?? []))
      byTarget.set(target, list)
    }
  return [...byTarget]
    .sort(([a], [b]) => compareCodePoints(a, b))
    .map(([target, statements]) => [target, augmentationItems(statements)])
}

function augmentationTarget(statement: ts.ModuleDeclaration, distRoot: string): string {
  if (!ts.isStringLiteral(statement.name)) return 'global'
  const specifier = statement.name.text
  if (!specifier.startsWith('.')) return specifier
  const absolute = resolve(dirname(statement.getSourceFile().fileName), specifier)
  return './' + relative(distRoot, absolute).split(sep).join('/')
}

function augmentationItems(statements: readonly ts.Statement[]): Item[] {
  const interfaces = new Map<string, ts.InterfaceDeclaration[]>()
  const others: Item[] = []
  for (const statement of statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      const list = interfaces.get(statement.name.text) ?? []
      list.push(statement)
      interfaces.set(statement.name.text, list)
      continue
    }
    const name = declaredName(statement)
    others.push({ heading: `\`${name}\``, code: printDeclaration(statement) })
  }
  const merged = [...interfaces].map(([name, declarations]) => ({
    heading: `\`${name}\``,
    code: mergedInterface(name, declarations),
  }))
  return [...merged, ...others].sort(
    (a, b) => compareCodePoints(a.heading, b.heading) || compareCodePoints(a.code, b.code),
  )
}

function declaredName(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map(d => d.name.getText()).join(', ')
  const named: ts.Node & { readonly name?: ts.Node } = statement
  return named.name?.getText() ?? ts.SyntaxKind[statement.kind]
}

/** 多处扩充同一个接口：头取第一处，成员按出现顺序拼成一个接口，与 TypeScript 的合并结果一致。 */
function mergedInterface(name: string, declarations: readonly ts.InterfaceDeclaration[]): string {
  const first = declarations[0]
  const source = first?.getSourceFile()
  const print = (node: ts.Node, file: ts.SourceFile) =>
    printer.printNode(ts.EmitHint.Unspecified, node, file)
  const typeParameters =
    first?.typeParameters === undefined || source === undefined
      ? ''
      : `<${first.typeParameters.map(parameter => print(parameter, source)).join(', ')}>`
  const heritage = declarations.flatMap(declaration =>
    (declaration.heritageClauses ?? []).map(clause => print(clause, declaration.getSourceFile())),
  )
  const members = declarations.flatMap(declaration =>
    declaration.members.map(item =>
      print(item, declaration.getSourceFile())
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n'),
    ),
  )
  const head = `interface ${name}${typeParameters}${heritage.length > 0 ? ' ' + heritage.join(' ') : ''}`
  return members.length === 0 ? `${head} {\n}` : `${head} {\n${members.join('\n')}\n}`
}
