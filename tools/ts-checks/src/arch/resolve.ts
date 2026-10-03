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
  /** Read the actual module surface, including aliases and re-exports. */
  exported(
    tree: ts.SourceFile,
    name: string,
    space: 'type' | 'value' = 'type',
  ): ts.Node | undefined {
    const module = this.checker.getSymbolAtLocation(tree)
    if (module === undefined) return undefined
    const symbol = this.checker.getExportsOfModule(module).find(item => item.name === name)
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
    if (declaration === undefined) return undefined
    if (
      space === 'value' &&
      (ts.isTypeAliasDeclaration(declaration) ||
        ts.isInterfaceDeclaration(declaration) ||
        (ts.isExportSpecifier(declaration) &&
          (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly)))
    )
      return undefined
    if (
      ts.isExportSpecifier(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isFunctionDeclaration(declaration) ||
      ts.isClassDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isInterfaceDeclaration(declaration)
    )
      return declaration.name
    return undefined
  }
  moduleOrigin(
    owner: ts.ImportDeclaration | ts.ExportDeclaration,
    exported: string,
    name: string,
    module: string,
    seen: ReadonlySet<ts.Node>,
  ): boolean {
    if (owner.moduleSpecifier === undefined || !ts.isStringLiteral(owner.moduleSpecifier))
      return false
    if (owner.moduleSpecifier.text === module) return exported === name
    const path = this.modulePath(owner.moduleSpecifier.text, owner.getSourceFile())
    const tree = path === undefined ? undefined : this.program.getSourceFile(ROOT + path)
    const target = tree === undefined ? undefined : this.exported(tree, exported)
    return target !== undefined && this.imported(target, name, module, seen)
  }
  namespaceOrigin(
    node: ts.QualifiedName | ts.PropertyAccessExpression,
    name: string,
    module: string,
    seen: ReadonlySet<ts.Node>,
  ): boolean {
    const base = ts.isQualifiedName(node) ? node.left : node.expression
    const exported = ts.isQualifiedName(node) ? node.right.text : node.name.text
    const symbol = this.checker.getSymbolAtLocation(base)
    return (
      symbol?.declarations?.some(
        declaration =>
          ts.isNamespaceImport(declaration) &&
          ts.isImportDeclaration(declaration.parent.parent) &&
          this.moduleOrigin(declaration.parent.parent, exported, name, module, seen),
      ) ?? false
    )
  }
  /** Follow lexical imports/exports before external unresolved aliases lose their source. */
  imported(
    node: ts.Node,
    name: string,
    module: string,
    seen: ReadonlySet<ts.Node> = new Set(),
  ): boolean {
    if (seen.has(node)) return false
    const path = new Set([...seen, node])
    if (
      (ts.isQualifiedName(node) || ts.isPropertyAccessExpression(node)) &&
      this.namespaceOrigin(node, name, module, path)
    )
      return true
    const symbol = this.checker.getSymbolAtLocation(node)
    for (const declaration of symbol?.declarations ?? []) {
      if (
        ts.isImportSpecifier(declaration) &&
        ts.isImportDeclaration(declaration.parent.parent.parent) &&
        this.moduleOrigin(
          declaration.parent.parent.parent,
          (declaration.propertyName ?? declaration.name).text,
          name,
          module,
          path,
        )
      )
        return true
      if (
        ts.isExportSpecifier(declaration) &&
        this.moduleOrigin(
          declaration.parent.parent,
          (declaration.propertyName ?? declaration.name).text,
          name,
          module,
          path,
        )
      )
        return true
    }
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
  typeImported(
    node: ts.TypeNode | undefined,
    name: string,
    module: string,
    seen: ReadonlySet<ts.Node> = new Set(),
  ): boolean {
    if (node === undefined || seen.has(node)) return false
    const path = new Set([...seen, node])
    if (ts.isParenthesizedTypeNode(node)) return this.typeImported(node.type, name, module, path)
    if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node))
      return node.types.some(type => this.typeImported(type, name, module, path))
    if (!ts.isTypeReferenceNode(node)) return false
    if (this.imported(node.typeName, name, module)) return true
    const declaration = this.declaration(node.typeName)
    return (
      declaration !== undefined &&
      ts.isTypeAliasDeclaration(declaration) &&
      this.typeImported(declaration.type, name, module, path)
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
      const left = this.string(value.left, new Set(seen)),
        right = this.string(value.right, new Set(seen))
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
