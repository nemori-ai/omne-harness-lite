import ts from '@typescript/typescript6'
import type { SourceFile } from '../../core/rule.ts'
import { syntaxOf, visitSyntax } from '../../core/syntax.ts'

export interface AssertionPatterns {
  readonly assertionPattern: RegExp
  readonly helperPattern: RegExp | undefined
  readonly typeTestPattern: RegExp | undefined
}

export interface CaseWithoutAssertion {
  readonly path: string
  readonly line: number
  readonly name: string
}

const CASE_ROOTS = new Set(['it', 'test'])
const SUITE_ROOTS = new Set(['describe', 'suite'])
const NOT_RUN = new Set(['todo', 'skip'])

export function leftmost(node: ts.Expression): string | undefined {
  let current: ts.Node = node
  for (;;) {
    if (ts.isIdentifier(current)) return current.text
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isCallExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isExpressionWithTypeArguments(current)
    )
      current = current.expression
    else if (ts.isTaggedTemplateExpression(current)) current = current.tag
    else return undefined
  }
}

function calleeChain(callee: ts.Expression): { root: string; names: string[] } | undefined {
  const names: string[] = []
  let current: ts.Node = callee
  for (;;) {
    if (ts.isIdentifier(current)) return { root: current.text, names }
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text)
      current = current.expression
    } else if (ts.isCallExpression(current)) current = current.expression
    else if (ts.isTaggedTemplateExpression(current)) current = current.tag
    else return undefined
  }
}

type FunctionLike = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

const isFunctionLike = (node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node)

function containsCall(node: ts.Node, matches: (call: ts.CallExpression) => boolean): boolean {
  let found = false
  visitSyntax(node, child => {
    if (!found && ts.isCallExpression(child) && matches(child)) found = true
  })
  return found
}

function namedFunctions(syntax: ts.SourceFile): Map<string, FunctionLike> {
  const named = new Map<string, FunctionLike>()
  visitSyntax(syntax, node => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined)
      named.set(node.name.text, node)
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isFunctionLike(node.initializer)
    )
      named.set(node.name.text, node.initializer)
  })
  return named
}

function insideSkippedSuite(node: ts.Node): boolean {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (!isFunctionLike(current) || !ts.isCallExpression(current.parent)) continue
    const chain = calleeChain(current.parent.expression)
    if (
      chain !== undefined &&
      SUITE_ROOTS.has(chain.root) &&
      chain.names.some(name => NOT_RUN.has(name))
    )
      return true
  }
  return false
}

const EXPECT_ERROR = /^(?:\/\/+|\/\*+)[\s*]*@ts-expect-error/u

function containsExpectError(node: ts.Node, syntax: ts.SourceFile): boolean {
  const text = syntax.getFullText()
  const directive = (ranges: readonly ts.CommentRange[] | undefined) =>
    ranges?.some(range => EXPECT_ERROR.test(text.slice(range.pos, range.end))) === true
  const visit = (current: ts.Node): boolean =>
    directive(ts.getLeadingCommentRanges(text, current.getFullStart())) ||
    directive(ts.getTrailingCommentRanges(text, current.getEnd())) ||
    current.getChildren(syntax).some(visit)
  return visit(node)
}

function containsCompileCheck(node: ts.Node): boolean {
  let found = false
  visitSyntax(node, child => {
    if (
      !found &&
      (ts.isCallExpression(child) ||
        ts.isSatisfiesExpression(child) ||
        (ts.isVariableDeclaration(child) && child.type !== undefined))
    )
      found = true
  })
  return found
}

function caseName(argument: ts.Expression | undefined, syntax: ts.SourceFile): string {
  if (argument === undefined) return '(无名)'
  if (ts.isStringLiteralLike(argument)) return argument.text
  const text = argument.getText(syntax).replace(/\s+/gu, ' ')
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

export function casesWithoutAssertions(
  file: SourceFile,
  patterns: AssertionPatterns,
): CaseWithoutAssertion[] {
  const syntax = syntaxOf(file)
  const direct = (call: ts.CallExpression) => {
    const name = leftmost(call.expression)
    return (
      name !== undefined &&
      (patterns.assertionPattern.test(name) || patterns.helperPattern?.test(name) === true)
    )
  }
  const helpers = new Set<string>()
  for (const [name, fn] of namedFunctions(syntax))
    if (fn.body !== undefined && containsCall(fn.body, direct)) helpers.add(name)
  const asserts = (call: ts.CallExpression) =>
    direct(call) || (ts.isIdentifier(call.expression) && helpers.has(call.expression.text))
  const typeTest = patterns.typeTestPattern?.test(file.path) === true

  const found: CaseWithoutAssertion[] = []
  visitSyntax(syntax, node => {
    if (!ts.isCallExpression(node)) return
    const chain = calleeChain(node.expression)
    if (chain === undefined || !CASE_ROOTS.has(chain.root)) return
    if (chain.names.some(name => NOT_RUN.has(name)) || insideSkippedSuite(node)) return
    const callback = [...node.arguments].reverse().find(isFunctionLike)
    if (callback === undefined) return
    if (containsCall(callback.body, asserts)) return
    if (
      typeTest &&
      (containsExpectError(callback.body, syntax) || containsCompileCheck(callback.body))
    )
      return
    found.push({
      path: file.path,
      line: syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1,
      name: caseName(node.arguments[0], syntax),
    })
  })
  return found
}
