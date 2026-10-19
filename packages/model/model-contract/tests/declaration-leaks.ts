// Finds names that a built declaration file uses in the signature of a published name but does not
// export. A consumer sees such a name in the signature and cannot import it, so the signature shows
// a type that the public face does not name. The check reads one `.d.ts` file at a time, so it
// finds the local aliases and interfaces of that file. A name that the file exports but the entry
// leaves out is a different question and not decided here.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import ts from '@typescript/typescript6'

type Declared =
  | ts.TypeAliasDeclaration
  | ts.InterfaceDeclaration
  | ts.ClassDeclaration
  | ts.EnumDeclaration

/** The names of the published declarations to check, or every exported declaration of the file. */
export type Published = readonly string[] | 'all'

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some(item => item.kind === ts.SyntaxKind.ExportKeyword)
    : false
}

function isTypeDeclaration(node: ts.Statement): node is Declared {
  return (
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node)
  )
}

/** The names a statement refers to in type positions: references and heritage clauses. */
function referencedNames(node: ts.Node, found: Set<string>): void {
  if (ts.isTypeReferenceNode(node)) {
    let left: ts.EntityName = node.typeName
    while (ts.isQualifiedName(left)) left = left.left
    found.add(left.text)
  }
  if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression))
    found.add(node.expression.text)
  ts.forEachChild(node, child => referencedNames(child, found))
}

function declaredName(statement: ts.Statement): string | undefined {
  if (isTypeDeclaration(statement)) return statement.name?.text
  if (ts.isFunctionDeclaration(statement)) return statement.name?.text
  return undefined
}

/** The local type names of a declaration file that the signatures of the published names use. Sorted. */
export function localNamesInPublishedSignatures(
  path: string,
  text: string,
  published: Published,
): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true)
  const local = new Set<string>()
  for (const statement of file.statements)
    if (isTypeDeclaration(statement) && !isExported(statement) && statement.name !== undefined)
      local.add(statement.name.text)
  const used = new Set<string>()
  for (const statement of file.statements) {
    if (!isExported(statement)) continue
    const name = declaredName(statement)
    if (published === 'all' || (name !== undefined && published.includes(name)))
      referencedNames(statement, used)
  }
  return [...local].filter(name => used.has(name)).sort()
}

export type Leak = Readonly<{ file: string; name: string }>

/**
 * Follows the `export ... from` lines of an entry declaration file one level, and checks the
 * declaration file behind each of them for the names that the entry publishes from it.
 */
export function leaksOfEntry(entryPath: string): Leak[] {
  const entry = ts.createSourceFile(
    entryPath,
    readFileSync(entryPath, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
  )
  const published = new Map<string, string[] | 'all'>()
  for (const statement of entry.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const target = resolve(
      dirname(entryPath),
      statement.moduleSpecifier.text.replace(/\.ts$/, '.d.ts'),
    )
    const clause = statement.exportClause
    if (clause === undefined || !ts.isNamedExports(clause)) {
      published.set(target, 'all')
      continue
    }
    const known = published.get(target)
    if (known === 'all') continue
    published.set(target, [
      ...(known ?? []),
      ...clause.elements.map(item => (item.propertyName ?? item.name).text),
    ])
  }
  return [...published].flatMap(([target, names]) =>
    !existsSync(target)
      ? [{ file: target, name: '(declaration file missing)' }]
      : localNamesInPublishedSignatures(target, readFileSync(target, 'utf8'), names).map(name => ({
          file: target,
          name,
        })),
  )
}
