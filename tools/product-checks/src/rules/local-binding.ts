// 同一文件内的局部取值：顺着外层块找到名字的初始化表达式。参数、catch 与解构绑定会遮住外层同名，查找到此为止。
// 不跟踪重新赋值、函数传参与跨模块数据流。
import ts from '@typescript/typescript6'

function bindsName(name: ts.BindingName, identifier: string): boolean {
  return ts.isIdentifier(name)
    ? name.text === identifier
    : name.elements.some(
        element => ts.isBindingElement(element) && bindsName(element.name, identifier),
      )
}

function localInitializer(identifier: ts.Identifier): ts.Expression | undefined {
  for (
    let scope: ts.Node | undefined = identifier.parent;
    scope !== undefined;
    scope = scope.parent
  ) {
    if (
      ts.isFunctionLike(scope) &&
      scope.parameters.some(parameter => bindsName(parameter.name, identifier.text))
    )
      return undefined
    if (
      ts.isCatchClause(scope) &&
      scope.variableDeclaration !== undefined &&
      bindsName(scope.variableDeclaration.name, identifier.text)
    )
      return undefined
    if (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) {
      const initializer = scope.initializer
      if (initializer !== undefined && ts.isVariableDeclarationList(initializer)) {
        const declaration = initializer.declarations.find(item =>
          bindsName(item.name, identifier.text),
        )
        if (declaration !== undefined)
          return ts.isIdentifier(declaration.name) ? declaration.initializer : undefined
      }
    }
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (bindsName(declaration.name, identifier.text))
          return ts.isIdentifier(declaration.name) ? declaration.initializer : undefined
      }
    }
  }
  return undefined
}

/** 去掉括号与类型断言，名字换成它在本文件里的初始化表达式；查不到时返回 undefined。 */
export function localValue(
  expression: ts.Expression,
  seen = new Set<ts.Node>(),
): ts.Expression | undefined {
  if (seen.has(expression)) return undefined
  seen.add(expression)
  if (ts.isIdentifier(expression)) {
    const initializer = localInitializer(expression)
    return initializer === undefined ? undefined : localValue(initializer, seen)
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  )
    return localValue(expression.expression, seen)
  return expression
}

/** 被调用者的名字：`f(…)` 取 `f`，`a.b.f(…)` 取 `f`；其他写法返回 undefined。 */
export function callName(expression: ts.Expression): string | undefined {
  return ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : undefined
}
