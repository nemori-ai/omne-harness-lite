// Compares the declarations that `docs/public-api.md` states with the ones that the source
// exports, using strict type identity. A type probe that only assigns a value cannot see an added
// optional field, a widened union, a lost `readonly` or an optional member that became required;
// identity can. The page is turned into a declaration file in a work directory, the source entry
// is imported next to it, and the TypeScript 6 compiler API evaluates one `Equal<Page, Source>`
// alias per landed name.
//
// Three rules shape what is compared:
// - Only landed names are written to the declaration file. A page declaration that is still
//   pending may refer to names that do not exist yet, and must not break the others.
// - A generic is compared at one fixed instantiation, and its type-parameter lists are compared
//   as text: the header on the page is what a reader sees.
// - A declaration that mints a `unique symbol` brand cannot be compared by type, because the page
//   and the source each have their own symbol. Such a name is compared as text, and the declaration
//   file imports it from the source so that the other names built on it still compare.
import { mkdirSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from '@typescript/typescript6'

export type LandedName = Readonly<{ name: string; kind: 'type' | 'value' | 'class' }>

export type EqualityInput = Readonly<{
  /** The text of the public-api page. */
  page: string
  landed: readonly LandedName[]
  /** Absolute path of the source entry (`.ts`) whose exports are compared. */
  sourceEntry: string
  /** Directory with `tsconfig.test.json` and `node_modules`; options and dependencies come from it. */
  packageDirectory: string
  /** An empty directory that the comparison may write to. */
  workDirectory: string
}>

export type EqualityReport = Readonly<{
  /** Names whose types were compared by strict identity (a class counts once). */
  compared: readonly string[]
  /** Names compared as normalized declaration text, because they mint a brand symbol. */
  comparedAsText: readonly string[]
  /** Landed names that the page does not declare. */
  notOnPage: readonly string[]
  /** Landed names that the source entry does not export. */
  notInSource: readonly string[]
  /** Names whose page type and source type are not identical. */
  different: readonly string[]
  /** Names whose type-parameter lists differ, with both lists. */
  parameterLists: readonly string[]
  /** Names whose declaration text differs. */
  textDifferent: readonly string[]
  /** Compiler errors in the generated files, such as a page type that names an unknown type. */
  diagnostics: readonly string[]
}>

/** What fails the comparison, one line each; an empty list means page and source are identical. */
export function problemsOf(report: EqualityReport): string[] {
  return [
    ...report.notOnPage.map(name => `${name}: landed but not declared on the page`),
    ...report.notInSource.map(name => `${name}: landed but not exported by the source`),
    ...report.different.map(name => `${name}: page type and source type are not identical`),
    ...report.parameterLists.map(line => `type parameters differ: ${line}`),
    ...report.textDifferent.map(name => `${name}: declaration text differs`),
    ...report.diagnostics.map(line => `compiler: ${line}`),
  ]
}

const normalize = (text: string): string => text.replace(/;/gu, '').replace(/\s+/gu, ' ').trim()

function tsBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] | undefined
  for (const line of markdown.split('\n')) {
    if (current === undefined) {
      if (line.startsWith('```ts')) current = []
    } else if (line.startsWith('```')) {
      blocks.push(current.join('\n'))
      current = undefined
    } else current.push(line)
  }
  return blocks
}

const isExported = (statement: ts.Statement): boolean =>
  ts.canHaveModifiers(statement) &&
  (ts.getModifiers(statement)?.some(item => item.kind === ts.SyntaxKind.ExportKeyword) ?? false)

function namesOfStatement(statement: ts.Statement, file: ts.SourceFile): string[] {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map(item => item.name.getText(file))
  if (
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isFunctionDeclaration(statement)
  )
    return statement.name === undefined ? [] : [statement.name.text]
  throw new Error(`public-api: unsupported top-level statement: ${statement.getText(file)}`)
}

const isBrandSymbol = (statement: ts.Statement): statement is ts.VariableStatement =>
  ts.isVariableStatement(statement) &&
  statement.declarationList.declarations.every(
    item =>
      item.type !== undefined &&
      ts.isTypeOperatorNode(item.type) &&
      item.type.operator === ts.SyntaxKind.UniqueKeyword,
  )

function identifiersIn(node: ts.Node): Set<string> {
  const found = new Set<string>()
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child)) found.add(child.text)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

/** Names that a declaration uses as a symbol: `[name]` property keys and `typeof name`. */
function symbolReferences(node: ts.Node): Set<string> {
  const found = new Set<string>()
  const visit = (child: ts.Node): void => {
    if (ts.isComputedPropertyName(child) || ts.isTypeQueryNode(child))
      for (const name of identifiersIn(child)) found.add(name)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function typeParametersOf(node: ts.Node): readonly ts.TypeParameterDeclaration[] {
  return (
    (ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node)
      ? node.typeParameters
      : undefined) ?? []
  )
}

const opaque = (index: number): string => `Opaque${index}`

/** One argument per type parameter, or a loud failure when a constraint has no known instance. */
function fixedArguments(
  parameters: readonly ts.TypeParameterDeclaration[],
  aliases: ReadonlyMap<string, ts.TypeAliasDeclaration>,
): string {
  if (parameters.length === 0) return ''
  const instance = (node: ts.TypeNode, owner: string): string => {
    if (node.kind === ts.SyntaxKind.StringKeyword) return "'string-instance'"
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
      return node.literal.getText()
    if (ts.isUnionTypeNode(node)) return instance(node.types[0] as ts.TypeNode, owner)
    if (ts.isTypeReferenceNode(node)) {
      const alias = aliases.get(node.typeName.getText())
      if (alias !== undefined) return instance(alias.type, owner)
    }
    throw new Error(`no fixed instantiation for the constraint of ${owner}: ${node.getText()}`)
  }
  return `<${parameters
    .map((parameter, index) =>
      parameter.constraint === undefined
        ? opaque(index)
        : instance(parameter.constraint, parameter.name.text),
    )
    .join(', ')}>`
}

function generatedOptions(packageDirectory: string): ts.CompilerOptions {
  const configPath = join(packageDirectory, 'tsconfig.test.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    packageDirectory,
    {},
    configPath,
  )
  return {
    ...parsed.options,
    noEmit: true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    allowImportingTsExtensions: true,
    // The generated declaration file is a `.d.ts`: skipping declaration files would hide an
    // unknown name in it, which then reads as an error type that is identical to itself.
    skipLibCheck: false,
    // `@types/node` is the one ambient package that the sources need (`AbortSignal`).
    typeRoots: [join(packageDirectory, 'node_modules/@types')],
    types: ['node'],
  }
}

export function compareDeclarations(input: EqualityInput): EqualityReport {
  const pageFile = ts.createSourceFile(
    'page.ts',
    tsBlocks(input.page).join('\n'),
    ts.ScriptTarget.ESNext,
    true,
  )
  const landed = new Map(input.landed.map(item => [item.name, item]))
  const aliases = new Map<string, ts.TypeAliasDeclaration>()
  const kept: ts.Statement[] = []
  const pageDeclaration = new Map<string, ts.Statement>()
  const brandSymbols = new Map<string, ts.VariableStatement>()
  const imports: ts.ImportDeclaration[] = []
  for (const statement of pageFile.statements) {
    if (ts.isImportDeclaration(statement)) imports.push(statement)
    else if (isBrandSymbol(statement)) {
      for (const declaration of statement.declarationList.declarations)
        brandSymbols.set(declaration.name.getText(pageFile), statement)
    } else {
      const names = namesOfStatement(statement, pageFile)
      if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement)
      if (!isExported(statement)) kept.push(statement)
      else if (names.some(name => landed.has(name))) kept.push(statement)
      for (const name of names) if (!pageDeclaration.has(name)) pageDeclaration.set(name, statement)
    }
  }

  const asText = new Set<string>()
  for (const statement of kept)
    if (
      isExported(statement) &&
      [...symbolReferences(statement)].some(name => brandSymbols.has(name))
    ) {
      if (!ts.isTypeAliasDeclaration(statement))
        throw new Error(
          `public-api: a brand can only be minted by a type alias: ${statement.getText(pageFile)}`,
        )
      asText.add(statement.name.text)
    }

  const sourceProgram = ts.createProgram(
    [input.sourceEntry],
    generatedOptions(input.packageDirectory),
  )
  const sourceChecker = sourceProgram.getTypeChecker()
  const entryFile = sourceProgram.getSourceFile(input.sourceEntry)
  const entrySymbol =
    entryFile === undefined ? undefined : sourceChecker.getSymbolAtLocation(entryFile)
  const sourceExports = new Map(
    (entrySymbol === undefined ? [] : sourceChecker.getExportsOfModule(entrySymbol)).map(symbol => [
      symbol.name,
      symbol.flags & ts.SymbolFlags.Alias ? sourceChecker.getAliasedSymbol(symbol) : symbol,
    ]),
  )

  const notOnPage: string[] = []
  const notInSource: string[] = []
  const parameterLists: string[] = []
  const textDifferent: string[] = []
  const textCompared: string[] = []
  const comparable: LandedName[] = []
  for (const item of input.landed) {
    const onPage = pageDeclaration.get(item.name)
    const symbol = sourceExports.get(item.name)
    if (onPage === undefined) notOnPage.push(item.name)
    if (symbol === undefined) notInSource.push(item.name)
    if (onPage === undefined || symbol === undefined) continue
    const declaration = symbol.declarations?.[0]
    if (declaration === undefined) throw new Error(`${item.name} has no declaration in the source`)
    const pageParameters = typeParametersOf(onPage).map(parameter =>
      normalize(parameter.getText(pageFile)),
    )
    const sourceParameters = typeParametersOf(declaration).map(parameter =>
      normalize(parameter.getText()),
    )
    if (pageParameters.join(',') !== sourceParameters.join(','))
      parameterLists.push(
        `${item.name}<${pageParameters.join(', ')}> on the page, <${sourceParameters.join(', ')}> in the source`,
      )
    if (asText.has(item.name)) {
      textCompared.push(item.name)
      const brandChanged = [...symbolReferences(onPage)]
        .filter(name => brandSymbols.has(name))
        .some(name => {
          const symbolStatement = declaration
            .getSourceFile()
            .statements.find(
              candidate =>
                ts.isVariableStatement(candidate) &&
                candidate.declarationList.declarations.some(entry => entry.name.getText() === name),
            )
          return (
            symbolStatement === undefined ||
            normalize(symbolStatement.getText()) !==
              normalize((brandSymbols.get(name) as ts.Statement).getText(pageFile))
          )
        })
      if (brandChanged || normalize(declaration.getText()) !== normalize(onPage.getText(pageFile)))
        textDifferent.push(item.name)
      continue
    }
    comparable.push(item)
  }

  const usedNames = new Set(kept.flatMap(statement => [...identifiersIn(statement)]))
  const importLines = imports.flatMap(statement => {
    const clause = statement.importClause
    const specifier = statement.moduleSpecifier.getText(pageFile)
    const bindings = clause?.namedBindings
    if (clause === undefined || clause.name !== undefined || bindings === undefined)
      throw new Error(`public-api: unsupported import: ${statement.getText(pageFile)}`)
    if (ts.isNamespaceImport(bindings))
      return usedNames.has(bindings.name.text)
        ? [`import type * as ${bindings.name.text} from ${specifier}`]
        : []
    const used = bindings.elements.filter(element => usedNames.has(element.name.text))
    return used.length === 0
      ? []
      : [
          `import type { ${used.map(element => element.getText(pageFile)).join(', ')} } from ${specifier}`,
        ]
  })
  const entryImport = JSON.stringify(
    relative(input.workDirectory, input.sourceEntry).replace(/^(?!\.)/u, './'),
  )
  const fromSource = [...asText]
  const declarationText = [
    ...importLines,
    ...(fromSource.length === 0
      ? []
      : [`import type { ${fromSource.join(', ')} } from ${entryImport}`]),
    ...kept
      .filter(
        statement => !(ts.isTypeAliasDeclaration(statement) && asText.has(statement.name.text)),
      )
      .map(statement => statement.getText(pageFile)),
  ].join('\n')

  const assertions: string[] = []
  for (const item of comparable) {
    const onPage = pageDeclaration.get(item.name) as ts.Statement
    const args = fixedArguments(typeParametersOf(onPage), aliases)
    if (item.kind === 'type') {
      assertions.push(
        `export type Eq_${item.name} = Equal<D.${item.name}${args}, S.${item.name}${args}>`,
      )
      continue
    }
    assertions.push(
      `export type Eq_${item.name} = Equal<typeof D.${item.name}, typeof S.${item.name}>`,
    )
    if (item.kind === 'class')
      assertions.push(
        `export type Eq_${item.name}_instance = Equal<D.${item.name}${args}, S.${item.name}${args}>`,
      )
  }
  const compareText = [
    "import type * as D from './declarations.js'",
    `import type * as S from ${entryImport}`,
    'type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false',
    ...[0, 1, 2, 3].flatMap(index => [
      `declare const opaque${index}: unique symbol`,
      `type ${opaque(index)} = { readonly [opaque${index}]: ${index} }`,
    ]),
    ...assertions,
  ].join('\n')

  mkdirSync(input.workDirectory, { recursive: true })
  writeFileSync(join(input.workDirectory, 'package.json'), '{ "type": "module" }\n')
  const modules = join(input.workDirectory, 'node_modules')
  if (!existsSync(modules))
    symlinkSync(join(input.packageDirectory, 'node_modules'), modules, 'dir')
  const declarationPath = join(input.workDirectory, 'declarations.d.ts')
  const comparePath = join(input.workDirectory, 'compare.ts')
  writeFileSync(declarationPath, `${declarationText}\n`)
  writeFileSync(comparePath, `${compareText}\n`)

  const options = generatedOptions(input.packageDirectory)
  const program = ts.createProgram({
    rootNames: [input.sourceEntry, declarationPath, comparePath],
    options,
    oldProgram: sourceProgram,
  })
  const checker = program.getTypeChecker()
  const diagnostics = [declarationPath, comparePath].flatMap(path => {
    const file = program.getSourceFile(path) as ts.SourceFile
    return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map(
      item => {
        const at =
          item.start === undefined ? 0 : file.getLineAndCharacterOfPosition(item.start).line + 1
        return `${file.fileName.split('/').pop()}:${at} ${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`
      },
    )
  })

  const compareFile = program.getSourceFile(comparePath) as ts.SourceFile
  const different: string[] = []
  const compared = new Set<string>()
  for (const statement of compareFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || !statement.name.text.startsWith('Eq_')) continue
    const symbol = checker.getSymbolAtLocation(statement.name)
    const verdict =
      symbol === undefined
        ? 'unknown'
        : checker.typeToString(checker.getDeclaredTypeOfSymbol(symbol))
    const name = statement.name.text.slice('Eq_'.length).replace(/_instance$/u, '')
    compared.add(name)
    if (verdict === 'false') different.push(statement.name.text.slice('Eq_'.length))
    else if (verdict !== 'true') diagnostics.push(`Eq_${name} evaluated to ${verdict}`)
  }
  return {
    compared: [...compared],
    comparedAsText: textCompared,
    notOnPage,
    notInSource,
    different,
    parameterLists,
    textDifferent,
    diagnostics,
  }
}
