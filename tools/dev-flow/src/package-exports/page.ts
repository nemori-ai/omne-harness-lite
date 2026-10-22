// Reads the public-api page and the source files that its chapters link, never the declarations of
// the page: the page is an index, and the source is the only declaration.
import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import ts from '@typescript/typescript6'
import type { Inventory } from './inventory.ts'

/**
 * Names that one TypeScript source declares for its module: exported declarations, and
 * `export { local as name }` that introduces a new name. A plain re-export (`export { a } from
 * './b'`) only forwards a name, so it does not declare it. `declare module` bodies do not count.
 */
export function declaredNames(source: string): string[] {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.ESNext, true)
  const names: string[] = []
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause))
        for (const element of statement.exportClause.elements) {
          const renamed = element.propertyName !== undefined
          if (statement.moduleSpecifier === undefined || renamed) names.push(element.name.text)
        }
      continue
    }
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false
    if (!exported) continue
    if (ts.isVariableStatement(statement))
      names.push(...statement.declarationList.declarations.map(item => item.name.getText(file)))
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined &&
      ts.isIdentifier(statement.name)
    )
      names.push(statement.name.text)
  }
  return names
}

/**
 * Names that a code block declares at its top level, exported or not: `type`, `interface`,
 * `class`, `function`, `enum`, `const`, `let`, `var` and `declare` forms, plus the names that an
 * export statement introduces. A block that declares an inventory name is a second copy of a
 * source declaration, with or without `export`.
 */
export function blockDeclaredNames(source: string): string[] {
  const file = ts.createSourceFile('block.ts', source, ts.ScriptTarget.ESNext, true)
  const names = new Set(declaredNames(source))
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement))
      for (const item of statement.declarationList.declarations) names.add(item.name.getText(file))
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name !== undefined &&
      ts.isIdentifier(statement.name)
    )
      names.add(statement.name.text)
  }
  return [...names]
}

const TYPESCRIPT_FENCES: ReadonlySet<string> = new Set(['ts', 'typescript', 'tsx', 'mts', 'cts'])

/** A fence line: optional indent (a fence inside a list item is indented), three or more of one fence character, then the info string. */
const FENCE_LINE = /^(?<indent>\s*)(?<marks>`{3,}|~{3,})(?<info>.*)$/u

type OpenFence = Readonly<{ indent: number; marks: string; ts: boolean; lines: string[] }>

function openFence(line: string): OpenFence | undefined {
  const match = FENCE_LINE.exec(line)?.groups
  if (match === undefined) return undefined
  const label = match['info']?.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  return {
    indent: match['indent']?.length ?? 0,
    marks: match['marks'] ?? '',
    ts: TYPESCRIPT_FENCES.has(label),
    lines: [],
  }
}

/** Whether the line closes the fence: the same character, at least as many, and nothing else after them. */
function closesFence(line: string, fence: OpenFence): boolean {
  const match = FENCE_LINE.exec(line)?.groups
  const marks = match?.['marks'] ?? ''
  return (
    match !== undefined && marks.startsWith(fence.marks) && (match['info']?.trim() ?? '') === ''
  )
}

/** The line without the indent of the fence that holds it, so that a block in a list item parses as written. */
function dedented(line: string, fence: OpenFence): string {
  const indent = line.length - line.trimStart().length
  return line.slice(Math.min(indent, fence.indent))
}

export type PageChapter = Readonly<{
  /** Link targets as written, without anchor. Links with a URL scheme are left out. */
  links: readonly string[]
  /** Names that TypeScript code blocks of the chapter declare, exported or not. */
  blockNames: readonly string[]
}>

/** The chapters (`## ` and `### ` headings) of a public-api page, with the file links and the `ts` block declarations of each. */
export function publicApiChapters(markdown: string): Map<string, PageChapter> {
  const chapters = new Map<string, { links: string[]; blockNames: string[] }>()
  let title = ''
  let fence: OpenFence | undefined
  const current = () => {
    const found = chapters.get(title) ?? { links: [], blockNames: [] }
    chapters.set(title, found)
    return found
  }
  for (const line of markdown.split('\n')) {
    if (fence !== undefined) {
      if (!closesFence(line, fence)) fence.lines.push(dedented(line, fence))
      else {
        if (fence.ts) current().blockNames.push(...blockDeclaredNames(fence.lines.join('\n')))
        fence = undefined
      }
      continue
    }
    const opened = openFence(line)
    const heading = /^#{2,3} (?<title>.+)$/u.exec(line)?.groups?.['title']
    if (opened !== undefined) fence = opened
    else if (heading !== undefined) {
      title = heading.trim()
      current()
    } else
      for (const match of line.matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/gu)) {
        const target = match[1] ?? ''
        if (!/^[a-z][a-z0-9+.-]*:/iu.test(target)) current().links.push(target)
      }
  }
  return chapters
}

/**
 * Differences between the chapters of the public-api page and the inventory. The page does not
 * repeat declarations: each chapter that the inventory lists points to the source files that
 * declare its names. A problem is reported when a listed chapter is missing, links no source file,
 * links no file that declares one of its names, when a linked source or test file does not exist,
 * or when a TypeScript code block of any chapter declares a name that the inventory lists. A name
 * that only re-exports another entry or package (`sameAs`) is declared there, not in a linked file.
 */
export function navigationProblems(
  inventory: Inventory,
  chapters: ReadonlyMap<string, PageChapter>,
  packageDirectory: string,
  pageDirectory: string,
): string[] {
  const listed = new Map<string, Set<string>>()
  const inventoryNames = new Set<string>()
  for (const entry of Object.values(inventory.entries))
    for (const chapter of entry.chapters) {
      const names = listed.get(chapter.title) ?? new Set<string>()
      for (const item of chapter.names) {
        inventoryNames.add(item.name)
        if (item.sameAs === undefined) names.add(item.name)
      }
      listed.set(chapter.title, names)
    }
  const inPackage = (path: string, folder: 'src' | 'tests') =>
    path.startsWith(`${resolve(packageDirectory, folder)}${sep}`) && path.endsWith('.ts')
  const problems: string[] = []
  for (const [title, chapter] of chapters) {
    for (const name of chapter.blockNames)
      if (inventoryNames.has(name))
        problems.push(
          `${title}: a code block declares ${name} again; the source is the only declaration`,
        )
    for (const link of chapter.links) {
      const path = resolve(pageDirectory, link)
      if ((inPackage(path, 'src') || inPackage(path, 'tests')) && !existsSync(path))
        problems.push(`${title}: links ${link}, which does not exist`)
    }
  }
  for (const [title, names] of listed) {
    const chapter = chapters.get(title)
    if (chapter === undefined) {
      problems.push(`chapter "${title}" is in the inventory, not in the page`)
      continue
    }
    if (names.size === 0) continue
    const sources = chapter.links
      .map(link => resolve(pageDirectory, link))
      .filter(path => inPackage(path, 'src') && existsSync(path))
    if (sources.length === 0) {
      problems.push(`${title}: links no source file under src/`)
      continue
    }
    const declared = new Set(sources.flatMap(path => declaredNames(readFileSync(path, 'utf8'))))
    for (const name of names)
      if (!declared.has(name)) problems.push(`${title}: no linked source file declares ${name}`)
  }
  return problems
}
