// 声明兼容检查：成员用 TypeScript 7 构建，dist 里的 `.d.ts` 要能被 TypeScript 6 的消费者读。
// 把全部成员的 dist 声明作为根文件交给 TypeScript 6 建一个程序，不跳过库检查；
// 只认落在成员 dist 里的诊断，第三方声明的诊断只计数，不判失败。
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import ts from '@typescript/typescript6'

export interface DeclarationDiagnostic {
  /** 仓库相对路径；全局诊断（选项、类型根）没有文件。 */
  readonly file?: string
  readonly line?: number
  readonly code: number
  readonly message: string
}

export interface DeclarationReport {
  readonly typescript: string
  /** 有 dist 的成员数与它们的声明文件数。 */
  readonly members: number
  readonly files: number
  /** 声明了构建、却没有 dist 的成员：这次没被检查，如实列出。 */
  readonly unbuilt: readonly string[]
  readonly diagnostics: readonly DeclarationDiagnostic[]
  /** 落在成员 dist 之外（第三方声明）的诊断数，只报告。 */
  readonly external: number
}

const DECLARATION = /\.d\.[cm]?ts$/u

/** 成员的构建产物目录；`root` 应是真实路径，诊断与归属都按它前缀判断。 */
export function distOf(root: string, member: string): string {
  return join(root, member, 'dist')
}

/** 目录下全部声明文件，按名字排序、逐层展开。 */
export function declarationsIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return declarationsIn(path)
      return DECLARATION.test(entry.name) ? [path] : []
    })
}

/**
 * 与成员构建同一套严格选项（仓库根 `tsconfig.base.json`），另外不跳过库检查、不产出。
 * 去掉仓库的 `customConditions`（现为 `source`）：消费者不带这些条件，成员之间的导入要解析到对方的 dist 声明。
 * 带着它们，导入会落到对方的 `src`，同一成员的 src 与 dist 同在程序里，模块扩充就被声明两次（TS2717）。
 */
export function consumerCompilerOptions(root: string): ts.CompilerOptions {
  const path = join(root, 'tsconfig.base.json')
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error !== undefined) throw new Error(flatten(read.error.messageText))
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, path)
  // `types: ["node"]` 要从某个成员的 node_modules 解析；仓库根不提升 @types。
  const require = createRequire(import.meta.url)
  const typeRoot = dirname(dirname(require.resolve('@types/node/package.json')))
  const { customConditions: _source, ...options } = parsed.options
  return {
    ...options,
    noEmit: true,
    skipLibCheck: false,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    typeRoots: [typeRoot],
  }
}

/** 已安装声明的解析结果，按「解析设置 + 路径」存；只收 lib 与类型根下的文件，集合有限。 */
const installed = new Map<string, ts.SourceFile>()
const settingsKey = ts.createDocumentRegistry().getKeyForCompilationSettings

/**
 * 给 `getSourceFile` 加一层进程内共享：TypeScript 的 lib 目录与 `typeRoots` 下的声明是安装好的、进程内不变，
 * 同一解析设置下只解析一次，之后的程序拿同一个 SourceFile（语言服务的文档注册表也这样跨程序共用）。
 * 键用 TypeScript 判断 SourceFile 能否复用的编译选项键（含 target、module 等影响解析与绑定的选项）、
 * 本次的解析参数与路径；`lib` 只决定读哪些文件，已在路径里。其余文件与要求新建的照旧交给 `read`。
 */
export function sharingInstalledDeclarations(
  options: ts.CompilerOptions,
  read: ts.CompilerHost['getSourceFile'],
): ts.CompilerHost['getSourceFile'] {
  const roots = [dirname(ts.getDefaultLibFilePath(options)), ...(options.typeRoots ?? [])].map(
    root => root.split(sep).join('/') + '/',
  )
  const settings = settingsKey(options)
  return (file, language, onError, fresh) => {
    if (fresh === true || !roots.some(root => file.startsWith(root)))
      return read(file, language, onError, fresh)
    const parse = typeof language === 'object' ? language : { languageVersion: language }
    const key = [
      settings,
      parse.languageVersion,
      parse.impliedNodeFormat,
      parse.jsDocParsingMode,
      file,
    ].join('|')
    const cached = installed.get(key)
    if (cached !== undefined) return cached
    const text = ts.sys.readFile(file)
    if (text === undefined) return read(file, language, onError, fresh)
    const source = ts.createSourceFile(file, text, language, true)
    installed.set(key, source)
    return source
  }
}

function flatten(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, '\n')
}

/** 检查 `memberPaths`（仓库相对）各自 `dist/` 下的全部声明文件。 */
export function checkDeclarations(root: string, memberPaths: readonly string[]): DeclarationReport {
  const realRoot = realpathSync(root)
  const dists: string[] = []
  const unbuilt: string[] = []
  for (const member of memberPaths) {
    const dist = distOf(realRoot, member)
    if (existsSync(dist)) dists.push(dist)
    else unbuilt.push(member)
  }
  const files = dists.flatMap(declarationsIn)
  const program = ts.createProgram({ rootNames: files, options: consumerCompilerOptions(realRoot) })
  const owned = (file: string) => dists.some(dist => file.startsWith(dist + sep))
  const diagnostics: DeclarationDiagnostic[] = []
  let external = 0
  for (const diagnostic of [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ]) {
    const message = flatten(diagnostic.messageText)
    if (diagnostic.file === undefined) {
      diagnostics.push({ code: diagnostic.code, message })
      continue
    }
    const file = realpathSync(diagnostic.file.fileName)
    if (!owned(file)) {
      external += 1
      continue
    }
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    diagnostics.push({
      file: relative(realRoot, file).split(sep).join('/'),
      line: line + 1,
      code: diagnostic.code,
      message,
    })
  }
  return {
    typescript: ts.version,
    members: dists.length,
    files: files.length,
    unbuilt,
    diagnostics,
    external,
  }
}

export function renderDeclarationReport(report: DeclarationReport): string[] {
  const lines = [
    `TypeScript ${report.typescript} 检查 ${report.members} 个成员的 ${report.files} 个声明文件：` +
      (report.diagnostics.length === 0 ? '兼容' : `${report.diagnostics.length} 处不兼容`),
  ]
  for (const item of report.diagnostics)
    lines.push(
      `  ${item.file === undefined ? '（全局）' : `${item.file}:${item.line}`} TS${item.code} ${item.message}`,
    )
  if (report.unbuilt.length > 0)
    lines.push(
      `没有 dist、这次没检查的成员 ${report.unbuilt.length} 个：${report.unbuilt.join('、')}`,
    )
  if (report.external > 0) lines.push(`第三方声明里的诊断 ${report.external} 处，只报告`)
  return lines
}
