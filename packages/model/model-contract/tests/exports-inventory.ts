import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import ts from '@typescript/typescript6'

export type ExportKind = 'type' | 'value' | 'class'

export type InventoryName = Readonly<{
  name: string
  kind: ExportKind
  pending: boolean
  sameAs?: string
}>

export type InventoryChapter = Readonly<{ title: string; names: readonly InventoryName[] }>

export type Inventory = Readonly<{
  package: string
  source: string
  expectedPending: number
  entries: Readonly<Record<string, Readonly<{ chapters: readonly InventoryChapter[] }>>>
  augmentations: readonly Augmentation[]
}>

export type Augmentation = Readonly<{
  module: string
  interface: string
  members: readonly string[]
  pending: boolean
  landed?: readonly string[]
}>

export type EntryComparison = Readonly<{
  entry: string
  declaration: string
  missing: readonly string[]
  extra: readonly string[]
  stalePending: readonly string[]
  kindMismatch: readonly string[]
  notSameDeclaration: readonly string[]
  total: number
  pending: number
}>

export function isOwnEntry(sameAs: string): boolean {
  return sameAs === '.' || sameAs.startsWith('./')
}

export function loadInventory(path: string): Inventory {
  return JSON.parse(readFileSync(path, 'utf8')) as Inventory
}

export function namesOf(entry: Inventory['entries'][string]): readonly InventoryName[] {
  return entry.chapters.flatMap(chapter => chapter.names)
}

function kindOf(symbol: ts.Symbol): ExportKind | 'both' {
  const flags = symbol.flags
  if (flags & ts.SymbolFlags.Class) return 'class'
  const isValue = (flags & ts.SymbolFlags.Value) !== 0
  const isType = (flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Interface)) !== 0
  if (isValue && isType) return 'both'
  return isValue ? 'value' : 'type'
}

export function compareEntries(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): EntryComparison[] {
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  }
  const foreign = new Map<string, string>()
  for (const [entry, value] of Object.entries(inventory.entries)) {
    const from = declarations[entry]
    if (from === undefined) continue
    for (const item of namesOf(value)) {
      if (item.sameAs === undefined || isOwnEntry(item.sameAs) || foreign.has(item.sameAs)) continue
      const found = ts.resolveModuleName(item.sameAs, from, options, ts.sys).resolvedModule
      if (found === undefined) throw new Error(`${entry}: cannot resolve sameAs ${item.sameAs}`)
      foreign.set(item.sameAs, found.resolvedFileName)
    }
  }
  const program = ts.createProgram([...Object.values(declarations), ...foreign.values()], options)
  const checker = program.getTypeChecker()
  const exportsByEntry = new Map<string, Map<string, ts.Symbol>>()
  for (const [entry, path] of [...Object.entries(declarations), ...foreign.entries()]) {
    const file = program.getSourceFile(path)
    const module = file === undefined ? undefined : checker.getSymbolAtLocation(file)
    if (module === undefined) throw new Error(`${path} is not a module declaration file`)
    exportsByEntry.set(
      entry,
      new Map(checker.getExportsOfModule(module).map(symbol => [symbol.name, symbol])),
    )
  }
  const resolved = (symbol: ts.Symbol): ts.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

  return Object.entries(inventory.entries).map(([entry, value]) => {
    const exported = exportsByEntry.get(entry)
    const declaration = declarations[entry]
    if (exported === undefined || declaration === undefined)
      throw new Error(`no built declaration file given for entry ${entry}`)
    const listed = namesOf(value)
    const missing: string[] = []
    const stalePending: string[] = []
    const kindMismatch: string[] = []
    const notSameDeclaration: string[] = []
    for (const item of listed) {
      const symbol = exported.get(item.name)
      if (symbol === undefined) {
        if (!item.pending) missing.push(item.name)
        continue
      }
      if (item.pending) stalePending.push(item.name)
      const actual = kindOf(resolved(symbol))
      if (actual !== item.kind)
        kindMismatch.push(`${item.name}: ${item.kind} listed, ${actual} built`)
      if (item.sameAs !== undefined) {
        const owner = exportsByEntry.get(item.sameAs)?.get(item.name)
        if (owner === undefined || resolved(owner) !== resolved(symbol))
          notSameDeclaration.push(item.name)
      }
    }
    const names = new Set(listed.map(item => item.name))
    return {
      entry,
      declaration,
      missing,
      extra: [...exported.keys()].filter(name => !names.has(name)).sort(),
      stalePending,
      kindMismatch,
      notSameDeclaration,
      total: listed.length,
      pending: listed.filter(item => item.pending).length,
    }
  })
}

export function builtDeclarations(
  packageDirectory: string,
  inventory: Inventory,
): Record<string, string> {
  const manifestPath = resolve(packageDirectory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports: Record<string, { types: string }>
  }
  return Object.fromEntries(
    Object.keys(inventory.entries).map(entry => {
      const target = manifest.exports[entry]?.types
      if (target === undefined) throw new Error(`package.json exports has no types for ${entry}`)
      return [entry, resolve(dirname(manifestPath), target)]
    }),
  )
}

function augmentedMembers(
  declarations: readonly string[],
  moduleName: string,
  interfaceName: string,
): string[] {
  const members: string[] = []
  for (const path of declarations) {
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)
    for (const statement of file.statements) {
      if (!ts.isModuleDeclaration(statement) || statement.name.text !== moduleName) continue
      if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue
      for (const inner of statement.body.statements)
        if (ts.isInterfaceDeclaration(inner) && inner.name.text === interfaceName)
          for (const member of inner.members)
            members.push(
              member.name !== undefined && ts.isStringLiteral(member.name)
                ? member.name.text
                : (member.name?.getText(file) ?? ''),
            )
    }
  }
  return members.sort()
}

export function compareAugmentations(
  inventory: Inventory,
  declarations: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = []
  for (const augmentation of inventory.augmentations) {
    const built = augmentedMembers(
      Object.values(declarations),
      augmentation.module,
      augmentation.interface,
    )
    const label = `${augmentation.module} ${augmentation.interface}`
    const unlisted = (augmentation.landed ?? []).filter(
      name => !augmentation.members.includes(name),
    )
    if (unlisted.length > 0)
      problems.push(`${label}: landed ${unlisted.join(', ')} are not listed in members`)
    if (augmentation.pending) {
      const landed = [...(augmentation.landed ?? [])].sort()
      if (JSON.stringify(built) !== JSON.stringify(landed))
        problems.push(
          `${label}: pending, built members ${built.join(', ') || 'none'} differ from landed ${landed.join(', ') || 'none'}`,
        )
    } else if (JSON.stringify(built) !== JSON.stringify([...augmentation.members].sort()))
      problems.push(`${label}: built members ${built.join(', ')} differ from the inventory`)
  }
  return problems
}

export function isClean(comparison: EntryComparison): boolean {
  return (
    comparison.missing.length === 0 &&
    comparison.extra.length === 0 &&
    comparison.stalePending.length === 0 &&
    comparison.kindMismatch.length === 0 &&
    comparison.notSameDeclaration.length === 0
  )
}

export function sameAsProblems(inventory: Inventory): string[] {
  const problems: string[] = []
  for (const [entry, value] of Object.entries(inventory.entries))
    for (const item of namesOf(value)) {
      if (item.sameAs === undefined || !isOwnEntry(item.sameAs)) continue
      const ownerEntry = inventory.entries[item.sameAs]
      if (ownerEntry === undefined) {
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which is not an entry`)
        continue
      }
      const owner = namesOf(ownerEntry).find(other => other.name === item.name)
      if (owner === undefined)
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which does not list it`)
      else if (owner.kind !== item.kind)
        problems.push(
          `${entry}: ${item.name} is ${item.kind}, but ${item.sameAs} lists it as ${owner.kind}`,
        )
    }
  return problems
}

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
    else if ('name' in statement && statement.name !== undefined)
      names.push((statement.name as ts.Identifier).text)
  }
  return names
}

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

const FENCE_LINE = /^(?<indent>\s*)(?<marks>`{3,}|~{3,})(?<info>.*)$/u

type OpenFence = Readonly<{ indent: number; marks: string; ts: boolean; lines: string[] }>

function openFence(line: string): OpenFence | undefined {
  const match = FENCE_LINE.exec(line)?.groups
  if (match === undefined) return undefined
  const label = match['info']?.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  const marks = match['marks'] ?? ''
  return {
    indent: match['indent']?.length ?? 0,
    marks,
    ts: TYPESCRIPT_FENCES.has(label),
    lines: [],
  }
}

function closesFence(line: string, fence: OpenFence): boolean {
  const match = FENCE_LINE.exec(line)?.groups
  const marks = match?.['marks'] ?? ''
  return (
    match !== undefined && marks.startsWith(fence.marks) && (match['info']?.trim() ?? '') === ''
  )
}

function dedented(line: string, fence: OpenFence): string {
  const indent = line.length - line.trimStart().length
  return line.slice(Math.min(indent, fence.indent))
}

export type PageChapter = Readonly<{
  links: readonly string[]
  blockNames: readonly string[]
}>

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
    if (opened !== undefined) fence = opened
    else if (line.startsWith('## ')) {
      title = line.slice(3).trim()
      current()
    } else
      for (const match of line.matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/gu)) {
        const target = match[1] ?? ''
        if (!/^[a-z][a-z0-9+.-]*:/iu.test(target)) current().links.push(target)
      }
  }
  return chapters
}

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
        if (item.sameAs === undefined || isOwnEntry(item.sameAs)) names.add(item.name)
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
