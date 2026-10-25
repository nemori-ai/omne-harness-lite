// 「声明文本相同」的判断：去掉注释与布局差异，参数改名不算不同。分类层、白名单门与检查器比较共用它。
// 这里的归一化只能抹掉不改变类型的差异：`this` 参数不改名（它决定 this 类型，不是普通参数），
// 解构参数照原样保留，同名语句（重载）保持先后。
import ts from '@typescript/typescript6'
import type { DeclarationFile } from './api-format.ts'

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

function isRenamableParameter(
  node: ts.Node,
): node is ts.ParameterDeclaration & { name: ts.Identifier } {
  return ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text !== 'this'
}

/** 打印一个节点，参数名依次换成 `p0`、`p1`……；`this` 参数与解构参数的模式照原样保留。 */
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

/**
 * 每个声明文件的比较文本，按路径。三斜线指令先于语句、保持原顺序；语句按语法种类与名字排序，
 * 所以声明顺序不算变化；同名的语句（重载）保持原来的先后，重载的顺序影响解析。
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
  return [...referenceDirectives(source), ...statements.map(item => item.text)].join('\n')
}

/**
 * 文件开头的三斜线指令（`path`、`types`、`lib`），按原顺序。它们不是语句，打印器照原样输出；
 * 它们改变消费者程序里有哪些声明，所以比较文本与白名单门都要看它们。
 * `no-default-lib` 不在其中：TypeScript 6 只在 lib 文件里认它，快照的打印器也不输出它。
 */
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

/** 顶层语句的键：语法种类加名字。同键的语句是一组（重载、同名的扩充块）。 */
export function statementKey(statement: ts.Node): string {
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

/** 一条顶层语句在成员里的位置：声明文件路径加语句键。白名单门与检查器的可达分析用它对齐。 */
export function statementId(path: string, statement: ts.Node): string {
  return `${path}\u0000${statementKey(statement)}`
}
