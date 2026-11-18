import ts from '@typescript/typescript6'
import { isTestPath, type Rule, type Violation } from '@omne-harness/repo-toolchain/core/rule'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'
import { syntaxOf, visitSyntax } from '@omne-harness/repo-toolchain/core/syntax'

const CORE = /(^|\/)session\/(session-contract|session|session-cordis)\/src\//u
const TESTING_DOUBLE = /\/src\/testing[^/]*$/u
const DECLARER = 'inputSourceName'

function declaredName(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return undefined
  if (node.expression.text !== DECLARER) return undefined
  const [first] = node.arguments
  return first !== undefined && ts.isStringLiteralLike(first) ? first.text : undefined
}

export const sessionCoreNoSourceNames: Rule = {
  id: 'session-core-no-source-names',
  source: 'packages/session/SPEC.md#输入来源 · SE-30',
  description:
    'Session 的三个核心成员（session-contract、session、session-cordis）的源码里不出现任何登记的输入来源名，也不自己造来源名',
  check(files) {
    const names = new Set<string>()
    for (const file of files)
      visitSyntax(syntaxOf(file), node => {
        const name = declaredName(node)
        if (name !== undefined) names.add(name)
      })
    const out: Violation[] = []
    for (const file of files) {
      if (!CORE.test(file.path) || isTestPath(file.path) || TESTING_DOUBLE.test(file.path)) continue
      const syntax = syntaxOf(file)
      visitSyntax(syntax, node => {
        const built = declaredName(node) !== undefined
        const written = ts.isStringLiteralLike(node) && names.has(node.text)
        if (!built && !written) return
        if (written && declaredName(node.parent) !== undefined) return
        out.push({
          rule: this.id,
          path: file.path,
          line: lineAt(file.text, node.getStart(syntax)),
          message: built
            ? '核心成员自己造了一个输入来源名；来源由贡献方向 session.input-sources 登记'
            : '核心成员写了一个登记的输入来源名；判断只读受理时写进日志的值，不点来源的名字',
        })
      })
    }
    return out
  },
}
