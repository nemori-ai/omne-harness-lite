// 「声明文本相同」的判断：去掉注释与布局差异，参数改名不算不同。分类层与检查器比较共用它。
import ts from '@typescript/typescript6'
import type { DeclarationFile } from './api-format.ts'

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

/** 打印一个节点，参数名依次换成 `p0`、`p1`……；解构参数的模式照原样保留。 */
export function sameText(node: ts.Node): string {
  let index = 0
  const rename: ts.TransformerFactory<ts.Node> = context => {
    const visit = (child: ts.Node): ts.Node => {
      if (ts.isParameter(child) && ts.isIdentifier(child.name)) {
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
    node.getSourceFile(),
  )
  result.dispose()
  return printed
}

/**
 * 每个声明文件的比较文本，按路径。语句按语法种类与名字排序，所以声明顺序不算变化；
 * 同名的语句（重载）保持原来的先后，重载的顺序影响解析。
 */
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
  return statements.map(item => item.text).join('\n')
}

function statementKey(statement: ts.Statement): string {
  const named: ts.Node & { readonly name?: ts.Node } = statement
  const name =
    named.name !== undefined && (ts.isIdentifier(named.name) || ts.isStringLiteral(named.name))
      ? named.name.text
      : ''
  if (ts.isVariableStatement(statement))
    return `variable:${statement.declarationList.declarations.map(item => item.name.getText(statement.getSourceFile())).join(',')}`
  // 导入与无名语句按文本排，名字相同的才保持先后。
  return `${ts.SyntaxKind[statement.kind]}:${name === '' ? statement.getText(statement.getSourceFile()) : name}`
}
