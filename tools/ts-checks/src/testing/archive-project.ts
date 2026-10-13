import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { isLegacyFile } from '../check-scope.ts'

export function hasArchivedDirectories(root: string): boolean {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || ['node_modules', '.git'].includes(entry.name)) continue
    if (entry.name.endsWith('.legacy') || hasArchivedDirectories(join(root, entry.name)))
      return true
  }
  return false
}

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
