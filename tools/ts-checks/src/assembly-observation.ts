import ts from 'typescript'
import type { SourceFile } from './rule.ts'

function isPresenceComparison(node: ts.Node): boolean {
  const comparison = node.parent
  return (
    ts.isBinaryExpression(comparison) &&
    comparison.left === node &&
    comparison.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    ts.isIdentifier(comparison.right) &&
    comparison.right.text === 'undefined'
  )
}

/** T2 permits this assembly's provides check, never a purge capability consumer. */
export function assemblyObservationReferences(file: SourceFile): ReadonlySet<number> {
  const allowed = new Set<number>()
  if (file.path !== 'tenancy-host/src/assembly.ts') return allowed
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
  const nodes: ts.Node[] = []
  const visit = (node: ts.Node): void => {
    nodes.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  // Both readiness and missing-dependency diagnostics must keep service values inside a boolean test.
  for (const node of nodes) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) continue
    const target = node.expression
    if (
      ts.isIdentifier(target.expression) &&
      target.expression.text === 'scope' &&
      target.name.text === 'get' &&
      !isPresenceComparison(node)
    )
      return allowed
  }
  const tables = nodes.filter(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'provides',
  )
  if (tables.length !== 1) return allowed
  const table = tables[0]!
  if (!table.initializer || !ts.isObjectLiteralExpression(table.initializer)) return allowed
  const list = table.parent
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const)) return allowed
  if (
    ts.isVariableStatement(list.parent) &&
    list.parent.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
  )
    return allowed
  const metadataKeys = new Set<ts.Node>()
  for (const property of table.initializer.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      !ts.isArrayLiteralExpression(property.initializer)
    )
      return allowed
    for (const key of property.initializer.elements) {
      if (!ts.isIdentifier(key)) return allowed
      metadataKeys.add(key)
    }
  }
  // The table cannot escape, be indexed for a call, be mutated, or feed another function.
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || node.text !== 'provides' || node === table.name) continue
    const element = node.parent
    if (!ts.isElementAccessExpression(element) || element.expression !== node) return allowed
    const some = element.parent
    if (
      !ts.isPropertyAccessExpression(some) ||
      some.expression !== element ||
      some.name.text !== 'some'
    )
      return allowed
    const call = some.parent
    if (!ts.isCallExpression(call) || call.expression !== some || call.arguments.length !== 1)
      return allowed
    const predicate = call.arguments[0]!
    if (!ts.isArrowFunction(predicate) || predicate.parameters.length !== 1) return allowed
    const parameter = predicate.parameters[0]!.name
    const body = predicate.body
    if (
      !ts.isIdentifier(parameter) ||
      !ts.isBinaryExpression(body) ||
      body.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken ||
      !ts.isIdentifier(body.right) ||
      body.right.text !== 'undefined'
    )
      return allowed
    const get = body.left
    if (
      !ts.isCallExpression(get) ||
      !ts.isPropertyAccessExpression(get.expression) ||
      get.expression.name.text !== 'get' ||
      !ts.isIdentifier(get.expression.expression) ||
      get.expression.expression.text !== 'scope' ||
      get.arguments.length !== 1 ||
      !ts.isIdentifier(get.arguments[0]!) ||
      get.arguments[0]!.getText(source) !== parameter.text
    )
      return allowed
  }
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || node.text !== 'ORGANIZATION_PURGE_SERVICE') continue
    if (metadataKeys.has(node)) allowed.add(node.getStart(source))
    else if (ts.isImportSpecifier(node.parent) && !node.parent.propertyName) {
      const declaration = node.parent.parent.parent.parent
      if (
        ts.isImportDeclaration(declaration) &&
        ts.isStringLiteral(declaration.moduleSpecifier) &&
        declaration.moduleSpecifier.text === '@omne-harness-lite/organization-governance/cordis'
      )
        allowed.add(node.getStart(source))
    }
  }
  return allowed
}
