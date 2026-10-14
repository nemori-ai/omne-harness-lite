import ts from 'typescript'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'
const entries = [
  '@omne-harness/evaluation-input-store/publication',
  '@omne-harness/evaluation-input-store/admitted',
] as const
type Entry = (typeof entries)[number]
const namedPublishers = new Set([
  'apps/cli/src/session-factory-assets.ts',
  'apps/cli/tests/session-bootstrap.spec.ts',
  'packages/model/model-request-runtime-local/tests/session-selection-fixture.ts',
  'packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts',
  'examples/model-invocation-minimal-demo/src/bootstrap.ts',
])
function owner(path: string): boolean {
  return /^packages\/assets\/evaluation-input-store\/src\/[^/]+\.ts$/u.test(path)
}
function allowed(path: string, target: Entry): boolean {
  if (target === entries[1])
    return (
      owner(path) ||
      /^packages\/assets\/evaluation-input-store\/tests\/.+\.(?:ts|mjs)$/u.test(path) ||
      path === 'apps/cli/src/session-bootstrap.ts'
    )
  return (
    owner(path) ||
    /^packages\/assets\/evaluation-input-store\/tests\/.+\.(?:ts|mjs)$/u.test(path) ||
    namedPublishers.has(path) ||
    /^examples\/model-invocation-minimal-demo\/tests\/.+\.ts$/u.test(path)
  )
}
function reference(file: SourceFile, specifier: string): Entry | undefined {
  const target =
    file.resolvedModules?.[specifier] ??
    (specifier.startsWith('.') ? normalize(join(dirname(file.path), specifier)) : specifier)
  if (entries.includes(target as Entry)) return target as Entry
  const local =
    /^(?:packages\/assets\/evaluation-input-store\/(?:src|dist)\/|@omne-harness\/evaluation-input-store\/(?:src\/)?)(publication|admitted)(?:\.d)?(?:\.[cm]?[jt]s)?$/u.exec(
      target,
    )
  return local ? entries.find(value => value.endsWith('/' + local[1])) : undefined
}
export const evaluationPublicationBoundary: Rule = {
  id: 'evaluation-publication-boundary',
  source:
    'packages/assets/evaluation-input-store/SPEC.md: 持久身份、发布与捕获; verification/README.md',
  description:
    'source publication and admitted recipe capture are held by their owner, named CLI factory and trusted bootstrap fixtures',
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
          !allowed(file.path, reference(file, ref.specifier!)!) ||
          (!owner(file.path) &&
            ref.specifier !== reference(file, ref.specifier!) &&
            !file.path.startsWith('packages/assets/evaluation-input-store/tests/'))
        )
          report(
            file,
            ref.index,
            'publication is limited to its component owner, named CLI factory and trusted bootstrap/tests through the public entry',
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
