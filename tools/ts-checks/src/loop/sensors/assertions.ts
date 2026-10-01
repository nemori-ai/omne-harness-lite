// 没有断言的测试：在测试文件的语法树里找 `it(...)`、`test(...)` 及其 `.each(...)(...)`、`.concurrent`、
// `.only` 等形式的用例（`.todo`、`.skip` 不算），看回调体里有没有断言。
// 断言 = 一次调用的最左标识符匹配 assertionPattern 或 helperPattern；调用同一文件里声明的、
// 函数体内直接含这种调用的函数也算（只解一层）。只读语法，不解析类型，也不跨文件。
import ts from 'typescript'
import type { SourceFile } from '../../rule.ts'
import { syntaxOf, visitSyntax } from '../../syntax.ts'

export interface AssertionPatterns {
  readonly assertionPattern: RegExp
  readonly helperPattern: RegExp | undefined
}

export interface CaseWithoutAssertion {
  readonly path: string
  readonly line: number
  readonly name: string
}

const CASE_ROOTS = new Set(['it', 'test'])
const NOT_RUN = new Set(['todo', 'skip'])

/** 一次调用最左边的标识符：`expect(x).toBe(1)` → expect，`assert.equal()` → assert。 */
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

/** 调用的被调者链：根标识符与途经的属性名。`it.concurrent.each(t)` → it，[concurrent, each]。 */
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

/** 节点之内有没有一次调用满足 `matches`。 */
function containsCall(node: ts.Node, matches: (call: ts.CallExpression) => boolean): boolean {
  let found = false
  visitSyntax(node, child => {
    if (!found && ts.isCallExpression(child) && matches(child)) found = true
  })
  return found
}

/** 同一文件里有名字的函数：函数声明与赋给名字的箭头函数、函数表达式。 */
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

function caseName(argument: ts.Expression | undefined, syntax: ts.SourceFile): string {
  if (argument === undefined) return '(无名)'
  if (ts.isStringLiteralLike(argument)) return argument.text
  const text = argument.getText(syntax).replace(/\s+/gu, ' ')
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

/** 一个测试文件里没有断言的用例。 */
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

  const found: CaseWithoutAssertion[] = []
  visitSyntax(syntax, node => {
    if (!ts.isCallExpression(node)) return
    const chain = calleeChain(node.expression)
    if (chain === undefined || !CASE_ROOTS.has(chain.root)) return
    if (chain.names.some(name => NOT_RUN.has(name))) return
    const callback = [...node.arguments].reverse().find(isFunctionLike)
    // 没有回调（`it.each(table)` 那一层、待写的用例），或回调是传进来的引用：看不到函数体，不判。
    if (callback === undefined) return
    if (containsCall(callback.body, asserts)) return
    found.push({
      path: file.path,
      line: syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1,
      name: caseName(node.arguments[0], syntax),
    })
  })
  return found
}
