import ts from '@typescript/typescript6'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '@omne-harness/repo-toolchain/core/rule'
import { syntaxImports, syntaxOf, visitSyntax } from '@omne-harness/repo-toolchain/core/syntax'
import { lineAt } from '@omne-harness/repo-toolchain/core/source-text'

const catalogEntry = '@omne-harness/session-tenancy-table/maintenance'
const catalogImplementation = 'packages/session/session-tenancy-table/src/maintenance.ts'
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
function allowed(path: string): boolean {
  return (
    path === bootstrap || path === 'packages/session/session-tenancy-table/tests/catalog.spec.ts'
  )
}
function resolved(path: string, specifier: string): string {
  if (specifier.startsWith('.'))
    return normalize(join(dirname(path), specifier)).replace(/\.[cm]?[jt]s$/u, '')
  return specifier
}
function catalogReference(file: SourceFile, specifier: string): boolean {
  const target = file.resolvedModules?.[specifier] ?? resolved(file.path, specifier)
  return (
    target === catalogEntry ||
    /^packages\/session\/session-tenancy-table\/(?:src|dist)\/maintenance(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      target,
    ) ||
    /^@omne-harness\/session-tenancy-table\/(?:src\/)?maintenance(?:\.[cm]?[jt]s)?$/u.test(target)
  )
}

/** This rule receives repository-relative paths, never paths relative to packages/. */
export const sessionCatalogBoundary: Rule = {
  id: 'session-catalog-boundary',
  source: 'session-tenancy-table SPEC.md STC-1 / STC-2',
  description:
    'catalog imports have an exact repository path allowlist and cannot escape through aliases or exports',
  check(files) {
    const violations: Violation[] = []
    const report = (file: SourceFile, index: number, message: string): void => {
      violations.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
    }
    for (const file of files) {
      if (file.path === catalogImplementation) continue
      const syntax = syntaxOf(file)
      const refs = syntaxImports(syntax)
      const restricted = refs.filter(
        ref => ref.specifier !== undefined && catalogReference(file, ref.specifier),
      )
      for (const ref of restricted) {
        if (!allowed(file.path) || ref.specifier !== catalogEntry)
          report(
            file,
            ref.index,
            'catalog is only imported through its public entry at the exact approved bootstrap or catalog verification paths',
          )
      }
      if (restricted.length === 0) continue
      const names = new Set<string>()
      for (const node of syntax.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteralLike(node.moduleSpecifier) ||
          !catalogReference(file, node.moduleSpecifier.text)
        )
          continue
        const bindings = node.importClause?.namedBindings
        if (
          node.importClause?.name !== undefined ||
          bindings === undefined ||
          !ts.isNamedImports(bindings)
        ) {
          report(
            file,
            node.getStart(syntax),
            'catalog requires a named readSessionCatalogIn import; opaque namespace/default loading cannot establish the boundary',
          )
          continue
        }
        for (const binding of bindings.elements) {
          if ((binding.propertyName ?? binding.name).text !== 'readSessionCatalogIn')
            report(
              file,
              binding.getStart(syntax),
              'only readSessionCatalogIn is admitted from the catalog entry',
            )
          names.add(binding.name.text)
        }
      }
      visitSyntax(syntax, node => {
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          catalogReference(file, node.moduleSpecifier.text)
        )
          report(file, node.getStart(syntax), 'approved consumers cannot re-export catalog')
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const argument = node.arguments[0]
          if (
            argument === undefined ||
            !ts.isStringLiteralLike(argument) ||
            catalogReference(file, argument.text)
          )
            report(
              file,
              node.getStart(syntax),
              'restricted consumer must use a statically named import; dynamic/require loads and undecidable forwarding are rejected',
            )
        }
        if (ts.isIdentifier(node) && names.has(node.text)) {
          const parent = node.parent
          if (
            ts.isImportSpecifier(parent) ||
            (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (ts.isCallExpression(parent) && parent.expression === node)
          )
            return
          report(
            file,
            node.getStart(syntax),
            'catalog closure may only be invoked locally; it cannot be aliased, returned, exported or registered',
          )
        }
      })
    }
    return violations
  },
}
