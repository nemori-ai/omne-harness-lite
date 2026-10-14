import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { isLegacyDirectory } from './check-scope.ts'
import ts from 'typescript'
import type { SourceFile } from './rule.ts'
import { sessionSeedBoundary, sessionMappingImmutable } from './rules/session-seed.ts'
import { sessionCatalogBoundary } from './rules/session-catalog.ts'
import { registryInputBoundary } from './rules/registry-input-boundary.ts'
import { evaluationPublicationBoundary } from './rules/evaluation-publication-boundary.ts'
import { manifestImmutable } from './rules/manifest-immutable.ts'
import { registryHistoryBoundary } from './rules/registry-history-boundary.ts'
import { syntaxImports, syntaxOf } from './syntax.ts'
import { modelCredentialBoundary } from './rules/model-credential-boundary.ts'
import { groupDirection } from './rules/group-direction.ts'
import { noLegacyDependency } from './rules/no-legacy-dependency.ts'

export const REPOSITORY_RULES = [
  sessionSeedBoundary,
  sessionCatalogBoundary,
  sessionMappingImmutable,
  registryInputBoundary,
  evaluationPublicationBoundary,
  manifestImmutable,
  registryHistoryBoundary,
  modelCredentialBoundary,
  groupDirection,
  noLegacyDependency,
] as const
export function collectRepositorySources(root: string): SourceFile[] {
  root = resolve(root)
  const sources: SourceFile[] = []
  const optionsCache = new Map<string, ts.CompilerOptions>()
  function readOptions(config: string): ts.CompilerOptions {
    const cached = optionsCache.get(config)
    if (cached !== undefined) return cached
    const parsed = ts.readConfigFile(config, ts.sys.readFile)
    if (parsed.error !== undefined)
      throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'))
    const body: { extends?: string; compilerOptions?: Record<string, unknown> } = parsed.config
    let inherited: ts.CompilerOptions = {}
    if (body.extends !== undefined) {
      if (!body.extends.startsWith('.'))
        throw new Error('repository guard requires an explicit local compiler configuration base')
      let parent = resolve(dirname(config), body.extends)
      if (!existsSync(parent)) parent += '.json'
      inherited = readOptions(parent)
    }
    const explicit = body.compilerOptions ?? {}
    const converted = ts.convertCompilerOptionsFromJson(
      {
        ...explicit,
        ...(explicit.paths !== undefined && explicit.baseUrl === undefined ? { baseUrl: '.' } : {}),
      },
      dirname(config),
    )
    if (converted.errors.length !== 0)
      throw new Error('repository guard cannot resolve compiler aliases from invalid options')
    const options = { ...inherited, ...converted.options }
    optionsCache.set(config, options)
    return options
  }
  function compilerOptions(full: string): ts.CompilerOptions {
    let directory = dirname(full)
    while (directory.startsWith(root)) {
      const config = ['tsconfig.json', 'tsconfig.build.json', 'tsconfig.base.json']
        .map(name => join(directory, name))
        .find(existsSync)
      if (config !== undefined) {
        return readOptions(config)
      }
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    return { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }
  }
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'dist', 'tmp', '.git', '.worktrees', '.meta_harness'].includes(name))
        continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (!isLegacyDirectory(relative(root, full))) walk(full)
      } else if (/\.[cm]?[jt]s$/u.test(name) || name === 'package.json') {
        const source: SourceFile = {
          path: relative(root, full).replaceAll('\\', '/'),
          text: readFileSync(full, 'utf8'),
        }
        const resolvedModules: Record<string, string> = {}
        const options = compilerOptions(full)
        for (const ref of syntaxImports(syntaxOf(source))) {
          if (ref.specifier === undefined) continue
          const alias = Object.keys(options.paths ?? {}).some(pattern => {
            const [before = '', after = ''] = pattern.split('*')
            return pattern.includes('*')
              ? ref.specifier?.startsWith(before) && ref.specifier.endsWith(after)
              : pattern === ref.specifier
          })
          if (!alias) continue
          const target = ts.resolveModuleName(ref.specifier, full, options, ts.sys).resolvedModule
          if (target !== undefined)
            resolvedModules[ref.specifier] = relative(root, target.resolvedFileName).replaceAll(
              '\\',
              '/',
            )
        }
        sources.push({ ...source, resolvedModules })
      }
    }
  }
  for (const directory of ['packages', 'apps', 'examples', 'tools', 'scripts']) {
    const full = join(root, directory)
    try {
      if (statSync(full).isDirectory()) {
        if (!isLegacyDirectory(relative(root, full))) walk(full)
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  const workspace = join(root, 'pnpm-workspace.yaml')
  if (existsSync(workspace))
    sources.push({
      path: 'pnpm-workspace.yaml',
      text: readFileSync(workspace, 'utf8'),
    })
  return sources
}
