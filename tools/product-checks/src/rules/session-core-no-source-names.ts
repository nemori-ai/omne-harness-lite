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

const RULE_ID = 'session-core-no-source-names'
const BUILT = '核心成员自己造了一个输入来源名；来源由贡献方向 session.input-sources 登记'
const WRITTEN = '核心成员写了一个登记的输入来源名；判断只读受理时写进日志的值，不点来源的名字'

type Files = Parameters<Rule['check']>[0]

function declaredNames(files: Files): ReadonlySet<string> {
  const names = new Set<string>()
  for (const file of files)
    visitSyntax(syntaxOf(file), node => {
      const name = declaredName(node)
      if (name !== undefined) names.add(name)
    })
  return names
}

function isCoreSource(path: string): boolean {
  return CORE.test(path) && !isTestPath(path) && !TESTING_DOUBLE.test(path)
}

/** What a node of a core member does wrong, if anything: builds a source name, or writes one. */
function faultOf(node: ts.Node, names: ReadonlySet<string>): string | undefined {
  if (declaredName(node) !== undefined) return BUILT
  if (!ts.isStringLiteralLike(node) || !names.has(node.text)) return undefined
  return declaredName(node.parent) === undefined ? WRITTEN : undefined
}

export const sessionCoreNoSourceNames: Rule = {
  id: RULE_ID,
  source: 'packages/session/SPEC.md#输入来源 · SE-30',
  description:
    'Session 的三个核心成员（session-contract、session、session-cordis）的源码里不出现任何登记的输入来源名，也不自己造来源名',
  check(files) {
    const names = declaredNames(files)
    const out: Violation[] = []
    for (const file of files) {
      if (!isCoreSource(file.path)) continue
      const syntax = syntaxOf(file)
      visitSyntax(syntax, node => {
        const message = faultOf(node, names)
        if (message === undefined) return
        const line = lineAt(file.text, node.getStart(syntax))
        out.push({ rule: RULE_ID, path: file.path, line, message })
      })
    }
    return out
  },
}
