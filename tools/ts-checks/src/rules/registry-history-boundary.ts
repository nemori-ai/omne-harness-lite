import ts from 'typescript'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../rule.ts'
import { lineAt } from '../source-text.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../syntax.ts'

const entry = '@omne-harness-lite/evaluation-input-store/registry-history'
function ownSource(path: string): boolean {
  return (
    /^packages\/assets\/evaluation-input-store\/(?:src|tests)\/.+\.ts$/u.test(path) &&
    path !== 'packages/assets/evaluation-input-store/src/index.ts'
  )
}
function valueAllowed(path: string): boolean {
  return (
    path === 'examples/model-invocation-minimal-demo/src/bootstrap.ts' ||
    /^packages\/tools\/asset-registry\/tests\/.+\.ts$/u.test(path) ||
    /^examples\/model-invocation-minimal-demo\/tests\/.+\.ts$/u.test(path)
  )
}
function typeAllowed(path: string): boolean {
  return valueAllowed(path) || /^packages\/tools\/asset-registry\/src\/.+\.ts$/u.test(path)
}
function restricted(file: SourceFile, specifier: string): boolean {
  const target =
    file.resolvedModules?.[specifier] ??
    (specifier.startsWith('.') ? normalize(join(dirname(file.path), specifier)) : specifier)
  return (
    target === entry ||
    /^packages\/assets\/evaluation-input-store\/(?:src|dist)\/registry-history(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      target,
    ) ||
    /^@omne-harness-lite\/evaluation-input-store\/(?:src\/)?registry-history(?:\.[cm]?[jt]s)?$/u.test(
      target,
    )
  )
}
const typeNames = new Set([
  'RegistryHistoryRequest',
  'RegistryHistoryResult',
  'RegistryHistoryStage',
  'RegistryHistoryCategory',
  'RegistryHistoryReader',
  'RegistryHistoryDependencies',
])
export const registryHistoryBoundary: Rule = {
  id: 'registry-history-boundary',
  source: 'D080; EIS history HI-1/HI-6/HI-V9 and AR4 S31/S33',
  description:
    'history factory belongs to the trusted assembly; registry source may only import types',
  check(files) {
    const violations: Violation[] = []
    const report = (file: SourceFile, index: number, message: string) => {
      violations.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
    }
    for (const file of files) {
      if (ownSource(file.path)) continue
      const syntax = syntaxOf(file)
      const refs = syntaxImports(syntax).filter(
        ref => ref.specifier !== undefined && restricted(file, ref.specifier),
      )
      if (refs.length === 0) continue
      for (const ref of refs)
        if (!typeAllowed(file.path) || ref.specifier !== entry)
          report(
            file,
            ref.index,
            'history uses the named public entry at precisely approved paths only',
          )
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
            'history entry requires named imports, including explicit named type imports',
          )
          continue
        }
        for (const binding of clause.namedBindings.elements) {
          const name = (binding.propertyName ?? binding.name).text
          if (clause.isTypeOnly || binding.isTypeOnly) {
            if (!typeNames.has(name))
              report(
                file,
                binding.getStart(syntax),
                'only the declared history data/reader types are imported as types',
              )
          } else {
            if (!valueAllowed(file.path) || name !== 'createRegistryHistoryReader')
              report(
                file,
                binding.getStart(syntax),
                'only approved bootstrap/acceptance paths construct the history reader; registry receives read by injection',
              )
            factories.add(binding.name.text)
          }
        }
      }
      visitSyntax(syntax, node => {
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          restricted(file, node.moduleSpecifier.text)
        )
          report(file, node.getStart(syntax), 'restricted history entry cannot be re-exported')
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const arg = node.arguments[0]
          if (arg === undefined || !ts.isStringLiteralLike(arg) || restricted(file, arg.text))
            report(
              file,
              node.getStart(syntax),
              'history must be imported statically, never hidden by dynamic loading',
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
            'history factory cannot be aliased, returned, exported or registered',
          )
        }
      })
    }
    return violations
  },
}
