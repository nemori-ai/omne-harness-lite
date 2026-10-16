import ts from '@typescript/typescript6'
import type { Rule, Violation } from '../core/rule.ts'
import { lineAt } from '../core/source-text.ts'
import { syntaxOf, visitSyntax } from '../core/syntax.ts'

const forbiddenMethods = new Set(['updateTable', 'deleteFrom', 'replaceInto', 'mergeInto'])
const mutationSql =
  /\b(?:update|delete\s+from|replace\s+into|insert\s+or\s+replace\s+into|merge\s+into)\s+["`[]?assembly_manifest_(?:record|table)\b/iu

/** Scoped AST check; it does not claim whole-program alias or generated SQL analysis. */
export const manifestImmutable: Rule = {
  id: 'manifest-immutable',
  source: 'MF4 S-13/S-24; assembly-manifest-store V-4 / MG-V12',
  description: 'manifest product source has no mutation or forwarding of mutation builder methods',
  check(files) {
    const violations: Violation[] = []
    for (const file of files) {
      if (!/^packages\/assets\/assembly-manifest-store\/src\/.+\.ts$/u.test(file.path)) continue
      const syntax = syntaxOf(file)
      visitSyntax(syntax, node => {
        let forbidden = false
        if (ts.isPropertyAccessExpression(node)) forbidden = forbiddenMethods.has(node.name.text)
        if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
          forbidden = forbiddenMethods.has(node.argumentExpression.text)
        if (ts.isBindingElement(node)) {
          const name = node.propertyName ?? node.name
          if (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
            forbidden = forbiddenMethods.has(name.text)
          else if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression))
            forbidden = forbiddenMethods.has(name.expression.text)
        }
        // Inspect literal SQL in raw calls and tagged templates, including renamed tags.
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'raw'
        ) {
          const value = node.arguments[0]
          forbidden ||=
            value !== undefined && ts.isStringLiteralLike(value) && mutationSql.test(value.text)
        }
        if (ts.isTaggedTemplateExpression(node))
          forbidden ||= mutationSql.test(
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
              'manifest records and tables are immutable; mutation and mutation-method forwarding are forbidden',
          })
      })
    }
    return violations
  },
}
