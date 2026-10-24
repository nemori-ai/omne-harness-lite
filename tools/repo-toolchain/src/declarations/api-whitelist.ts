// 白名单门的正证据：两侧声明文件逐条顶层语句对齐，判断每一处差异是不是「可加改动」表允许的两类改动。
//   (a) 新增顶层语句（新导出、新内部声明、新导入或导出语句），已有语句的文本不变；
//   (b) 在接口、类型字面量或扩充接口里新增可选属性（属性写法，不是方法签名或索引签名）。
// 模块扩充块（`declare module '…'`、`declare global`）新增时只有「全是可选属性的接口」算 (b)。
// 这里只看语法，不跑检查器；检查器的证明另在 api-compare.ts。两步都成立才是 additive。
// 判断的权威是文本：把新语句里判定为新增的可选属性去掉后，规范化文本必须与旧语句相同；
// 对齐只是提出哪些成员是新增的，任何没对上的差异都落到白名单外。
import ts from '@typescript/typescript6'
import type { DeclarationFile } from './api-format.ts'
import { sameText, statementId, statementKey } from './api-normalize.ts'

/** 一处白名单外的改动：哪个文件里的哪条语句，是删了、改了还是新增了不许新增的东西。 */
export interface OutsideChange {
  readonly path: string
  /** 给人看的语句名，例如 `interface O`、`module 'x'`。 */
  readonly statement: string
  readonly change: 'added' | 'removed' | 'changed'
  readonly why: string
}

export interface WhitelistResult {
  /** 空表示每一处差异都在白名单里。 */
  readonly outside: readonly OutsideChange[]
  /** 按白名单改了的语句（`statementId`），给覆盖判断用：到达这些语句的导出都算涉及。 */
  readonly changed: ReadonlySet<string>
}

interface Group {
  readonly key: string
  readonly statements: readonly ts.Statement[]
  readonly source: ts.SourceFile
}

export function whitelistDifferences(
  before: readonly DeclarationFile[],
  after: readonly DeclarationFile[],
): WhitelistResult {
  const outside: OutsideChange[] = []
  const changed = new Set<string>()
  const old = new Map(before.map(file => [file.path, parse(file)]))
  const next = new Map(after.map(file => [file.path, parse(file)]))
  for (const path of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(path)?.groups ?? new Map<string, Group>()
    const b = next.get(path)?.groups ?? new Map<string, Group>()
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const o = a.get(key)
      const n = b.get(key)
      if (o === undefined && n !== undefined) outside.push(...addedGroup(path, n))
      else if (o !== undefined && n === undefined) {
        if (isRedundantModuleMarker(o, next.get(path)?.source)) continue
        outside.push({ path, statement: label(o), change: 'removed', why: '删除了语句' })
      } else if (o !== undefined && n !== undefined) {
        const verdict = changedGroup(o, n)
        if (verdict.kind === 'same') continue
        if (verdict.kind === 'outside')
          outside.push({ path, statement: label(n), change: 'changed', why: verdict.why })
        else for (const statement of n.statements) changed.add(statementId(path, statement))
      }
    }
  }
  return { outside, changed }
}

function parse(file: DeclarationFile): { source: ts.SourceFile; groups: Map<string, Group> } {
  const source = ts.createSourceFile(file.path, file.code, ts.ScriptTarget.Latest, true)
  const groups = new Map<string, Group>()
  for (const statement of source.statements) {
    const key = statementKey(statement)
    const previous = groups.get(key)
    groups.set(key, {
      key,
      source,
      statements: [...(previous?.statements ?? []), statement],
    })
  }
  return { source, groups }
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
  if (statement === undefined) return group.key
  const named: ts.Node & { readonly name?: ts.Node } = statement
  const name = named.name === undefined ? '' : named.name.getText(group.source)
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
      .map(
        item =>
          `${declarationKeyword(statement.declarationList)} ${item.name.getText(group.source)}`,
      )
      .join(', ')
  return statement.getText(group.source).replace(/\s+/gu, ' ').slice(0, 80)
}

function declarationKeyword(list: ts.VariableDeclarationList): string {
  if ((list.flags & ts.NodeFlags.Const) !== 0) return 'const'
  if ((list.flags & ts.NodeFlags.Let) !== 0) return 'let'
  return 'var'
}

/** 模块扩充块：`declare module '…'` 与 `declare global`。本成员自己模块的扩充也算，它同样改已有接口。 */
function isAugmentationBlock(statement: ts.Statement): statement is ts.ModuleDeclaration {
  if (!ts.isModuleDeclaration(statement)) return false
  return (
    (statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0 || ts.isStringLiteral(statement.name)
  )
}

/** 新增的一组语句：扩充块只许「全是可选属性的接口」，其余顶层语句都是新增声明或导出。 */
function addedGroup(path: string, group: Group): OutsideChange[] {
  return group.statements.flatMap(statement => {
    if (!isAugmentationBlock(statement) || optionalOnlyAugmentation(statement)) return []
    return [
      {
        path,
        statement: label(group),
        change: 'added' as const,
        why: '新增的扩充不只是接口的可选属性',
      },
    ]
  })
}

function optionalOnlyAugmentation(statement: ts.ModuleDeclaration): boolean {
  const body = statement.body
  if (body === undefined || !ts.isModuleBlock(body)) return false
  return body.statements.every(
    item =>
      ts.isInterfaceDeclaration(item) &&
      item.heritageClauses === undefined &&
      item.members.every(isOptionalProperty),
  )
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
    return { kind: 'outside', why: '同名语句的条数变了（重载或扩充块的增删）' }
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
