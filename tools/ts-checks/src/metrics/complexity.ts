// 圈复杂度与函数文本摘要。算法照 Robert C. Martin 的工具按其逻辑用 TypeScript 重写（原仓库无许可证，
// 不搬原文）：
// - 判定点集合：unclebob/crapper@4909ad2 src/crapper/languages/typescript.py `_DECISIONS` 与
//   languages/treesitter.py `binary_logic`。阈值是按这套计数校出来的，所以集合逐项对齐：
//   `default` 计入，`??`、`?.` 与逻辑赋值不计。
// - 函数文本摘要：unclebob/mutator@21d6d6f functions.py 的「各行去尾部空白后拼接再取 sha256」。
// 有意的差异在计分单元：crapper 只认顶层函数、类方法与顶层箭头常量，嵌套函数并入外层；本仓库大量
// 使用「工厂函数返回一组方法」的写法，照那样算一个工厂就是一个单元。这里让有名字的内层函数、对象
// 字面量方法与类字段箭头函数各自成单元，只有匿名回调并入外层。
import { createHash } from 'node:crypto'
import ts from 'typescript'
import type { SourceFile } from '../rule.ts'
import { nodeName, syntaxOf } from '../syntax.ts'

/** 一个计分单元：有名字的函数。匿名回调并入它所在的单元。 */
export interface FunctionMetric {
  /** 限定名：类、外层函数与本函数名以 `.` 相连；顶层判定归 `<module>`。 */
  readonly name: string
  readonly line: number
  readonly endLine: number
  /** 圈复杂度：1 + 判定点数，不含嵌套的有名函数。 */
  readonly complexity: number
}

export const MODULE_UNIT = '<module>'

function isDecision(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.ConditionalExpression:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.CatchClause:
    case ts.SyntaxKind.CaseClause:
    case ts.SyntaxKind.DefaultClause:
      return true
    default:
      return (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      )
  }
}

function memberName(name: ts.PropertyName | undefined, syntax: ts.SourceFile): string | undefined {
  if (name === undefined) return undefined
  return nodeName(name) ?? name.getText(syntax)
}

/** 有函数体且能取到名字的函数才是计分单元；重载签名与匿名回调返回 undefined。 */
function unitName(node: ts.Node, syntax: ts.SourceFile): string | undefined {
  if (ts.isFunctionDeclaration(node))
    return node.body === undefined ? undefined : (node.name?.text ?? 'default')
  if (ts.isConstructorDeclaration(node)) return node.body === undefined ? undefined : 'constructor'
  if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))
    return node.body === undefined ? undefined : memberName(node.name, syntax)
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent
    if (ts.isVariableDeclaration(parent) && parent.initializer === node)
      return nodeName(parent.name)
    if (ts.isPropertyAssignment(parent) && parent.initializer === node)
      return memberName(parent.name, syntax)
    if (ts.isPropertyDeclaration(parent) && parent.initializer === node)
      return memberName(parent.name, syntax)
  }
  return undefined
}

/** 类与赋了名字的对象字面量不是计分单元，只给其中的函数提供限定名。 */
function containerName(node: ts.Node, syntax: ts.SourceFile): string | undefined {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return node.name?.text
  if (!ts.isObjectLiteralExpression(node)) return undefined
  const parent = node.parent
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) return nodeName(parent.name)
  if (
    (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.initializer === node
  )
    return memberName(parent.name, syntax)
  return undefined
}

interface Unit {
  readonly name: string
  readonly line: number
  readonly endLine: number
  complexity: number
}

/** 只读语法树；不解析类型，也不跨文件。 */
export function functionMetrics(file: SourceFile): FunctionMetric[] {
  const syntax = syntaxOf(file)
  const lineOf = (position: number) => syntax.getLineAndCharacterOfPosition(position).line + 1
  const units: Unit[] = []
  const moduleUnit: Unit = {
    name: MODULE_UNIT,
    line: 1,
    endLine: lineOf(syntax.getEnd()),
    complexity: 1,
  }

  const walk = (node: ts.Node, qualifiers: readonly string[], current: Unit): void => {
    let nextQualifiers = qualifiers
    let nextUnit = current
    const name = unitName(node, syntax)
    if (name !== undefined) {
      nextQualifiers = [...qualifiers, name]
      nextUnit = {
        name: nextQualifiers.join('.'),
        line: lineOf(node.getStart(syntax)),
        endLine: lineOf(node.getEnd()),
        complexity: 1,
      }
      units.push(nextUnit)
    } else {
      const container = containerName(node, syntax)
      if (container !== undefined) nextQualifiers = [...qualifiers, container]
      else if (isDecision(node)) current.complexity += 1
    }
    ts.forEachChild(node, child => walk(child, nextQualifiers, nextUnit))
  }
  walk(syntax, [], moduleUnit)

  if (moduleUnit.complexity > 1) units.unshift(moduleUnit)
  return units.map(unit => ({ ...unit }))
}

/** 严格落在 `outer` 行范围之内的其他单元。 */
export function nestedUnits(
  outer: FunctionMetric,
  units: readonly FunctionMetric[],
): FunctionMetric[] {
  return units.filter(
    other =>
      other !== outer &&
      other.line >= outer.line &&
      other.endLine <= outer.endLine &&
      (other.line > outer.line || other.endLine < outer.endLine),
  )
}

/**
 * 限定名 → 函数自身文本的摘要，用来判断「这个函数的文本变没变」而不是「diff 碰没碰到它的行」：
 * 挪了位置、上方加了代码都不算变。只取函数自己的行，更内层有名函数的行不算在外层头上；
 * 同名的多个单元按行号顺序把各自摘要拼起来再取一次。
 */
export function unitDigests(file: SourceFile): Map<string, string> {
  const lines = file.text.split('\n')
  const units = functionMetrics(file)
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')
  const parts = new Map<string, string[]>()
  for (const unit of [...units].sort((a, b) => a.line - b.line)) {
    const inner = nestedUnits(unit, units)
    const own: string[] = []
    for (let line = unit.line; line <= Math.min(unit.endLine, lines.length); line += 1) {
      if (inner.some(other => line >= other.line && line <= other.endLine)) continue
      own.push((lines[line - 1] ?? '').trimEnd())
    }
    const list = parts.get(unit.name) ?? []
    list.push(sha(own.join('\n')))
    parts.set(unit.name, list)
  }
  const digests = new Map<string, string>()
  for (const [name, list] of parts)
    digests.set(name, list.length === 1 ? (list[0] ?? '') : sha(list.join('')))
  return digests
}
