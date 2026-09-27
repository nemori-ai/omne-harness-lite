import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

/** 只用于受控入口图核对，不是全语言模块解析器或租户隔离检查器。 */
export function moduleSpecifiers(text: string): readonly string[] {
  const source = ts.createSourceFile('surface.ts', text, ts.ScriptTarget.Latest, true)
  const values = new Set<string>()
  const add = (value: ts.Node) => {
    if (ts.isStringLiteralLike(value)) values.add(value.text)
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
      add(argument)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...values].sort()
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
    for (const specifier of moduleSpecifiers(bytes.toString('utf8'))) {
      if (!specifier.startsWith('.')) external.add(specifier)
      else {
        const resolved = resolve(dirname(file), specifier)
        pending.push(declaration ? resolved.replace(/\.(?:js|ts)$/, '.d.ts') : resolved)
      }
    }
  }
  return {
    external: [...external].sort(),
    files: files.sort((a, b) => a.file.localeCompare(b.file)),
  }
}
