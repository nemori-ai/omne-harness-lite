import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import ts from '@typescript/typescript6'

export interface DeclarationDiagnostic {
  readonly file?: string
  readonly line?: number
  readonly code: number
  readonly message: string
}

export interface DeclarationReport {
  readonly typescript: string
  readonly members: number
  readonly files: number
  readonly unbuilt: readonly string[]
  readonly diagnostics: readonly DeclarationDiagnostic[]
  readonly external: number
}

const DECLARATION = /\.d\.[cm]?ts$/u

export function distOf(root: string, member: string): string {
  return join(root, member, 'dist')
}

export function declarationsIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return declarationsIn(path)
      return DECLARATION.test(entry.name) ? [path] : []
    })
}

export function consumerCompilerOptions(root: string): ts.CompilerOptions {
  const path = join(root, 'tsconfig.base.json')
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error !== undefined) throw new Error(flatten(read.error.messageText))
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, path)
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

const installed = new Map<string, ts.SourceFile>()
const settingsKey = ts.createDocumentRegistry().getKeyForCompilationSettings

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
