import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from '@typescript/typescript6'
import { collectTestingEntries } from '../testing-entries.ts'

/** 声明所在的文件与行，路径相对于扫描根，POSIX 写法。 */
export interface Site {
  readonly path: string
  readonly line: number
}

/** 一个 `./testing` 入口导出的一个值。 */
export interface TestingExport {
  readonly name: string
  /** 声明处；入口只重导出外部包的名字、解析不到声明时，退而取入口里的导出语句。 */
  readonly sites: readonly Site[]
  /** 沿重导出链走过的全部文件：入口、中间的桶文件、声明文件。这些文件里的出现不算引用。 */
  readonly chain: ReadonlySet<string>
}

export interface TestingEntry {
  /** 声明该入口的成员目录，相对于扫描根。 */
  readonly member: string
  readonly entry: string
  readonly exports: readonly TestingExport[]
}

/** 无法可靠读出入口：命令必须停下，不能把未知当成「没有导出」。 */
export class EntryError extends Error {
  override readonly name = 'EntryError'
}

const SCAN_DIRECTORIES = ['packages', 'apps']

const posix = (path: string): string => path.replaceAll('\\', '/')

function memberOf(root: string, entry: string): string {
  let directory = dirname(join(root, entry))
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory)
    if (parent === directory || !directory.startsWith(root)) return posix(dirname(entry))
    directory = parent
  }
  return posix(relative(root, directory))
}

/** 声明了 `exports["./testing"]` 的入口文件，按路径排序；声明解析沿用 lint:rules 的 `collectTestingEntries`。 */
function declaredEntries(root: string): string[] {
  const entries = new Set<string>()
  for (const directory of SCAN_DIRECTORIES) {
    const base = join(root, directory)
    if (!existsSync(base)) continue
    const declared = collectTestingEntries(base)
    if (declared.unparsable.length > 0)
      throw new EntryError(
        `package.json 无法解析，不能确定它声明的 ./testing 入口：${declared.unparsable.map(path => `${directory}/${path}`).join('、')}`,
      )
    for (const entry of declared.entries) entries.add(`${directory}/${entry}`)
  }
  return [...entries].sort()
}

/** 只跟随相对路径的 import：入口之间的重导出链全在成员内，不去读 node_modules 里的依赖。 */
function programFor(files: readonly string[]): ts.Program {
  const options: ts.CompilerOptions = {
    noEmit: true,
    noLib: true,
    types: [],
    skipLibCheck: true,
    allowJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
  }
  const host = ts.createCompilerHost(options, true)
  host.resolveModuleNameLiterals = (literals, containingFile, _redirected, compilerOptions) =>
    literals.map(literal => ({
      resolvedModule: literal.text.startsWith('.')
        ? ts.resolveModuleName(literal.text, containingFile, compilerOptions, host).resolvedModule
        : undefined,
    }))
  return ts.createProgram({ rootNames: [...files], options, host })
}

function declarationSites(root: string, symbol: ts.Symbol): Site[] {
  const byPath = new Map<string, Site>()
  for (const declaration of symbol.declarations ?? []) {
    const file = declaration.getSourceFile()
    const path = posix(relative(root, file.fileName))
    if (byPath.has(path)) continue
    const line = file.getLineAndCharacterOfPosition(declaration.getStart(file)).line + 1
    byPath.set(path, { path, line })
  }
  return [...byPath.values()]
}

function chainOf(
  root: string,
  entry: string,
  start: ts.Symbol,
  checker: ts.TypeChecker,
): Set<string> {
  const chain = new Set<string>([entry])
  const seen = new Set<ts.Symbol>()
  let current: ts.Symbol | undefined = start
  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    for (const declaration of current.declarations ?? [])
      chain.add(posix(relative(root, declaration.getSourceFile().fileName)))
    if ((current.flags & ts.SymbolFlags.Alias) === 0) break
    current = checker.getImmediateAliasedSymbol(current)
  }
  return chain
}

/** 每个声明了 `./testing` 入口的成员，及其入口导出的值（纯类型不算），按名字排序。 */
export function readTestingEntries(rootPath: string): TestingEntry[] {
  const root = resolve(rootPath)
  const entries = declaredEntries(root)
  if (entries.length === 0) return []
  const program = programFor(entries.map(entry => join(root, entry)))
  const checker = program.getTypeChecker()
  return entries.map(entry => {
    const source = program.getSourceFile(join(root, entry))
    if (source === undefined) throw new EntryError(`./testing 入口文件读不到：${entry}`)
    const moduleSymbol = checker.getSymbolAtLocation(source)
    const found: TestingExport[] = []
    for (const exported of moduleSymbol === undefined
      ? []
      : checker.getExportsOfModule(moduleSymbol)) {
      const isAlias = (exported.flags & ts.SymbolFlags.Alias) !== 0
      const target = isAlias ? checker.getAliasedSymbol(exported) : exported
      const resolved = (target.declarations ?? []).length > 0
      if (resolved && (target.flags & ts.SymbolFlags.Value) === 0) continue
      found.push({
        name: exported.name,
        sites: declarationSites(root, resolved ? target : exported),
        chain: chainOf(root, entry, exported, checker),
      })
    }
    found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return { member: memberOf(root, entry), entry, exports: found }
  })
}
