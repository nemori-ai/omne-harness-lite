import ts from '@typescript/typescript6'
import { dirname, join, normalize } from 'node:path/posix'
import type { Rule, SourceFile, Violation } from '../core/rule.ts'
import { syntaxImports, syntaxOf, visitSyntax } from '../core/syntax.ts'
import { lineAt } from '../core/source-text.ts'

const seedEntry = '@omne-harness/session-tenancy-table/seed'
const seedImplementation = 'packages/session/session-tenancy-table/src/seed.ts'
const bootstrap = 'examples/model-invocation-minimal-demo/src/bootstrap.ts'
function allowed(path: string): boolean {
  return (
    path === bootstrap ||
    /^apps\/cli\/tests\/.+\.ts$/u.test(path) ||
    /^examples\/model-invocation-minimal-demo\/tests\/.+\.ts$/u.test(path)
  )
}
function resolved(path: string, specifier: string): string {
  if (specifier.startsWith('.'))
    return normalize(join(dirname(path), specifier)).replace(/\.[cm]?[jt]s$/u, '')
  return specifier
}
function seedReference(file: SourceFile, specifier: string): boolean {
  const target = file.resolvedModules?.[specifier] ?? resolved(file.path, specifier)
  return (
    target === seedEntry ||
    /^packages\/session\/session-tenancy-table\/(?:src|dist)\/seed(?:\.d)?(?:\.[cm]?[jt]s)?$/u.test(
      target,
    ) ||
    /^@omne-harness\/session-tenancy-table\/(?:src\/)?seed(?:\.[cm]?[jt]s)?$/u.test(target)
  )
}

/** This rule receives repository-relative paths, never paths relative to packages/. */
export const sessionSeedBoundary: Rule = {
  id: 'session-seed-boundary',
  source: 'session-tenancy-table rev2 V2-1 / STT-4 / STT-6',
  description:
    'seed imports have an exact repository path allowlist and cannot escape through aliases or exports',
  check(files) {
    const violations: Violation[] = []
    const report = (file: SourceFile, index: number, message: string): void => {
      violations.push({ rule: this.id, path: file.path, line: lineAt(file.text, index), message })
    }
    for (const file of files) {
      if (file.path === seedImplementation) continue
      const syntax = syntaxOf(file)
      const refs = syntaxImports(syntax)
      const restricted = refs.filter(
        ref => ref.specifier !== undefined && seedReference(file, ref.specifier),
      )
      for (const ref of restricted) {
        if (!allowed(file.path) || ref.specifier !== seedEntry)
          report(
            file,
            ref.index,
            'seed is only imported through its public entry at the exact approved bootstrap or acceptance test paths',
          )
      }
      if (restricted.length === 0) continue
      const names = new Set<string>()
      for (const node of syntax.statements) {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteralLike(node.moduleSpecifier) ||
          !seedReference(file, node.moduleSpecifier.text)
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
            'seed requires a named seedHoldingTenant import; opaque namespace/default loading cannot establish the boundary',
          )
          continue
        }
        for (const binding of bindings.elements) {
          if ((binding.propertyName ?? binding.name).text !== 'seedHoldingTenant')
            report(
              file,
              binding.getStart(syntax),
              'only seedHoldingTenant is admitted from the seed entry',
            )
          names.add(binding.name.text)
        }
      }
      visitSyntax(syntax, node => {
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier) &&
          seedReference(file, node.moduleSpecifier.text)
        )
          report(file, node.getStart(syntax), 'approved consumers cannot re-export seed')
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const argument = node.arguments[0]
          if (
            argument === undefined ||
            !ts.isStringLiteralLike(argument) ||
            seedReference(file, argument.text)
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
            (ts.isCallExpression(parent) && parent.expression === node)
          )
            return
          report(
            file,
            node.getStart(syntax),
            'seed closure may only be invoked locally; it cannot be aliased, returned, exported or registered',
          )
        }
      })
    }
    return violations
  },
}

export const sessionMappingImmutable: Rule = {
  id: 'session-mapping-immutable',
  source: 'session-tenancy-table V-1 / ST2 S-6',
  description: 'session_tenancy never receives UPDATE or DELETE',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      const syntax = syntaxOf(file)
      const literalNames = new Map<string, string>()
      visitSyntax(syntax, node => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer !== undefined &&
          ts.isStringLiteralLike(node.initializer)
        )
          literalNames.set(node.name.text, node.initializer.text)
      })
      visitSyntax(syntax, node => {
        let forbidden = false
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ['updateTable', 'deleteFrom'].includes(node.expression.name.text)
        ) {
          const argument = node.arguments[0]
          const target =
            argument !== undefined && ts.isStringLiteralLike(argument)
              ? argument.text
              : argument !== undefined && ts.isIdentifier(argument)
                ? literalNames.get(argument.text)
                : undefined
          forbidden = target?.toLowerCase() === 'session_tenancy'
        }
        const forbiddenSql = (text: string | undefined): boolean =>
          text !== undefined && /\b(?:update|delete\s+from)\s+["`[]?session_tenancy\b/iu.test(text)
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'raw'
        ) {
          const argument = node.arguments[0]
          forbidden ||= forbiddenSql(
            argument !== undefined && ts.isStringLiteralLike(argument)
              ? argument.text
              : argument !== undefined && ts.isIdentifier(argument)
                ? literalNames.get(argument.text)
                : undefined,
          )
        }
        if (
          ts.isTaggedTemplateExpression(node) &&
          ts.isIdentifier(node.tag) &&
          node.tag.text === 'sql'
        )
          forbidden ||= forbiddenSql(
            ts.isNoSubstitutionTemplateLiteral(node.template)
              ? node.template.text
              : node.template.head.text,
          )
        if (forbidden)
          violations.push({
            rule: this.id,
            path: file.path,
            line: lineAt(file.text, node.getStart(syntax)),
            message:
              'session_tenancy is append-only; UPDATE and DELETE violate the immutable holding identity',
          })
      })
    }
    return violations
  },
}
