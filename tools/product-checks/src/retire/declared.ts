import ts from '@typescript/typescript6'

/** 文件顶层声明的值（函数、类、枚举、变量）与它们所在的行。解析语法树，不构造类型检查程序。 */
export function declaredValues(path: string, text: string): ReadonlyMap<string, number> {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const found = new Map<string, number>()
  const add = (name: string, node: ts.Node): void => {
    if (!found.has(name))
      found.set(name, source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)
  }
  const addBinding = (name: ts.BindingName, owner: ts.Node): void => {
    if (ts.isIdentifier(name)) {
      add(name.text, owner)
      return
    }
    for (const element of name.elements)
      if (ts.isBindingElement(element)) addBinding(element.name, owner)
  }
  for (const statement of source.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    )
      add(statement.name.text, statement)
    else if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        addBinding(declaration.name, statement)
  }
  return found
}
