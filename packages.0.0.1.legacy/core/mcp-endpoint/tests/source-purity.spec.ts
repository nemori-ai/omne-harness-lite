import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

function source(text: string): ts.SourceFile {
  return ts.createSourceFile(
    'declarations.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}
function violations(file: ts.SourceFile): string[] {
  const errors: string[] = []
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly !== true)
      errors.push('runtime import')
    if (
      ts.isIdentifier(node) &&
      ['Date', 'process', 'globalThis', 'fetch', 'setTimeout', 'setInterval', 'require'].includes(
        node.text,
      )
    )
      errors.push(`runtime read ${node.text}`)
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(file) === 'item' &&
      ts.isStringLiteral(node.initializer) &&
      ['disabled', 'usableBy', 'use', 'execute'].includes(node.initializer.text)
    )
      errors.push('reserved declaration')
    ts.forEachChild(node, visit)
  }
  visit(file)
  return errors
}
const actual = source(readFileSync(new URL('../src/declarations.ts', import.meta.url), 'utf8'))
describe('SC2 / SC4 maintained declaration source', () => {
  it('limits imports to types and excludes runtime state or reserved producers', () => {
    expect(violations(actual)).toEqual([])
  })
  it('has exactly one literal prefix producer with the unmodified remote-name operand', () => {
    const prefixes: ts.StringLiteral[] = []
    let helper: ts.FunctionDeclaration | undefined
    function visit(node: ts.Node): void {
      if (ts.isStringLiteral(node) && node.text === 'execute:') prefixes.push(node)
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'executeItem') helper = node
      ts.forEachChild(node, visit)
    }
    visit(actual)
    expect(prefixes).toHaveLength(1)
    if (helper?.body === undefined) throw new Error('missing executeItem producer')
    const returned = helper.body.statements[0]
    if (
      returned === undefined ||
      !ts.isReturnStatement(returned) ||
      returned.expression === undefined ||
      !ts.isBinaryExpression(returned.expression)
    )
      throw new Error('nonliteral action-key producer')
    expect(returned.expression.operatorToken.kind).toBe(ts.SyntaxKind.PlusToken)
    const left = returned.expression.left
    const right = returned.expression.right
    expect(ts.isStringLiteral(left) && left.text === 'execute:').toBe(true)
    expect(ts.isIdentifier(right) && right.text === 'remoteName').toBe(true)
  })
  it('fails when an effect import, implicit runtime input, or reserved producer appears', () => {
    expect(violations(source("import { readFile } from 'node:fs';"))).toContain('runtime import')
    expect(violations(source('const now = Date.now(); const environment = process.env;'))).toEqual([
      'runtime read Date',
      'runtime read process',
    ])
    expect(violations(source("const result = { item: 'disabled' };"))).toContain(
      'reserved declaration',
    )
  })
})
