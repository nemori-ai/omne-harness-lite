// The source rule that keeps the legal providers of the self-proof at the port boundary. A legal
// provider lives in a `*-legal.ts` file (or is the generated provider) and never names a control
// of a double, in any spelling: a property read, an optional call, a destructuring, a string
// index or a string that holds the name. A spec registers legal providers only by reference to
// such a file: a row of a table given to `itPassesLegal` or `itNeedsTheHandle` holds no provider
// code of its own. The rule reads the syntax tree, not the variable names. The tool contract
// package keeps the same file for its own suites, because tests cannot import across packages.
import ts from '@typescript/typescript6'

/** The controls with which a double is made to behave in a way that its port never shows. */
export const DOUBLE_CONTROLS = [
  'controls',
  'hold',
  'holdStop',
  'excludeDeferred',
  'rejectNext',
  'failNext',
  'dropNextAnswer',
  'blindInspection',
] as const

/** The module of a legal provider, as an import specifier of a spec names it. */
const LEGAL_MODULE = /(?:-legal|\/generated-provider)\.ts$/u

/**
 * The values that a legal file may import from a test module that is not legal: values and
 * timing helpers that reach no double. Every other value of a test module could carry a control.
 */
const ALLOWED_TEST_IMPORTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['./tool-values.ts', new Set(['evidence'])],
  ['./conformance-harness.ts', new Set(['turns', 'keep', 'later'])],
])

/** The members of a table row that hold a provider. `spy` only wraps a handle of the provider. */
const PROVIDER_KEYS = new Set(['fixture', 'withHandle', 'without'])

/** The harness calls whose second argument is a table, or a row, of legal providers. */
const LEGAL_CALLS = new Set(['itPassesLegal', 'itNeedsTheHandle'])

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function where(file: ts.SourceFile, node: ts.Node): string {
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
  return `${file.fileName}:${line + 1}`
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  node.forEachChild(child => walk(child, visit))
}

/** The text of a name that a property, an element or a binding names, or null for a computed one. */
function nameText(name: ts.Node | undefined): string | null {
  if (name === undefined) return null
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

/**
 * The values that a legal file imports from a test module that is neither legal nor allowed: a
 * helper of such a module could reach a control of a double out of sight of this rule. A type
 * import, and an import of a package entry, are not test modules.
 */
function testModuleImports(file: ts.SourceFile): string[] {
  const found: string[] = []
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const from = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (!from.startsWith('.') || LEGAL_MODULE.test(from) || clause === undefined) continue
    if (clause.isTypeOnly) continue
    const allowed = ALLOWED_TEST_IMPORTS.get(from) ?? new Set<string>()
    const bindings = clause.namedBindings
    const names =
      bindings !== undefined && ts.isNamedImports(bindings)
        ? bindings.elements.filter(element => !element.isTypeOnly).map(element => element.name.text)
        : []
    if (clause.name !== undefined || (bindings !== undefined && ts.isNamespaceImport(bindings)))
      names.push('*')
    for (const name of names)
      if (!allowed.has(name))
        found.push(`${where(file, statement)} imports ${name} from the test module ${from}`)
  }
  return found
}

/**
 * Every place where `text` names one of `controls`: a property read (`.hold`, `?.hold`), an
 * element read (`['hold']`), a destructuring (`const { hold } = …`, `{ hold: h }`), or any other
 * string that holds the name (`const k = 'hold'`). A property that an object literal defines
 * (`hold: () => undefined`, `{ excludeDeferred }`) is a handle of the provider itself and is
 * allowed. A value imported from a test module that is not legal is reported too, unless the list
 * of allowed imports names it.
 */
export function controlReads(
  fileName: string,
  text: string,
  controls: readonly string[] = DOUBLE_CONTROLS,
): string[] {
  const file = parse(fileName, text)
  const named = new Set(controls)
  const found: string[] = testModuleImports(file)
  walk(file, node => {
    if (ts.isPropertyAccessExpression(node) && named.has(node.name.text))
      found.push(`${where(file, node)} reads .${node.name.text}`)
    else if (ts.isElementAccessExpression(node)) {
      const key = nameText(node.argumentExpression)
      if (key !== null && named.has(key)) found.push(`${where(file, node)} reads ['${key}']`)
    } else if (ts.isBindingElement(node)) {
      const key = nameText(node.propertyName ?? node.name)
      if (key !== null && named.has(key)) found.push(`${where(file, node)} destructures ${key}`)
    } else if (
      ts.isStringLiteralLike(node) &&
      named.has(node.text) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isElementAccessExpression(node.parent)
    )
      found.push(`${where(file, node)} names '${node.text}' in a string`)
  })
  return found
}

type Scope = Readonly<{
  /** The names that a spec imports from a legal module. */
  legal: ReadonlySet<string>
  /** The top-level constants and functions of the spec, by name. */
  local: ReadonlyMap<string, ts.Node>
}>

function scopeOf(file: ts.SourceFile): Scope {
  const legal = new Set<string>()
  const local = new Map<string, ts.Node>()
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = statement.moduleSpecifier
      const clause = statement.importClause
      if (!ts.isStringLiteral(from) || !LEGAL_MODULE.test(from.text) || clause === undefined)
        continue
      if (clause.name !== undefined) legal.add(clause.name.text)
      const bindings = clause.namedBindings
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) legal.add(bindings.name.text)
      if (bindings !== undefined && ts.isNamedImports(bindings))
        for (const element of bindings.elements) legal.add(element.name.text)
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name))
          local.set(declaration.name.text, declaration.initializer ?? declaration)
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined)
      local.set(statement.name.text, statement)
  }
  return { legal, local }
}

/** The identifier that a call chain starts from: `make` of `make(a).map(f)`, or null. */
function rootOf(expression: ts.Expression): ts.Identifier | null {
  if (ts.isIdentifier(expression)) return expression
  if (ts.isPropertyAccessExpression(expression) || ts.isParenthesizedExpression(expression))
    return rootOf(expression.expression)
  if (ts.isCallExpression(expression)) return rootOf(expression.expression)
  return null
}

const isFunctionLike = (node: ts.Node): boolean =>
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isClassExpression(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node)

/** The names that the parameters of a function bind, destructured ones included. */
function parameterNames(fn: ts.SignatureDeclarationBase): string[] {
  const names: string[] = []
  const collect = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.push(name.text)
    else
      for (const element of name.elements)
        if (!ts.isOmittedExpression(element)) collect(element.name)
  }
  for (const parameter of fn.parameters) collect(parameter.name)
  return names
}

/**
 * Checks the provider rows of one table node of a spec. `table` bounds the walk up from a row to
 * the callbacks that enclose it.
 */
function tableViolations(file: ts.SourceFile, scope: Scope, table: ts.Node): string[] {
  const found: string[] = []
  const seen = new Set<ts.Node>()

  /** The parameters of the callbacks between `node` and `table`, and those of a legal `.map`. */
  const enclosing = (node: ts.Node): Readonly<{ any: Set<string>; legal: Set<string> }> => {
    const any = new Set<string>()
    const legal = new Set<string>()
    for (let at = node.parent; at !== undefined && at !== table.parent; at = at.parent) {
      if (!ts.isArrowFunction(at) && !ts.isFunctionExpression(at)) continue
      const names = parameterNames(at)
      for (const name of names) any.add(name)
      const call = at.parent
      if (
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        isLegalValue(call.expression.expression, new Set(), legal)
      )
        for (const name of names) legal.add(name)
    }
    return { any, legal }
  }

  /** An argument of a legal builder: no function of its own, and no provider code of the spec. */
  function isPlainArgument(argument: ts.Node, params: ReadonlySet<string>): boolean {
    let plain = true
    walk(argument, node => {
      if (isFunctionLike(node)) plain = false
      if (!ts.isIdentifier(node) || scope.legal.has(node.text) || params.has(node.text)) return
      const parent = node.parent
      const isName =
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node)
      if (!isName && scope.local.has(node.text)) plain = false
    })
    return plain
  }

  /** A provider expression that comes from a legal module. */
  function isLegalValue(
    expression: ts.Expression,
    anyParams: ReadonlySet<string>,
    legalParams: ReadonlySet<string>,
  ): boolean {
    if (ts.isParenthesizedExpression(expression))
      return isLegalValue(expression.expression, anyParams, legalParams)
    if (ts.isIdentifier(expression))
      return scope.legal.has(expression.text) || legalParams.has(expression.text)
    if (ts.isPropertyAccessExpression(expression))
      return isLegalValue(expression.expression, anyParams, legalParams)
    if (ts.isCallExpression(expression))
      return (
        isLegalValue(expression.expression, anyParams, legalParams) &&
        expression.arguments.every(argument => isPlainArgument(argument, anyParams))
      )
    return false
  }

  /**
   * A table, a row or a spread table that a call gives: the call must start from a legal module
   * (or from the row of a legal `.map`), or the rows that it returns are out of sight of this rule.
   */
  function checkCall(call: ts.CallExpression): void {
    const root = rootOf(call)
    if (root === null || scope.legal.has(root.text) || enclosing(call).legal.has(root.text)) return
    found.push(`${where(file, call)} takes legal rows from ${root.text}, which is no legal module`)
  }

  function check(node: ts.Node): void {
    if (seen.has(node)) return
    seen.add(node)
    if (ts.isCallExpression(node)) checkCall(node)
    walk(node, child => {
      if (ts.isPropertyAssignment(child) || ts.isShorthandPropertyAssignment(child)) {
        const key = nameText(child.name)
        if (key === null || !PROVIDER_KEYS.has(key)) return
        const value = ts.isPropertyAssignment(child) ? child.initializer : child.name
        const params = enclosing(child)
        if (!isLegalValue(value, params.any, params.legal))
          found.push(`${where(file, child)} builds the provider of a legal row in the spec`)
      } else if (ts.isArrayLiteralExpression(child)) {
        // A row or a spread table that the spec declares elsewhere is checked where it is declared.
        for (const element of child.elements) {
          const target = ts.isSpreadElement(element) ? element.expression : element
          if (ts.isCallExpression(target)) checkCall(target)
          if (!ts.isIdentifier(target) || scope.legal.has(target.text)) continue
          const declared = scope.local.get(target.text)
          if (declared !== undefined) check(declared)
        }
      }
    })
  }

  check(table)
  return found
}

/**
 * Every legal row of a spec whose provider is not taken from a legal module: a function written
 * in the row, a call of a builder of the spec, or a builder of a legal module given a function of
 * the spec.
 */
export function inlineLegalProviders(fileName: string, text: string): string[] {
  const file = parse(fileName, text)
  const scope = scopeOf(file)
  const found: string[] = []
  walk(file, node => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return
    if (!LEGAL_CALLS.has(node.expression.text)) return
    const table = node.arguments[1]
    if (table === undefined) return
    if (ts.isIdentifier(table)) {
      if (scope.legal.has(table.text)) return
      const declared = scope.local.get(table.text)
      if (declared === undefined) {
        found.push(`${where(file, table)} takes a legal table that is no constant of the spec`)
        return
      }
      found.push(...tableViolations(file, scope, declared))
      return
    }
    found.push(...tableViolations(file, scope, table))
  })
  return found
}
