import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

interface ModuleReference {
  readonly specifier: string
  readonly requireCall?: ts.CallExpression
}

function moduleReferences(text: string) {
  const source = ts.createSourceFile('surface.ts', text, ts.ScriptTarget.Latest, true)
  const values: ModuleReference[] = []
  const add = (value: ts.Node, requireCall?: ts.CallExpression) => {
    if (ts.isStringLiteralLike(value))
      values.push({ specifier: value.text, ...(requireCall === undefined ? {} : { requireCall }) })
    else throw new Error('dependency surface contains a computed module specifier')
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) add(node.moduleSpecifier)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0]
      if (argument === undefined)
        throw new Error('dependency surface contains a missing module specifier')
      add(argument, node.expression.kind === ts.SyntaxKind.ImportKeyword ? undefined : node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { source, values }
}

/** 只用于受控入口图核对，不是全语言模块解析器或租户隔离检查器。 */
export function moduleSpecifiers(text: string): readonly string[] {
  return [...new Set(moduleReferences(text).values.map(value => value.specifier))].sort()
}

function importMetaUrl(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'url' &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta'
  )
}

/** Bind local identifiers without loading dependencies, libraries or ambient types. */
function localChecker(source: ts.SourceFile): ts.TypeChecker {
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] }
  const host = ts.createCompilerHost(options)
  host.getSourceFile = name => (name === source.fileName ? source : undefined)
  host.readFile = () => undefined
  host.fileExists = name => name === source.fileName
  return ts.createProgram([source.fileName], options, host).getTypeChecker()
}

function importsCreateRequire(checker: ts.TypeChecker, expression: ts.Expression): boolean {
  const declaration = checker.getSymbolAtLocation(expression)?.declarations?.[0]
  if (
    declaration === undefined ||
    !ts.isImportSpecifier(declaration) ||
    (declaration.propertyName ?? declaration.name).text !== 'createRequire'
  )
    return false
  const statement = declaration.parent.parent.parent
  return (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteralLike(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === 'node:module'
  )
}

function writesNativeRequire(source: ts.SourceFile, checker: ts.TypeChecker): boolean {
  const targetsRequire = (node: ts.Node): boolean => {
    // A property write does not replace the require binding.
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return false
    if (ts.isIdentifier(node))
      return node.text === 'require' && checker.getSymbolAtLocation(node) === undefined
    if (ts.isShorthandPropertyAssignment(node))
      return (
        node.name.text === 'require' &&
        checker.getShorthandAssignmentValueSymbol(node) === undefined
      )
    if (ts.isPropertyAssignment(node)) return targetsRequire(node.initializer)
    return ts.forEachChild(node, targetsRequire) ?? false
  }
  const visit = (node: ts.Node): boolean => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      targetsRequire(node.left)
    )
      return true
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      targetsRequire(node.operand)
    )
      return true
    if (
      (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      targetsRequire(node.initializer)
    )
      return true
    return ts.forEachChild(node, visit) ?? false
  }
  return visit(source)
}

/** Resolve the lexical binding; unknown origins are errors, not source-relative fallbacks. */
function requireOrigin(checker: ts.TypeChecker, call: ts.CallExpression, file: string): string {
  const symbol = checker.getSymbolAtLocation(call.expression)
  if (symbol === undefined) {
    if (writesNativeRequire(call.getSourceFile(), checker))
      throw new Error('dependency surface contains a reassigned native require binding')
    return file // The native CommonJS require binding.
  }
  const declaration = symbol.valueDeclaration
  const factory =
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      ? declaration.initializer
      : undefined
  if (
    factory === undefined ||
    !ts.isCallExpression(factory) ||
    !importsCreateRequire(checker, factory.expression) ||
    factory.arguments.length !== 1
  )
    throw new Error('dependency surface contains an unsupported require binding')
  const base = factory.arguments[0]
  if (importMetaUrl(base)) return file
  if (
    base !== undefined &&
    ts.isNewExpression(base) &&
    ts.isIdentifier(base.expression) &&
    base.expression.text === 'URL' &&
    checker.getSymbolAtLocation(base.expression) === undefined &&
    base.arguments?.length === 2 &&
    base.arguments[0] !== undefined &&
    ts.isStringLiteralLike(base.arguments[0]) &&
    importMetaUrl(base.arguments[1])
  )
    return fileURLToPath(new URL(base.arguments[0].text, pathToFileURL(file)))
  throw new Error('dependency surface contains an unsupported createRequire origin')
}

export async function dependencySurface(entry: string, declaration = false) {
  const seen = new Set<string>()
  const external = new Set<string>()
  const files: { file: string; sha256: string }[] = []
  const pending = [entry]
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)
    const bytes = await readFile(file)
    files.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') })
    const { source, values } = moduleReferences(bytes.toString('utf8'))
    const checker = values.some(
      value => value.requireCall !== undefined && value.specifier.startsWith('.'),
    )
      ? localChecker(source)
      : undefined
    for (const { specifier, requireCall } of values) {
      if (!specifier.startsWith('.')) external.add(specifier)
      else {
        let resolved: string
        if (requireCall === undefined) resolved = resolve(dirname(file), specifier)
        else {
          if (checker === undefined) throw new Error('dependency surface has no local binder')
          resolved = createRequire(requireOrigin(checker, requireCall, file)).resolve(specifier)
        }
        pending.push(declaration ? resolved.replace(/\.(?:js|ts)$/, '.d.ts') : resolved)
      }
    }
  }
  return {
    external: [...external].sort(),
    files: files.sort((a, b) => a.file.localeCompare(b.file)),
  }
}
