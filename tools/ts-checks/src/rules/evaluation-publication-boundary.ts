import ts from 'typescript'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'
const entry = '@omne-harness-lite/evaluation-input-store/publication'
function owner(path: string): boolean {
  return /^packages\/assets\/evaluation-input-store\/src\/[^/]+\.ts$/u.test(path)
}
function allowed(path: string): boolean {
  return (
    owner(path) ||
    /^packages\/assets\/evaluation-input-store\/tests\/.+\.(?:ts|mjs)$/u.test(path) ||
    path === 'packages/model/model-request-runtime/tests/session-selection-fixture.ts' ||
    path === 'examples/model-invocation-minimal-demo/src/bootstrap.ts' ||
    /^examples\/model-invocation-minimal-demo\/tests\/.+\.ts$/u.test(path)
  )
}
function reference(file: SourceFile, specifier: string): boolean {
  const target =
    file.resolvedModules?.[specifier] ??
    (specifier.startsWith('.') ? normalize(join(dirname(file.path), specifier)) : specifier)
  return (
    target === entry ||
    /^packages\/assets\/evaluation-input-store\/(?:src|dist)\/publication(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      target,
    ) ||
    /^@omne-harness-lite\/evaluation-input-store\/(?:src\/)?publication(?:\.[cm]?[jt]s)?$/u.test(
      target,
    )
  )
}
export const evaluationPublicationBoundary: Rule = {
  id: 'evaluation-publication-boundary',
  source: 'EIS design public publication responsibility / verification static boundary',
  description:
    'source publication and recipe capture are held by their owner, trusted acceptance bootstrap and named real-source test fixture',
  check(files) {
    const violations: Violation[] = []
    const report = (file: SourceFile, index: number, message: string) => {
      violations.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
    }
    for (const file of files) {
      const syntax = syntaxOf(file)
      const refs = syntaxImports(syntax).filter(
        ref => ref.specifier !== undefined && reference(file, ref.specifier),
      )
      for (const ref of refs)
        if (
          !allowed(file.path) ||
          (!owner(file.path) &&
            ref.specifier !== entry &&
            !file.path.startsWith('packages/assets/evaluation-input-store/tests/'))
        )
          report(
            file,
            ref.index,
            'publication is limited to its component owner, trusted acceptance bootstrap/tests and named real-source fixture through the public entry',
          )
      if (refs.length === 0) continue
      visitSyntax(syntax, node => {
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          reference(file, node.moduleSpecifier.text)
        )
          report(
            file,
            node.getStart(syntax),
            'publication cannot be re-exported into a runtime or another public service',
          )
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const argument = node.arguments[0]
          if (
            argument === undefined ||
            !ts.isStringLiteralLike(argument) ||
            reference(file, argument.text)
          )
            report(
              file,
              node.getStart(syntax),
              'publication requires a static public import, not dynamic or require forwarding',
            )
        }
      })
    }
    return violations
  },
}
