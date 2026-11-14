import ts from '@typescript/typescript6'
import type { NameResolution } from './api-compare.ts'
import type { DeclarationFile } from './api-format.ts'
import { referenceDirectives, sameText, statementId, statementKey } from './api-normalize.ts'

export interface StatementChange {
  readonly path: string
  readonly statement: string
  readonly change: 'added' | 'removed' | 'changed'
  readonly why: string
}

export interface WhitelistResult {
  readonly global: readonly StatementChange[]
  readonly outside: readonly StatementChange[]
  readonly changed: ReadonlySet<string>
}

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
  readonly script: boolean
  readonly directives: readonly string[]
  readonly edges: Map<string, ts.Statement>
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

function isForeignAugmentation(statement: ts.Statement): statement is ts.ModuleDeclaration {
  if (!ts.isModuleDeclaration(statement)) return false
  if ((statement.flags & ts.NodeFlags.GlobalAugmentation) !== 0) return true
  return ts.isStringLiteral(statement.name) && !statement.name.text.startsWith('.')
}

function isOwnAugmentation(statement: ts.Statement): boolean {
  return (
    ts.isModuleDeclaration(statement) &&
    ts.isStringLiteral(statement.name) &&
    statement.name.text.startsWith('.')
  )
}

const isForeignAugmentationGroup = (group: Group) => group.statements.every(isForeignAugmentation)
const isOwnAugmentationGroup = (group: Group) => group.statements.every(isOwnAugmentation)
const isUmdGroup = (group: Group) => group.statements.every(ts.isNamespaceExportDeclaration)

function isEdgeStatement(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) return true
  if (ts.isExportDeclaration(statement)) return statement.moduleSpecifier !== undefined
  return (
    ts.isImportEqualsDeclaration(statement) &&
    ts.isExternalModuleReference(statement.moduleReference)
  )
}

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
