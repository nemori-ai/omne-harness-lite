import ts from '@typescript/typescript6'
import type { SourceFile } from './rule.ts'

const cache = new WeakMap<SourceFile, ts.SourceFile>()

export function syntaxOf(file: SourceFile): ts.SourceFile {
  let syntax = cache.get(file)
  if (syntax === undefined) {
    syntax = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
    cache.set(file, syntax)
  }
  return syntax
}

export function visitSyntax(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, child => visitSyntax(child, visit))
}

export function nodeName(node: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (node === undefined) return undefined
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
}

export function hasTag(node: ts.Node, tag: string): boolean {
  return ts.getJSDocTags(node).some(t => t.tagName.text === tag)
}

export interface SyntaxImport {
  readonly specifier: string | undefined
  readonly index: number
}

export function syntaxImports(syntax: ts.SourceFile): SyntaxImport[] {
  const refs: SyntaxImport[] = []
  const add = (expression: ts.Node | undefined, node: ts.Node) => {
    refs.push({
      specifier:
        expression !== undefined && ts.isStringLiteralLike(expression)
          ? expression.text
          : undefined,
      index: node.getStart(syntax),
    })
  }
  visitSyntax(syntax, node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) add(node.moduleSpecifier, node)
    } else if (ts.isExternalModuleReference(node)) add(node.expression, node)
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal, node)
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      add(node.arguments[0], node)
  })
  return refs
}
