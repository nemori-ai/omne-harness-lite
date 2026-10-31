import ts from '@typescript/typescript6'
import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { nodeName, syntaxOf, visitSyntax } from '@omne-harness/repo-toolchain/core/syntax'

/**
 * 领域时间只从 clock 服务取。非领域取时必须逐个调用标注用途与理由。
 * `new Date(x)` 是转换不是取时，只禁无参的 `new Date()`。
 */
export const noWallClock: Rule = {
  id: 'no-wall-clock',
  source: 'docs/architecture/cross-cutting-concepts.md#时间顺序与版本 · SC-OE-3',
  description:
    '生产源码的 Date.now()、new Date()、performance.now() 必须来自 Clock 实现或具名非领域用途',
  check(files) {
    const out: Violation[] = []
    for (const file of files) {
      if (isTestPath(file.path)) continue
      const syntax = syntaxOf(file)
      const aliases = new Map<string, string>()
      const resolve = (node: ts.Expression): string | undefined => {
        if (ts.isIdentifier(node)) return aliases.get(node.text) ?? node.text
        if (ts.isParenthesizedExpression(node)) return resolve(node.expression)
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const owner = resolve(node.expression)
          const member = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : ts.isStringLiteralLike(node.argumentExpression)
              ? node.argumentExpression.text
              : undefined
          if (owner !== undefined && member !== undefined)
            return owner === 'globalThis' ? member : `${owner}.${member}`
        }
        return undefined
      }
      // 同文件 const 别名与解构；不做跨文件或运行期赋值数据流追踪。
      visitSyntax(syntax, node => {
        if (
          !ts.isVariableDeclaration(node) ||
          node.initializer === undefined ||
          !ts.isVariableDeclarationList(node.parent) ||
          !(node.parent.flags & ts.NodeFlags.Const)
        )
          return
        const value = resolve(node.initializer)
        if (value === undefined) return
        if (ts.isIdentifier(node.name)) aliases.set(node.name.text, value)
        if (ts.isObjectBindingPattern(node.name)) {
          for (const binding of node.name.elements) {
            const member = nodeName(binding.propertyName ?? binding.name)
            if (member !== undefined && ts.isIdentifier(binding.name))
              aliases.set(binding.name.text, `${value}.${member}`)
          }
        }
      })
      visitSyntax(syntax, node => {
        const wallClock =
          (ts.isCallExpression(node) &&
            ['Date.now', 'performance.now'].includes(resolve(node.expression) ?? '')) ||
          (ts.isNewExpression(node) &&
            resolve(node.expression) === 'Date' &&
            (node.arguments?.length ?? 0) === 0)
        if (wallClock && !hasClockAnnotation(syntax, node))
          out.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, node.getStart(syntax)),
            message:
              '未标注的直接取时；领域时间必须来自 Clock，非领域用途须在具体调用前标注类别与理由',
          })
      })
    }
    return out
  },
}

function hasClockAnnotation(syntax: ts.SourceFile, node: ts.Node): boolean {
  const comments =
    ts.getLeadingCommentRanges(syntax.text, node.pos) ??
    ts.getTrailingCommentRanges(syntax.text, node.pos)
  const comment = comments?.at(-1)
  if (comment?.kind !== ts.SyntaxKind.MultiLineCommentTrivia) return false
  if (!/^[\t ]*$/.test(syntax.text.slice(comment.end, node.getStart(syntax)))) return false
  return /^\/\* wall-clock: (operation-timing|internal-name|clock-source|observation-time) -- [^\r\n\u2028\u2029]*\S[\t ]*\*\/$/.test(
    syntax.text.slice(comment.pos, comment.end),
  )
}
