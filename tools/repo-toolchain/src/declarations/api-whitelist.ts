// 白名单门的正证据：两侧声明文件逐条顶层语句对齐，差异分两桶判断。
//   第一桶：全局作用域的差异。消费者的程序里全局作用域只有一份，模块作用域能靠改名隔开、全局作用域不能，
//     检查器证明不了「这处扩充没有影响已有导出」，所以任何一处差异整份 review、不跑检查器：
//     `declare global` 与对外部模块的 `declare module '…'` 块的增删改；脚本文件（没有导入导出的 `.d.ts`，
//     顶层声明都是全局的）的增删、语句变化、与模块之间的切换；三斜线指令的任何差异；
//     导入或 `export … from` 的模块边的增删（带绑定、仅类型、空导入、无绑定导入与 `import()` 类型都算），
//     它们决定入口可达的文件集合，集合变了，消费者程序里的全局声明就可能变；
//     `export as namespace` 声明 UMD 全局名，它的增删也在这里。
//   第二桶：模块作用域的白名单，只有两类。
//     (a) 新增顶层语句，引入旧侧不知道的名字：既不是本文件已有的声明（否则是合并：新增重载、第二个同名接口、
//         命名空间合并到类或函数上，都会改 `typeof` 与已有导出的形状），也不是任何入口已有的导出名
//         （`export *` 与改名导出展开后），也不能在该文件的作用域里解析到已有符号（经导入可见的名字、
//         lib 与外部包的全局名）。后两条命中时新声明遮住已有的名字，文件里已有引用的落点就变了。
//     (b) 模块作用域的接口或类型字面量里新增可选属性（属性写法，不是方法签名或索引签名）。
//         对本成员模块的 `declare module './x'` 块内的任何改动都不在这里：它合并进别的文件里的声明。
// 语法判断在这里；(a) 的作用域解析用旧侧程序（api-compare.ts 的 oldSideScope），判断不了时按白名单外处理。
// 检查器的可赋值证明另在 api-compare.ts。两步都成立才是 additive。
// 判断 (b) 的权威是文本：把新语句里判定为新增的可选属性去掉后，规范化文本必须与旧语句相同；
// 对齐只是提出哪些成员是新增的，任何没对上的差异都落到白名单外。
import ts from '@typescript/typescript6'
import type { NameResolution } from './api-compare.ts'
import type { DeclarationFile } from './api-format.ts'
import { referenceDirectives, sameText, statementId, statementKey } from './api-normalize.ts'

/** 一处差异：哪个文件里的哪条语句，是增、删还是改，以及命中的规则。 */
export interface StatementChange {
  readonly path: string
  /** 给人看的语句名，例如 `interface O`、`module 'x'`、`global`、`（脚本文件）`。 */
  readonly statement: string
  readonly change: 'added' | 'removed' | 'changed'
  readonly why: string
}

export interface WhitelistResult {
  /** 全局作用域的差异（第一桶）。非空时整份 review，不跑检查器。 */
  readonly global: readonly StatementChange[]
  /** 模块作用域里白名单外的改动（第二桶）。空表示每一处模块作用域差异都在白名单里。 */
  readonly outside: readonly StatementChange[]
  /** 按白名单 (b) 改了的语句（`statementId`），给覆盖判断用：到达这些语句的导出都算涉及。 */
  readonly changed: ReadonlySet<string>
}

/** 旧侧的名字：每个入口的导出名（展开后）到它所在的入口，以及该文件作用域里的解析。 */
export interface NameScope {
  readonly exported: ReadonlyMap<string, readonly string[]>
  readonly resolve: (path: string, name: string) => NameResolution
}

const SCRIPT = '脚本文件的顶层声明都是全局的'
const AUGMENTATION = '对全局或外部模块的扩充'
const UMD = '`export as namespace` 声明 UMD 全局名，属于全局作用域'
const EDGE = (change: 'added' | 'removed') =>
  `导入或导出的模块边${change === 'added' ? '新增' : '删除'}了，入口可达的文件集合随之变化`
const MERGE = '新增的声明与已有的同名声明合并（重载、接口、命名空间或类的合并）'
const OWN_CHANGED = '对本成员模块的扩充块内有改动，它合并进别的文件里的声明'

interface Group {
  readonly key: string
  readonly statements: readonly ts.Statement[]
  readonly source: ts.SourceFile
}

interface ParsedFile {
  readonly source: ts.SourceFile
  readonly groups: Map<string, Group>
  /** 没有导入导出的文件：顶层声明都在全局作用域。 */
  readonly script: boolean
  readonly directives: readonly string[]
  /** 导入或 `export … from` 的模块名，到第一条含它的顶层语句。 */
  readonly edges: Map<string, ts.Statement>
  /** 顶层声明的名字。 */
  readonly names: Set<string>
}

export function whitelistDifferences(
  before: readonly DeclarationFile[],
  after: readonly DeclarationFile[],
  scope: NameScope,
): WhitelistResult {
  const global: StatementChange[] = []
  const outside: StatementChange[] = []
  const changed = new Set<string>()
  const old = new Map(before.map(file => [file.path, parse(file)]))
  const next = new Map(after.map(file => [file.path, parse(file)]))
  for (const path of new Set([...old.keys(), ...next.keys()])) {
    const o = old.get(path)
    const n = next.get(path)
    global.push(...directiveChanges(path, o, n), ...edgeChanges(path, o, n))
    if (o?.script === true || n?.script === true) {
      global.push(...scriptChanges(path, o, n))
      continue
    }
    const a = o?.groups ?? new Map<string, Group>()
    const b = n?.groups ?? new Map<string, Group>()
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const og = a.get(key)
      const ng = b.get(key)
      if (og === undefined && ng !== undefined) {
        if (isForeignAugmentationGroup(ng))
          global.push(at(path, ng, 'added', `${AUGMENTATION}新增了`))
        else if (isUmdGroup(ng)) global.push(at(path, ng, 'added', UMD))
        else outside.push(...addedGroup(path, ng, o, scope))
      } else if (og !== undefined && ng === undefined) {
        if (isForeignAugmentationGroup(og))
          global.push(at(path, og, 'removed', `${AUGMENTATION}删除了`))
        else if (isUmdGroup(og)) global.push(at(path, og, 'removed', UMD))
        else if (og.statements.every(isEdgeStatement)) continue
        else if (isOwnAugmentationGroup(og))
          outside.push(at(path, og, 'removed', '删除了对本成员模块的扩充'))
        else if (!isRedundantModuleMarker(og, n?.source))
          outside.push(at(path, og, 'removed', '删除了语句'))
      } else if (og !== undefined && ng !== undefined) {
        const verdict = changedGroup(og, ng)
        if (verdict.kind === 'same') continue
        if (isForeignAugmentationGroup(ng))
          global.push(at(path, ng, 'changed', `${AUGMENTATION}变了`))
        else if (isOwnAugmentationGroup(og) || isOwnAugmentationGroup(ng))
          outside.push(at(path, ng, 'changed', OWN_CHANGED))
        else if (verdict.kind === 'outside') outside.push(at(path, ng, 'changed', verdict.why))
        else for (const statement of ng.statements) changed.add(statementId(path, statement))
      }
    }
  }
  return { global, outside, changed }
}

function at(
  path: string,
  group: Group,
  change: StatementChange['change'],
  why: string,
): StatementChange {
  return { path, statement: label(group), change, why }
}

function parse(file: DeclarationFile): ParsedFile {
  const source = ts.createSourceFile(file.path, file.code, ts.ScriptTarget.Latest, true)
  const groups = new Map<string, Group>()
  const names = new Set<string>()
  for (const statement of source.statements) {
    const key = statementKey(statement)
    const previous = groups.get(key)
    groups.set(key, { key, source, statements: [...(previous?.statements ?? []), statement] })
    for (const name of declaredNames(statement, source)) names.add(name)
  }
  return {
    source,
    groups,
    script: !ts.isExternalModule(source),
    directives: referenceDirectives(source),
    edges: edgesOf(source),
    names,
  }
}

/** 文件里每个模块名出现的第一条顶层语句：导入、`export … from`、`import x = require()` 与 `import()` 类型。 */
function edgesOf(source: ts.SourceFile): Map<string, ts.Statement> {
  const edges = new Map<string, ts.Statement>()
  for (const statement of source.statements) {
    const visit = (node: ts.Node): void => {
      const specifier = moduleSpecifierOf(node)
      if (specifier !== undefined && !edges.has(specifier)) edges.set(specifier, statement)
      ts.forEachChild(node, visit)
    }
    visit(statement)
  }
  return edges
}

function moduleSpecifierOf(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier
    return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const expression = node.moduleReference.expression
    return ts.isStringLiteral(expression) ? expression.text : undefined
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    const literal = node.argument.literal
    return ts.isStringLiteral(literal) ? literal.text : undefined
  }
  return undefined
}

/** 一条顶层语句声明的名字；扩充块、导入与导出语句没有。 */
function declaredNames(statement: ts.Statement, source: ts.SourceFile): string[] {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map(item => item.name.getText(source))
  if (ts.isImportEqualsDeclaration(statement)) return [statement.name.text]
  if (ts.isModuleDeclaration(statement))
    return ts.isIdentifier(statement.name) ? [statement.name.text] : []
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  )
    return [statement.name.text]
  if (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement))
    return statement.name === undefined ? [] : [statement.name.text]
  return []
}

/** 三斜线指令的任何变化。 */
function directiveChanges(
  path: string,
  o: ParsedFile | undefined,
  n: ParsedFile | undefined,
): StatementChange[] {
  const before = o?.directives ?? []
  const after = n?.directives ?? []
  if (before.join('\n') === after.join('\n')) return []
  return [
    {
      path,
      statement: after[0] ?? before[0] ?? '/// <reference />',
      change:
        after.length > before.length
          ? 'added'
          : before.length > after.length
            ? 'removed'
            : 'changed',
      why: '三斜线指令变了，消费者程序里的声明随之变化',
    },
  ]
}

/** 模块边的增删：一侧有、另一侧没有的模块名。 */
function edgeChanges(
  path: string,
  o: ParsedFile | undefined,
  n: ParsedFile | undefined,
): StatementChange[] {
  const before = o?.edges ?? new Map<string, ts.Statement>()
  const after = n?.edges ?? new Map<string, ts.Statement>()
  const edge = (statement: ts.Statement, change: 'added' | 'removed'): StatementChange => ({
    path,
    statement: labelOf(statement, statement.getSourceFile()),
    change,
    why: EDGE(change),
  })
  return [
    ...[...after].filter(([specifier]) => !before.has(specifier)).map(([, s]) => edge(s, 'added')),
    ...[...before]
      .filter(([specifier]) => !after.has(specifier))
      .map(([, s]) => edge(s, 'removed')),
  ]
}

/** 脚本文件的增删、语句变化，或文件在脚本与模块之间切换。 */
function scriptChanges(
  path: string,
  o: ParsedFile | undefined,
  n: ParsedFile | undefined,
): StatementChange[] {
  const file = '（脚本文件）'
  if (o === undefined)
    return [{ path, statement: file, change: 'added', why: `${SCRIPT}：文件新增了` }]
  if (n === undefined)
    return [{ path, statement: file, change: 'removed', why: `${SCRIPT}：文件删除了` }]
  if (o.script !== n.script)
    return [
      {
        path,
        statement: n.script ? '（文件成了脚本）' : '（文件成了模块）',
        change: 'changed',
        why: '文件在脚本与模块之间切换，顶层声明的作用域变了',
      },
    ]
  const keys = new Set([...o.groups.keys(), ...n.groups.keys()])
  for (const key of keys) {
    const og = o.groups.get(key)
    const ng = n.groups.get(key)
    if (og === undefined || ng === undefined || changedGroup(og, ng).kind !== 'same')
      return [{ path, statement: file, change: 'changed', why: `${SCRIPT}：语句变了` }]
  }
  return []
}

/** 删掉的只是空的 `export {}`，而新侧文件仍是模块（有别的导入或导出）：文件的含义没变。 */
function isRedundantModuleMarker(group: Group, newSource: ts.SourceFile | undefined): boolean {
  if (newSource === undefined || !ts.isExternalModule(newSource)) return false
  return group.statements.every(
    statement =>
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.length === 0,
  )
}

function label(group: Group): string {
  const statement = group.statements[0]
  return statement === undefined ? group.key : labelOf(statement, group.source)
}

function labelOf(statement: ts.Statement, source: ts.SourceFile): string {
  const named: ts.Node & { readonly name?: ts.Node } = statement
  const name = named.name === undefined ? '' : named.name.getText(source)
  if (ts.isModuleDeclaration(statement))
    return (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0
      ? 'global'
      : ts.isStringLiteral(statement.name)
        ? `module ${name}`
        : `namespace ${name}`
  if (ts.isInterfaceDeclaration(statement)) return `interface ${name}`
  if (ts.isTypeAliasDeclaration(statement)) return `type ${name}`
  if (ts.isClassDeclaration(statement)) return `class ${name}`
  if (ts.isFunctionDeclaration(statement)) return `function ${name}`
  if (ts.isEnumDeclaration(statement)) return `enum ${name}`
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations
      .map(item => `${declarationKeyword(statement.declarationList)} ${item.name.getText(source)}`)
      .join(', ')
  return statement.getText(source).replace(/\s+/gu, ' ').slice(0, 80)
}

function declarationKeyword(list: ts.VariableDeclarationList): string {
  if ((list.flags & ts.NodeFlags.Const) !== 0) return 'const'
  if ((list.flags & ts.NodeFlags.Let) !== 0) return 'let'
  return 'var'
}

/** `declare global` 或对别的模块的 `declare module '…'`：全局作用域。 */
function isForeignAugmentation(statement: ts.Statement): statement is ts.ModuleDeclaration {
  if (!ts.isModuleDeclaration(statement)) return false
  if ((statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true
  return ts.isStringLiteral(statement.name) && !statement.name.text.startsWith('.')
}

/** `declare module './x.ts'`：对本成员自己模块的扩充，模块作用域，合并进别的文件里的声明。 */
function isOwnAugmentation(statement: ts.Statement): boolean {
  return (
    ts.isModuleDeclaration(statement) &&
    ts.isStringLiteral(statement.name) &&
    statement.name.text.startsWith('.')
  )
}

const isForeignAugmentationGroup = (group: Group) => group.statements.every(isForeignAugmentation)
const isOwnAugmentationGroup = (group: Group) => group.statements.every(isOwnAugmentation)
/** `export as namespace X`：UMD 全局名。键含名字，所以改名是一删一增。 */
const isUmdGroup = (group: Group) => group.statements.every(ts.isNamespaceExportDeclaration)

/** 导入与 `export … from`：模块边，归第一桶判断。 */
function isEdgeStatement(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) return true
  if (ts.isExportDeclaration(statement)) return statement.moduleSpecifier !== undefined
  return (
    ts.isImportEqualsDeclaration(statement) &&
    ts.isExternalModuleReference(statement.moduleReference)
  )
}

/**
 * 模块作用域里新增的一组语句：边不在这里判断；对本成员模块的扩充合并进别的文件的声明；
 * 其余只许引入旧侧不知道的名字。
 */
function addedGroup(
  path: string,
  group: Group,
  old: ParsedFile | undefined,
  scope: NameScope,
): StatementChange[] {
  return group.statements.flatMap(statement => {
    if (isEdgeStatement(statement)) return []
    if (isOwnAugmentation(statement))
      return [at(path, group, 'added', '新增的对本成员模块的扩充与已有声明合并')]
    for (const name of declaredNames(statement, group.source)) {
      const why = takenName(path, name, old, scope)
      if (why !== undefined) return [at(path, group, 'added', why)]
    }
    return []
  })
}

/** 新增的名字在旧侧已经有主时，说明是谁：本文件的同名声明、入口的导出，或文件作用域里解析到的符号。 */
function takenName(
  path: string,
  name: string,
  old: ParsedFile | undefined,
  scope: NameScope,
): string | undefined {
  if (old?.names.has(name) === true) return MERGE
  const entries = scope.exported.get(name)
  if (entries !== undefined)
    return `新增的名字 \`${name}\` 与入口 ${entries.map(entry => `\`${entry}\``).join('、')} 已有的导出重名`
  const resolution = scope.resolve(path, name)
  switch (resolution.kind) {
    case 'free':
      return undefined
    case 'taken':
      return `新增的名字 \`${name}\` 在文件作用域里已经解析到已有符号（${resolution.where}）`
    case 'unknown':
      return `新增的名字 \`${name}\` 在旧侧判断不了是否重名：${resolution.why}`
    default: {
      const _exhaustive: never = resolution
      return _exhaustive
    }
  }
}

function isOptionalProperty(member: ts.Node): member is ts.PropertySignature {
  return ts.isPropertySignature(member) && member.questionToken !== undefined
}

type GroupVerdict =
  | { readonly kind: 'same' }
  | { readonly kind: 'optional-added' }
  | { readonly kind: 'outside'; readonly why: string }

/** 同键两组语句：文本相同、只新增了可选属性，或白名单外。 */
function changedGroup(o: Group, n: Group): GroupVerdict {
  if (o.statements.length !== n.statements.length)
    return { kind: 'outside', why: '同名语句的条数变了（重载或同名声明的增删）' }
  let same = true
  for (const [i, statement] of n.statements.entries()) {
    const previous = o.statements[i]
    if (previous === undefined) return { kind: 'outside', why: '同名语句的条数变了' }
    const oldText = sameText(previous, o.source)
    if (oldText === sameText(statement, n.source)) continue
    same = false
    if (!onlyOptionalPropertiesAdded(previous, statement, oldText, n.source))
      return { kind: 'outside', why: '改动不是新增可选属性' }
  }
  return { kind: same ? 'same' : 'optional-added' }
}

/** 新语句去掉提议的新增可选属性后，规范化文本必须与旧语句相同。空白差异不算（文本已经是打印器输出）。 */
function onlyOptionalPropertiesAdded(
  previous: ts.Statement,
  statement: ts.Statement,
  oldText: string,
  source: ts.SourceFile,
): boolean {
  const added = new Set<ts.Node>()
  if (!proposeAdded(previous, statement, added) || added.size === 0) return false
  const stripped = withoutMembers(statement, added)
  return collapse(sameText(stripped, source)) === collapse(oldText)
}

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim()

function children(node: ts.Node): ts.Node[] {
  const list: ts.Node[] = []
  ts.forEachChild(node, child => {
    list.push(child)
  })
  return list
}

/** 对齐旧新两个节点，把新侧多出来的可选属性收进 `added`；对不上的差异返回 false。 */
function proposeAdded(a: ts.Node, b: ts.Node, added: Set<ts.Node>): boolean {
  if (a.kind !== b.kind) return false
  if (ts.isInterfaceDeclaration(a) && ts.isInterfaceDeclaration(b)) {
    const rest = (node: ts.InterfaceDeclaration) => {
      const members = new Set<ts.Node>(node.members)
      return children(node).filter(child => !members.has(child))
    }
    return pairwise(rest(a), rest(b), added) && alignMembers(a.members, b.members, added)
  }
  if (ts.isTypeLiteralNode(a) && ts.isTypeLiteralNode(b))
    return alignMembers(a.members, b.members, added)
  const ca = children(a)
  const cb = children(b)
  if (ca.length === 0 && cb.length === 0) return a.getText() === b.getText()
  return pairwise(ca, cb, added)
}

function pairwise(a: readonly ts.Node[], b: readonly ts.Node[], added: Set<ts.Node>): boolean {
  return a.length === b.length && a.every((node, i) => proposeAdded(node, b[i] ?? node, added))
}

function alignMembers(
  old: readonly ts.TypeElement[],
  next: readonly ts.TypeElement[],
  added: Set<ts.Node>,
): boolean {
  let i = 0
  for (const member of next) {
    const previous = old[i]
    if (previous !== undefined && memberKey(previous) === memberKey(member)) {
      if (!proposeAdded(previous, member, added)) return false
      i += 1
    } else if (isOptionalProperty(member)) added.add(member)
    else return false
  }
  return i === old.length
}

function memberKey(member: ts.TypeElement): string {
  return `${member.kind}:${member.name === undefined ? '' : member.name.getText()}`
}

function withoutMembers(statement: ts.Statement, removed: ReadonlySet<ts.Node>): ts.Node {
  const strip: ts.TransformerFactory<ts.Node> = context => {
    const visit: ts.Visitor = node =>
      removed.has(node) ? undefined : ts.visitEachChild(node, visit, context)
    return node => ts.visitEachChild(node, visit, context)
  }
  const result = ts.transform<ts.Node>(statement, [strip])
  const transformed = result.transformed[0] ?? statement
  result.dispose()
  return transformed
}
