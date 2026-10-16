import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { hasArchivedDirectories, isLegacyFile } from '../core/check-scope.ts'

export { hasArchivedDirectories }

/** 归档范围的 Vitest 参数脚本：按本模块所在位置取 src 下的 .ts 或 dist 下的 .js。 */
export const VITEST_ARCHIVE_ENTRY = fileURLToPath(
  new URL(`./vitest-archive.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url),
)

export interface ScopedProject {
  readonly path: string
  readonly activeFiles: number
}

export function scopedProject(project: string, output: string): ScopedProject {
  const target = resolve(project)
  const original = ts.sys.directoryExists(target) ? join(target, 'tsconfig.json') : target
  const input = ts.readConfigFile(original, ts.sys.readFile)
  if (input.error !== undefined)
    throw new Error(ts.flattenDiagnosticMessageText(input.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(
    input.config,
    ts.sys,
    dirname(original),
    undefined,
    original,
  )
  if (parsed.errors.length > 0)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getCanonicalFileName: name => name,
        getNewLine: () => '\n',
      }),
    )
  const files = parsed.fileNames.filter(path => !isLegacyFile(relative(dirname(original), path)))
  if (files.length === parsed.fileNames.length) return { path: original, activeFiles: files.length }
  if (
    (parsed.options.composite === true || parsed.options.incremental === true) &&
    parsed.options.tsBuildInfoFile === undefined
  )
    throw new Error(`Archived inputs require an explicit tsBuildInfoFile: ${original}`)
  const config = {
    extends: original,
    include: [],
    files,
    ...(parsed.options.composite === true && parsed.options.rootDir === undefined
      ? { compilerOptions: { rootDir: dirname(original) } }
      : {}),
    ...(parsed.projectReferences === undefined
      ? {}
      : {
          references: parsed.projectReferences.map(reference => ({
            path: reference.path,
            ...(reference.prepend === undefined ? {} : { prepend: reference.prepend }),
          })),
        }),
  }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(config, null, 2) + '\n')
  return { path: resolve(output), activeFiles: files.length }
}

export function typecheckProject(script: string, member: string): string | undefined {
  const match = /^tsc\s+(?:-p|--project)\s+([\w./-]+)$/u.exec(script.trim())
  return match?.[1] === undefined ? undefined : resolve(member, match[1])
}
