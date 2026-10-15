import ts from '@typescript/typescript6'
import type { SourceFile } from './rule.ts'
import { syntaxOf, visitSyntax } from './syntax.ts'

/** Permit the host's private declaration comparison, without resolving a purge service. */
export function hostPolicyReferences(file: SourceFile): ReadonlySet<number> {
  const allowed = new Set<number>()
  if (file.path !== 'tenancy-host/src/policy.ts') return allowed
  const source = syntaxOf(file),
    nodes: ts.Node[] = []
  visitSyntax(source, node => nodes.push(node))
  const tables = nodes.filter(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'required',
  )
  if (tables.length !== 1) return allowed
  const table = tables[0]!,
    list = table.parent
  if (
    !table.initializer ||
    !ts.isObjectLiteralExpression(table.initializer) ||
    !ts.isVariableDeclarationList(list) ||
    !(list.flags & ts.NodeFlags.Const) ||
    !ts.isVariableStatement(list.parent) ||
    list.parent.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
  )
    return allowed
  const keys = new Set<ts.Node>()
  for (const property of table.initializer.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isIdentifier(property.name) ||
      !ts.isArrayLiteralExpression(property.initializer)
    )
      return allowed
    for (const key of property.initializer.elements) {
      if (!ts.isIdentifier(key)) return allowed
      if (key.text === 'ORGANIZATION_PURGE_SERVICE' && property.name.text !== 'organizations')
        return allowed
      keys.add(key)
    }
  }
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || node.text !== 'required' || node === table.name) continue
    const parent = node.parent
    if (
      ts.isCallExpression(parent) &&
      parent.arguments[0] === node &&
      ts.isPropertyAccessExpression(parent.expression) &&
      ts.isIdentifier(parent.expression.expression) &&
      parent.expression.expression.text === 'Object' &&
      ((parent.expression.name.text === 'keys' && parent.arguments.length === 1) ||
        (parent.expression.name.text === 'hasOwn' && parent.arguments.length === 2))
    )
      continue
    if (!ts.isElementAccessExpression(parent) || parent.expression !== node) return allowed
    const some = parent.parent,
      call = some.parent
    if (
      !ts.isPropertyAccessExpression(some) ||
      some.name.text !== 'some' ||
      !ts.isCallExpression(call) ||
      call.expression !== some ||
      call.arguments.length !== 1
    )
      return allowed
    const predicate = call.arguments[0]!
    if (
      !ts.isArrowFunction(predicate) ||
      predicate.parameters.length !== 1 ||
      !ts.isIdentifier(predicate.parameters[0]!.name) ||
      !ts.isPrefixUnaryExpression(predicate.body) ||
      predicate.body.operator !== ts.SyntaxKind.ExclamationToken
    )
      return allowed
    const includes = predicate.body.operand
    if (
      !ts.isCallExpression(includes) ||
      !ts.isPropertyAccessExpression(includes.expression) ||
      includes.expression.name.text !== 'includes' ||
      !ts.isPropertyAccessExpression(includes.expression.expression) ||
      includes.expression.expression.name.text !== 'provides' ||
      includes.arguments.length !== 1 ||
      !ts.isIdentifier(includes.arguments[0]!) ||
      includes.arguments[0]!.text !== predicate.parameters[0]!.name.text
    )
      return allowed
  }
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || node.text !== 'ORGANIZATION_PURGE_SERVICE') continue
    if (keys.has(node)) allowed.add(node.getStart(source))
    else if (ts.isImportSpecifier(node.parent) && !node.parent.propertyName) {
      const declaration = node.parent.parent.parent.parent
      if (
        ts.isImportDeclaration(declaration) &&
        ts.isStringLiteral(declaration.moduleSpecifier) &&
        declaration.moduleSpecifier.text === '@omne-harness/organization-governance/cordis'
      )
        allowed.add(node.getStart(source))
    }
  }
  return allowed
}
