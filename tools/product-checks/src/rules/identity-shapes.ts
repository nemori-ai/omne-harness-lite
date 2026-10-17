import ts from '@typescript/typescript6'
import { IDENTITY_TYPE_NAMES } from '@omne-harness/legal-identity'
import {
  isTestPath,
  type Rule,
  type SourceFile,
  type Violation,
} from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { hasTag, nodeName, syntaxOf, visitSyntax } from '@omne-harness/repo-toolchain/core/syntax'

export interface IdentityDecisionTarget {
  readonly path: string
  readonly functionName: string
}

/** 注册的是可检查的表示；这不是凭名字推导业务资格的规则。 */
export interface IdentityCheckInputs {
  readonly identityTypeNames: readonly string[]
  readonly physicalTypeNames: readonly string[]
  readonly decisionTargets: readonly IdentityDecisionTarget[]
}

/** 身份类型名单只从 legal-identity 公开入口取得，不维护第二份领域名单。 */
export const IDENTITY_CHECK_INPUTS: IdentityCheckInputs = Object.freeze({
  identityTypeNames: IDENTITY_TYPE_NAMES,
  physicalTypeNames: Object.freeze([
    'Path',
    'FilePath',
    'Directory',
    'DirectoryPath',
    'OsUser',
    'OSUser',
    'HostName',
    'Hostname',
    'EnvironmentVariables',
    'RuntimeInstanceId',
  ]),
  // S-21 是范围化对象的准入；本阶段没有已点名的消费者准入函数。
  decisionTargets: Object.freeze([]),
})

type RecordDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration

function typeEnvironment(syntax: ts.SourceFile) {
  const aliases = new Map<string, ts.Node>()
  const imports = new Map<string, string>()
  visitSyntax(syntax, node => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node.type)
    if (ts.isInterfaceDeclaration(node)) aliases.set(node.name.text, node)
    if (ts.isImportSpecifier(node))
      imports.set(node.name.text, node.propertyName?.text ?? node.name.text)
  })
  return { aliases, imports }
}

/** 识别本文件类型别名、接口成员和具名 import 改名；不解析跨文件别名或泛型实例化。 */
function typeNames(node: ts.Node, syntax: ts.SourceFile): Set<string> {
  const { aliases, imports } = typeEnvironment(syntax)
  const names = new Set<string>()
  const seen = new Set<ts.Node>()
  const inspect = (current: ts.Node) => {
    if (seen.has(current)) return
    seen.add(current)
    if (ts.isTypeReferenceNode(current)) {
      const local = ts.isIdentifier(current.typeName)
        ? current.typeName.text
        : current.typeName.right.text
      names.add(imports.get(local) ?? local)
      const alias = aliases.get(local)
      if (alias !== undefined) inspect(alias)
      // Branded<string, 'FilePath'>／OpaqueIdentifier<'AccountId'>，也认具名构造器改名。
      if (['Branded', 'OpaqueIdentifier'].includes(imports.get(local) ?? local)) {
        for (const arg of current.typeArguments ?? []) {
          if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal))
            names.add(arg.literal.text)
        }
      }
    }
    ts.forEachChild(current, inspect)
  }
  inspect(node)
  return names
}

function violation(rule: string, file: SourceFile, node: ts.Node, message: string): Violation {
  return { rule, path: file.path, line: lineAt(file.text, node.getStart(syntaxOf(file))), message }
}

function functionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node))
    return nodeName(node.name)
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent)
  )
    return nodeName(node.parent.name)
  return undefined
}

function functionParameters(node: ts.Node): ts.NodeArray<ts.ParameterDeclaration> | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  )
    return node.parameters
  return undefined
}

/** SC-1：只有显式注册或 @identityDecision 标注的范围对象准入函数才受查。 */
export function createIdentityDecisionInputs(
  inputs: IdentityCheckInputs = IDENTITY_CHECK_INPUTS,
): Rule {
  const physical = new Set(inputs.physicalTypeNames)
  for (const name of inputs.identityTypeNames) {
    if (physical.has(name)) throw new Error(`身份与物理类型输入重叠：${name}`)
  }
  return {
    id: 'identity-decision-inputs',
    source: 'data.identity-values v1 S-21/S-22 · identity-values 节点 SC-1',
    description: '显式注册或 @identityDecision 准入函数的参数类型不含登记的物理地址/运行实例品牌',
    check(files) {
      const out: Violation[] = []
      for (const file of files) {
        if (isTestPath(file.path) || !file.path.includes('/src/')) continue
        const syntax = syntaxOf(file)
        const registered = inputs.decisionTargets.filter(t => t.path === file.path)
        const found = new Set<string>()
        visitSyntax(syntax, node => {
          const name = functionName(node)
          const params = functionParameters(node)
          if (name === undefined || params === undefined) return
          if (
            !registered.some(t => t.functionName === name) &&
            !hasTag(node, 'identityDecision') &&
            !(ts.isArrowFunction(node) || ts.isFunctionExpression(node)
              ? hasTag(node.parent.parent, 'identityDecision')
              : false)
          )
            return
          found.add(name)
          for (const param of params) {
            if (param.type === undefined) {
              out.push(
                violation(
                  this.id,
                  file,
                  param,
                  `准入 ${name} 的参数缺少类型标注，SC-1 无法检查其依据`,
                ),
              )
              continue
            }
            const bad = [...typeNames(param.type, syntax)].filter(t => physical.has(t))
            if (bad.length > 0)
              out.push(
                violation(
                  this.id,
                  file,
                  param,
                  `准入 ${name} 输入包含物理类型/品牌 ${bad.join('、')}；物理地址不构成资格`,
                ),
              )
          }
        })
        for (const target of registered) {
          if (!found.has(target.functionName))
            out.push({
              rule: this.id,
              path: file.path,
              line: 0,
              message: `登记的准入函数 ${target.functionName} 缺席，SC-1 注册失效`,
            })
        }
      }
      // 目标消失时也报出，不把旧注册默认为“无事可查”。
      for (const target of inputs.decisionTargets) {
        if (!files.some(f => f.path === target.path))
          out.push({
            rule: this.id,
            path: target.path,
            line: 0,
            message: `登记的准入模块缺席（${target.functionName}），SC-1 注册失效`,
          })
      }
      return out
    },
  }
}

function recordMembers(node: RecordDeclaration): readonly ts.TypeElement[] {
  if (ts.isInterfaceDeclaration(node)) return node.members
  return ts.isTypeLiteralNode(node.type) ? node.type.members : []
}

/** SC-2 的 typed 面：仅账号包的 AccountRecord/AccountRow 或 @accountRecord 声明。 */
export const identityAccountReferences: Rule = {
  id: 'identity-account-references',
  source: 'data.identity-values v1 S-24 · identity-values 节点 SC-2',
  description: '点名的账号记录不含第二个 AccountId 字段（不推断普通 string 列的业务含义）',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path) || !file.path.startsWith('tenancy/account-identity-sql/src/'))
        continue
      const syntax = syntaxOf(file)
      visitSyntax(syntax, node => {
        if (
          !(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) ||
          (!['AccountRow', 'AccountRecord'].includes(node.name.text) &&
            !hasTag(node, 'accountRecord'))
        )
          return
        const references = recordMembers(node).filter(
          member =>
            ts.isPropertySignature(member) &&
            member.type !== undefined &&
            typeNames(member.type, syntax).has('AccountId'),
        )
        // 当前 AccountRow 的自身份 account_id 是 string；typed 新字段仍不得成为第二条账号引用。
        const ownStringId = recordMembers(node).some(
          member =>
            ts.isPropertySignature(member) &&
            nodeName(member.name) === 'account_id' &&
            member.type?.kind === ts.SyntaxKind.StringKeyword,
        )
        const allowed = ownStringId ? 0 : 1
        for (const member of references.slice(allowed))
          out.push(
            violation(
              this.id,
              file,
              member,
              `账号记录 ${node.name.text} 出现额外 AccountId 引用；账号记录不能关联另一个账号`,
            ),
          )
      })
    }
    return out
  },
}

function nullable(member: ts.PropertySignature, syntax: ts.SourceFile): boolean {
  if (member.questionToken !== undefined) return true
  if (member.type === undefined) return false
  const { aliases } = typeEnvironment(syntax)
  const seen = new Set<ts.Node>()
  const inspect = (node: ts.Node): boolean => {
    if (seen.has(node)) return false
    seen.add(node)
    if (
      node.kind === ts.SyntaxKind.UndefinedKeyword ||
      (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
    )
      return true
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const alias = aliases.get(node.typeName.text)
      if (alias !== undefined && inspect(alias)) return true
    }
    return ts.isUnionTypeNode(node) && node.types.some(inspect)
  }
  return inspect(member.type)
}

/** SC-9 的结构反例：持久记录中成对出现可空 organization 与 tenant。 */
export const identityScopeColumns: Rule = {
  id: 'identity-scope-columns',
  source: 'data.identity-values v1 S-11/S-16 · identity-values 节点 SC-9',
  description:
    '持久 *Record/*Row/*Table 或 @scopedRecord 不以成对可空 organization/tenant 表示归属',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path) || !file.path.includes('/src/')) continue
      const syntax = syntaxOf(file)
      visitSyntax(syntax, node => {
        if (
          !(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) ||
          (!/(?:Record|Row|Table)$/.test(node.name.text) && !hasTag(node, 'scopedRecord'))
        )
          return
        const members = recordMembers(node)
        const organization = members.find(
          m => ts.isPropertySignature(m) && nodeName(m.name) === 'organization',
        )
        const tenant = members.find(m => ts.isPropertySignature(m) && nodeName(m.name) === 'tenant')
        if (
          organization === undefined ||
          tenant === undefined ||
          !ts.isPropertySignature(organization) ||
          !ts.isPropertySignature(tenant)
        )
          return
        if (nullable(organization, syntax) && nullable(tenant, syntax))
          out.push(
            violation(
              this.id,
              file,
              node,
              `持久记录 ${node.name.text} 同时有可空 organization/tenant 列；归属应携带一个判别式 ScopeLayerIdentity`,
            ),
          )
      })
    }
    return out
  },
}

export const identityDecisionInputs = createIdentityDecisionInputs()
