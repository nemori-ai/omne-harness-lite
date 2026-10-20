import ts from '@typescript/typescript6'
import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { syntaxOf, visitSyntax } from '@omne-harness/repo-toolchain/core/syntax'
import { callName, localValue } from './local-binding.ts'

const SCANNED_ROOTS = /^(?:packages|apps|tools)\//u
// 测试也有 JS 写的（如 tools/model-probe/tests 的 .mjs）；syntaxOf 按扩展名用 JS 语法解析这些文件。
const SCRIPT = /\.[cm]?[jt]s$/u
const TEST_NAME = /\.(?:spec|test)\.[cm]?[jt]s$/u
const CREATE = new Set(['mkdtempSync', 'mkdtemp'])
// `realpathSync.native` 的被调用者名字是 `native`。
const PHYSICAL = new Set(['realpathSync', 'realpath', 'native'])

function scanned(path: string): boolean {
  return SCANNED_ROOTS.test(path) && SCRIPT.test(path) && (isTestPath(path) || TEST_NAME.test(path))
}

function isTmpdirEnvironment(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression))
    return false
  const key = ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : ts.isStringLiteralLike(expression.argumentExpression)
      ? expression.argumentExpression.text
      : undefined
  const owner = expression.expression
  return (
    key === 'TMPDIR' &&
    ts.isPropertyAccessExpression(owner) &&
    owner.name.text === 'env' &&
    ts.isIdentifier(owner.expression) &&
    owner.expression.text === 'process'
  )
}

/** 实参取自系统临时目录且途中没有取物理路径时为真。 */
function rawTemporaryBase(
  expression: ts.Expression,
  names: ReadonlyMap<string, string>,
  seen = new Set<ts.Node>(),
): boolean {
  if (seen.has(expression)) return false
  seen.add(expression)
  const value = localValue(expression)
  if (value === undefined) return false
  const inner = (item: ts.Expression) => rawTemporaryBase(item, names, seen)
  if (isTmpdirEnvironment(value)) return true
  if (ts.isAwaitExpression(value)) return inner(value.expression)
  if (ts.isNonNullExpression(value)) return inner(value.expression)
  if (ts.isTemplateExpression(value))
    return value.templateSpans.some(span => inner(span.expression))
  if (ts.isBinaryExpression(value))
    return (
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
      ].includes(value.operatorToken.kind) &&
      (inner(value.left) || inner(value.right))
    )
  if (ts.isConditionalExpression(value)) return inner(value.whenTrue) || inner(value.whenFalse)
  if (!ts.isCallExpression(value)) return false
  const name = calleeName(value.expression, names)
  if (name === undefined || PHYSICAL.has(name)) return false
  if (name === 'tmpdir') return true
  return value.arguments.some(inner)
}

function calleeName(
  expression: ts.Expression,
  names: ReadonlyMap<string, string>,
): string | undefined {
  const name = callName(expression)
  return name !== undefined && ts.isIdentifier(expression) ? (names.get(name) ?? name) : name
}

/** 建目录的调用（可隔着括号、await、非空断言、as、satisfies）是否正好是 realpath 的第一个实参。 */
function wrappedInPhysicalPath(
  call: ts.CallExpression,
  names: ReadonlyMap<string, string>,
): boolean {
  let node: ts.Node = call
  while (
    ts.isParenthesizedExpression(node.parent) ||
    ts.isAwaitExpression(node.parent) ||
    ts.isNonNullExpression(node.parent) ||
    ts.isAsExpression(node.parent) ||
    ts.isSatisfiesExpression(node.parent)
  )
    node = node.parent
  const parent = node.parent
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node) return false
  const name = calleeName(parent.expression, names)
  return name !== undefined && PHYSICAL.has(name)
}

/**
 * Issue #560：测试在系统临时目录下建的目录要一开始就是物理路径。macOS 的 `tmpdir()` 在符号链接 `/var` 下，
 * git、vitest 与 pytest 报告解析后的 `/private/var`，两者直接比较会失败；Linux CI 发现不了。
 */
export const testTempPhysicalPath: Rule = {
  id: 'test-temp-physical-path',
  source: 'Issue #560 C5；docs/verification.md「包级测试责任与边界」',
  description:
    'packages/、apps/、tools/ 下的测试与夹具在系统临时目录下用 mkdtempSync／mkdtemp 建目录时，必须取物理路径',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      if (!scanned(file.path)) continue
      if (!file.text.includes('mkdtemp')) continue
      const syntax = syntaxOf(file)
      const names = new Map<string, string>()
      visitSyntax(syntax, node => {
        if (ts.isImportSpecifier(node))
          names.set(node.name.text, node.propertyName?.text ?? node.name.text)
      })
      visitSyntax(syntax, node => {
        if (!ts.isCallExpression(node)) return
        const name = calleeName(node.expression, names)
        if (name === undefined || !CREATE.has(name)) return
        const base = node.arguments[0]
        if (base === undefined || !rawTemporaryBase(base, names)) return
        if (wrappedInPhysicalPath(node, names)) return
        violations.push({
          rule: this.id,
          path: file.path,
          line: lineAt(file.text, node.getStart(syntax)),
          message:
            `在系统临时目录下用 ${name} 建目录没有取物理路径；macOS 的 tmpdir() 在符号链接 /var 下。` +
            '写成 realpathSync(mkdtempSync(join(tmpdir(), …)))，或 await realpath(await mkdtemp(…))',
        })
      })
    }
    return violations
  },
}
