import { posix } from 'node:path'
import ts from 'typescript'
import { isTestPath, type SourceFile } from '../rule.ts'
import { syntaxOf } from '../syntax.ts'
import { memberOf } from '../metrics/graph.ts'
import type { Site, Snapshot } from './model.ts'

const ROOT = '/__arch__/'
export const productSource = (path: string) =>
  /^(packages|apps)\/.+\/src\/.+\.[cm]?tsx?$/u.test(path) && !isTestPath(path)
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function exportPath(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!record(value)) return undefined
  return exportPath(value['types']) ?? exportPath(value['import']) ?? exportPath(value['default'])
}
function pathsOf(snapshot: Snapshot): Record<string, string[]> {
  const paths: Record<string, string[]> = {}
  for (const member of snapshot.members) {
    const text = snapshot.texts.get(`${member.path}/package.json`)
    if (text === undefined) continue
    const pkg: unknown = JSON.parse(text)
    if (!record(pkg) || typeof pkg['name'] !== 'string') continue
    const exports = pkg['exports']
    const entries: [string, unknown][] =
      record(exports) && Object.keys(exports).some(key => key.startsWith('.'))
        ? Object.entries(exports)
        : [['.', exports]]
    for (const [key, value] of entries) {
      const path = exportPath(value)
      if (path === undefined) continue
      const source = path
        .replace(/^\.\/dist\//u, './src/')
        .replace(/\.d\.[cm]?ts$|\.[cm]?js$/u, '.ts')
      paths[`${pkg['name']}${key === '.' ? '' : key.slice(1)}`] = [posix.join(member.path, source)]
    }
  }
  return paths
}
export interface ResolvedString {
  readonly value: string
  readonly declaration?: Site & { readonly member?: string }
}

/** Symbol resolution uses a version-local virtual filesystem. No product code or installed barrel is loaded. */
export class StaticResolver {
  readonly files: readonly SourceFile[]
  readonly program: ts.Program
  readonly checker: ts.TypeChecker
  readonly modulePath: (specifier: string, file: ts.SourceFile) => string | undefined
  readonly snapshot: Snapshot
  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot
    this.files = [...snapshot.texts]
      .filter(([path]) => productSource(path))
      .map(([path, text]) => ({ path, text }))
    const texts = new Map([...snapshot.texts].map(([path, text]) => [ROOT + path, text]))
    const syntax = new Map<string, ts.SourceFile>()
    const dirs = new Set<string>()
    for (const path of texts.keys()) {
      let dir = posix.dirname(path)
      while (dir !== '/') {
        dirs.add(dir)
        dir = posix.dirname(dir)
      }
    }
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noLib: true,
      baseUrl: ROOT,
      paths: pathsOf(snapshot),
      skipLibCheck: true,
    }
    const host: ts.CompilerHost = {
      getSourceFile: path => {
        const text = texts.get(path)
        if (text === undefined) return undefined
        let tree = syntax.get(path)
        if (tree === undefined) {
          tree = syntaxOf({ path, text })
          syntax.set(path, tree)
        }
        return tree
      },
      getDefaultLibFileName: () => '',
      writeFile: () => {
        throw new Error('Static analysis cannot emit')
      },
      getCurrentDirectory: () => ROOT,
      getDirectories: () => [],
      fileExists: path => texts.has(path),
      readFile: path => texts.get(path),
      directoryExists: path => dirs.has(path.replace(/\/$/u, '')),
      getCanonicalFileName: path => path,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    }
    this.modulePath = (specifier, file) =>
      ts
        .resolveModuleName(specifier, file.fileName, options, host)
        .resolvedModule?.resolvedFileName.slice(ROOT.length)
    this.program = ts.createProgram(
      this.files.map(file => ROOT + file.path),
      options,
      host,
    )
    this.checker = this.program.getTypeChecker()
  }
  trees(): readonly ts.SourceFile[] {
    return this.program.getSourceFiles().filter(tree => productSource(this.path(tree)))
  }
  path(node: ts.Node): string {
    return node.getSourceFile().fileName.slice(ROOT.length)
  }
  site(node: ts.Node): Site {
    return {
      path: this.path(node),
      line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
    }
  }
  symbol(node: ts.Node): ts.Symbol | undefined {
    let symbol =
      ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
        ? this.checker.getShorthandAssignmentValueSymbol(node.parent)
        : this.checker.getSymbolAtLocation(node)
    const seen = new Set<ts.Symbol>()
    while (
      symbol !== undefined &&
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 &&
      !seen.has(symbol)
    ) {
      seen.add(symbol)
      const next = this.checker.getAliasedSymbol(symbol)
      if (next === symbol || next.declarations === undefined) break
      symbol = next
    }
    return symbol
  }
  declaration(node: ts.Node): ts.Declaration | undefined {
    return this.symbol(node)?.valueDeclaration ?? this.symbol(node)?.declarations?.[0]
  }
  /** Check the lexical import before following aliases, including external unresolved symbols. */
  imported(node: ts.Node, name: string, module: string): boolean {
    const symbol = this.checker.getSymbolAtLocation(node)
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isImportSpecifier(declaration)) {
        const owner = declaration.parent.parent.parent
        if (
          ts.isImportDeclaration(owner) &&
          ts.isStringLiteral(owner.moduleSpecifier) &&
          owner.moduleSpecifier.text === module &&
          (declaration.propertyName ?? declaration.name).text === name
        )
          return true
      }
      if (ts.isNamespaceImport(declaration) && ts.isPropertyAccessExpression(node.parent)) {
        const owner = declaration.parent.parent
        if (
          ts.isImportDeclaration(owner) &&
          ts.isStringLiteral(owner.moduleSpecifier) &&
          owner.moduleSpecifier.text === module &&
          node.parent.name.text === name
        )
          return true
      }
    }
    if (ts.isPropertyAccessExpression(node)) return this.imported(node.expression, name, module)
    const resolved = this.declaration(node)
    return (
      resolved !== undefined &&
      memberOf(this.path(resolved))?.name === module.split('/').at(-1) &&
      (ts.isFunctionDeclaration(resolved) ||
        ts.isClassDeclaration(resolved) ||
        ts.isVariableDeclaration(resolved)) &&
      resolved.name !== undefined &&
      ts.isIdentifier(resolved.name) &&
      resolved.name.text === name
    )
  }
  unwrap(node: ts.Node): ts.Node {
    while (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isTypeAssertionExpression(node)
    )
      node = node.expression
    return node
  }
  value(node: ts.Node | undefined, seen = new Set<ts.Node>()): ts.Node | undefined {
    if (node === undefined) return undefined
    node = this.unwrap(node)
    if (seen.has(node)) return undefined
    seen.add(node)
    if (
      ts.isIdentifier(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const decl = this.declaration(ts.isPropertyAccessExpression(node) ? node.name : node)
      if (
        decl !== undefined &&
        (ts.isVariableDeclaration(decl) ||
          ts.isPropertyDeclaration(decl) ||
          ts.isPropertyAssignment(decl))
      ) {
        if (
          ts.isVariableDeclaration(decl) &&
          (!ts.isVariableDeclarationList(decl.parent) || !(decl.parent.flags & ts.NodeFlags.Const))
        )
          return undefined
        return this.value(decl.initializer, seen)
      }
    }
    return node
  }
  string(node: ts.Node | undefined, seen = new Set<ts.Node>()): ResolvedString | undefined {
    if (node === undefined) return undefined
    const original = this.unwrap(node)
    const value = this.value(original, seen)
    if (value === undefined) return undefined
    if (ts.isStringLiteralLike(value)) {
      const declaration =
        value === original
          ? undefined
          : { ...this.site(value), member: memberOf(this.path(value))?.path }
      return {
        value: value.text,
        ...(declaration === undefined
          ? {}
          : {
              declaration: {
                path: declaration.path,
                line: declaration.line,
                ...(declaration.member === undefined ? {} : { member: declaration.member }),
              },
            }),
      }
    }
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = this.string(value.left, seen),
        right = this.string(value.right, seen)
      if (left !== undefined && right !== undefined)
        return { value: left.value + right.value, declaration: this.site(value) }
    }
    return undefined
  }
  callable(node: ts.Node | undefined): ts.FunctionLikeDeclaration | undefined {
    if (node === undefined) return undefined
    const value = this.value(node)
    if (
      value !== undefined &&
      (ts.isArrowFunction(value) || ts.isFunctionExpression(value) || ts.isMethodDeclaration(value))
    )
      return value
    const declaration = this.declaration(node)
    return declaration !== undefined &&
      (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration))
      ? declaration
      : undefined
  }
}
