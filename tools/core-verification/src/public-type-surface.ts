import ts from 'typescript'

/** 枚举根声明明确导出的类型符号；值与类型双重用途的 class 另由值消费者覆盖。 */
export function namedTypeExports(text: string): readonly string[] {
  const source = ts.createSourceFile('index.d.ts', text, ts.ScriptTarget.Latest, true)
  const names = new Set<string>()
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause))
        throw new Error('root type inventory requires explicit named exports')
      for (const element of statement.exportClause.elements)
        if (statement.isTypeOnly || element.isTypeOnly) names.add(element.name.text)
    } else if (
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.add(statement.name.text)
    }
  }
  return [...names].sort()
}

/** 只计直接具名 import type，alias 按其公开名字对账，不把值 import 当作覆盖。 */
export function namedTypeImports(text: string): ReadonlyMap<string, readonly string[]> {
  const source = ts.createSourceFile('consumer.ts', text, ts.ScriptTarget.Latest, true)
  const imports = new Map<string, Set<string>>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const clause = statement.importClause
    if (clause === undefined) continue
    const bindings = clause.namedBindings
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      if (clause.isTypeOnly) throw new Error('type inventory requires direct named type imports')
      continue
    }
    const names = imports.get(statement.moduleSpecifier.text) ?? new Set<string>()
    for (const element of bindings.elements)
      if (clause.isTypeOnly || element.isTypeOnly)
        names.add(element.propertyName?.text ?? element.name.text)
    if (names.size > 0) imports.set(statement.moduleSpecifier.text, names)
  }
  return new Map([...imports].map(([module, names]) => [module, [...names].sort()]))
}

export function missingTypeImports(exports: readonly string[], imports: readonly string[]) {
  const available = new Set(imports)
  return exports.filter(name => !available.has(name)).sort()
}
