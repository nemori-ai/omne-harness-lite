import { createHash } from 'node:crypto'
import ts from '@typescript/typescript6'
import type { SourceFile } from '../core/rule.ts'
import { nodeName, syntaxOf } from '../core/syntax.ts'

export interface FunctionMetric {
  readonly name: string
  readonly line: number
  readonly endLine: number
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
