import ts from '@typescript/typescript6'
import type { DeclarationFile } from './api-format.ts'

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

function isRenamableParameter(
  node: ts.Node,
): node is ts.ParameterDeclaration & { name: ts.Identifier } {
  return ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text !== 'this'
}

export function sameText(node: ts.Node, sourceFile = node.getSourceFile()): string {
  let index = 0
  const rename: ts.TransformerFactory<ts.Node> = context => {
    const visit = (child: ts.Node): ts.Node => {
      if (isRenamableParameter(child)) {
        const name = ts.factory.createIdentifier(`p${index++}`)
        const renamed = ts.factory.updateParameterDeclaration(
          child,
          child.modifiers,
          child.dotDotDotToken,
          name,
          child.questionToken,
          child.type,
          child.initializer,
        )
        return ts.visitEachChild(renamed, visit, context)
      }
      return ts.visitEachChild(child, visit, context)
    }
    return visit
  }
  const result = ts.transform(node, [rename])
  const printed = printer.printNode(
    ts.EmitHint.Unspecified,
    result.transformed[0] ?? node,
    sourceFile,
  )
  result.dispose()
  return printed
}

export function normalizedFiles(files: readonly DeclarationFile[]): Map<string, string> {
  return new Map(files.map(file => [file.path, normalizedFile(file)]))
}

function normalizedFile(file: DeclarationFile): string {
  const source = ts.createSourceFile(file.path, file.code, ts.ScriptTarget.Latest, true)
  const statements = source.statements.map((statement, index) => ({
    key: statementKey(statement),
    index,
    text: sameText(statement),
  }))
  statements.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index))
  return [...referenceDirectives(source), ...statements.map(item => item.text)].join('\n')
}

export function referenceDirectives(source: ts.SourceFile): string[] {
  const directive = (attribute: string, item: ts.FileReference) =>
    `/// <reference ${attribute}="${item.fileName}"${item.resolutionMode === undefined ? '' : ` resolution-mode="${resolutionMode(item.resolutionMode)}"`} />`
  return [
    ...source.referencedFiles.map(item => directive('path', item)),
    ...source.typeReferenceDirectives.map(item => directive('types', item)),
    ...source.libReferenceDirectives.map(item => directive('lib', item)),
  ]
}

function resolutionMode(mode: ts.ResolutionMode): string {
  return mode === ts.ModuleKind.ESNext ? 'import' : 'require'
}

export function statementKey(statement: ts.Node): string {
  const named: ts.Node & { readonly name?: ts.Node } = statement
  const name =
    named.name !== undefined && (ts.isIdentifier(named.name) || ts.isStringLiteral(named.name))
      ? named.name.text
      : ''
  if (ts.isVariableStatement(statement))
    return `variable:${statement.declarationList.declarations.map(item => item.name.getText(statement.getSourceFile())).join(',')}`
  return `${ts.SyntaxKind[statement.kind]}:${name === '' ? statement.getText(statement.getSourceFile()) : name}`
}

export function statementId(path: string, statement: ts.Node): string {
  return `${path}\u0000${statementKey(statement)}`
}
