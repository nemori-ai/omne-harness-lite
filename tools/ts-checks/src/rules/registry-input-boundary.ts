import ts from 'typescript'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'

const entry = '@omne-harness/evaluation-input-store/registry-inputs'
const implementation = 'packages/assets/evaluation-input-store/src/registry-inputs.ts'
function allowed(path: string): boolean {
  return (
    /^packages\/tools\/asset-registry-local\/(?:src|tests)\/.+\.ts$/u.test(path) ||
    /^packages\/assets\/evaluation-input-store\/tests\/.+\.spec(?:-d)?\.ts$/u.test(path) ||
    path === 'examples/model-invocation-minimal-demo/src/bootstrap.ts' ||
    /^examples\/model-invocation-minimal-demo\/tests\/.+\.ts$/u.test(path)
  )
}
function restricted(file: SourceFile, specifier: string): boolean {
  const target =
    file.resolvedModules?.[specifier] ??
    (specifier.startsWith('.') ? normalize(join(dirname(file.path), specifier)) : specifier)
  return (
    target === entry ||
    /^packages\/assets\/evaluation-input-store\/(?:src|dist)\/registry-inputs(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      target,
    ) ||
    /^@omne-harness\/evaluation-input-store\/(?:src\/)?registry-inputs(?:\.[cm]?[jt]s)?$/u.test(
      target,
    )
  )
}
export const registryInputBoundary: Rule = {
  id: 'registry-input-boundary',
  source: 'packages/assets/evaluation-input-store/SPEC.md: 固定根读取',
  description: 'fixed-root reading stays with its trusted registry and acceptance consumers',
  check(files) {
    const violations: Violation[] = []
    const report = (file: SourceFile, index: number, message: string) => {
      violations.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
    }
    for (const file of files) {
      if (file.path === implementation) continue
      const syntax = syntaxOf(file)
      const references = syntaxImports(syntax).filter(
        ref => ref.specifier !== undefined && restricted(file, ref.specifier),
      )
      for (const ref of references)
        if (!allowed(file.path) || ref.specifier !== entry)
          report(
            file,
            ref.index,
            'registry inputs require the public entry and an approved registry implementation or acceptance path',
          )
      if (references.length === 0) continue
      const factories = new Set<string>()
      for (const node of syntax.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteralLike(node.moduleSpecifier) ||
          !restricted(file, node.moduleSpecifier.text)
        )
          continue
        const clause = node.importClause
        if (
          clause?.name !== undefined ||
          clause?.namedBindings === undefined ||
          !ts.isNamedImports(clause.namedBindings)
        ) {
          report(
            file,
            node.getStart(syntax),
            'fixed-root inputs require explicit named imports; namespace and default loading are rejected',
          )
          continue
        }
        for (const binding of clause.namedBindings.elements) {
          if (clause.isTypeOnly || binding.isTypeOnly) continue
          if ((binding.propertyName ?? binding.name).text !== 'createRegistryInputReader')
            report(
              file,
              binding.getStart(syntax),
              'only the fixed-root reader factory is a runtime export',
            )
          factories.add(binding.name.text)
        }
      }
      visitSyntax(syntax, node => {
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          restricted(file, node.moduleSpecifier.text)
        )
          report(
            file,
            node.getStart(syntax),
            'restricted inputs cannot be re-exported by a consumer',
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
            restricted(file, argument.text)
          )
            report(
              file,
              node.getStart(syntax),
              'restricted reader consumers must load the statically named public entry',
            )
        }
        if (ts.isIdentifier(node) && factories.has(node.text)) {
          if (
            ts.isImportSpecifier(node.parent) ||
            (ts.isCallExpression(node.parent) && node.parent.expression === node)
          )
            return
          report(
            file,
            node.getStart(syntax),
            'fixed-root factory may be called locally, but cannot be aliased, exported or registered',
          )
        }
      })
    }
    return violations
  },
}
