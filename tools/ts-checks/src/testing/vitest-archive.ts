import { writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createVitest, parseCLI, resolveConfig } from 'vitest/node'
import { hasArchivedDirectories, scopedProject } from './archive-project.ts'
import { isLegacyDirectory, isLegacyFile } from '../check-scope.ts'

export async function archiveVitestArgs(
  member: string,
  script: string,
  tier: string,
  output: string,
): Promise<string[]> {
  if (!/^vitest(?:\s|$)/u.test(script.trim()) || /[;&|<>]/u.test(script))
    throw new Error(`Cannot exclude archived inputs from this test script: ${script}`)
  const { options } = parseCLI(script.trim())
  const { vitestConfig } = await resolveConfig({ ...options, root: member })
  if ((vitestConfig.projects?.length ?? 0) > 0) {
    if (hasArchivedDirectories(member))
      throw new Error('Archived inputs require a single Vitest project')
    const context = await createVitest('test', { ...options, root: member, watch: false })
    try {
      for (const project of context.projects) {
        const config = project.config
        const tests = await project.globTestFiles()
        if (
          isLegacyDirectory(config.root) ||
          [...tests.testFiles, ...tests.typecheckTestFiles].some(isLegacyFile)
        )
          throw new Error('Archived inputs require a single Vitest project')
        if (tier === 'slow' || tier === 'coverage' || !config.typecheck.enabled) continue
        if (config.typecheck.checker !== 'tsc') {
          if (hasArchivedDirectories(config.root))
            throw new Error('Archived inputs require the supported tsc checker')
          continue
        }
        const file =
          config.typecheck.tsconfig === undefined
            ? ts.findConfigFile(config.root, ts.sys.fileExists)
            : resolve(config.root, config.typecheck.tsconfig)
        if (file === undefined)
          throw new Error(`Missing effective typecheck project: ${config.root}`)
        const scoped = scopedProject(file, output + '.tsconfig.json')
        if (scoped.path !== file && scoped.path !== resolve(file, 'tsconfig.json'))
          throw new Error('Archived inputs require a single Vitest project')
      }
    } finally {
      await context.close()
    }
    writeFileSync(output, '[]\n')
    return []
  }
  const excluded: string[] = []
  const context = await createVitest('test', { ...options, root: member, watch: false })
  try {
    for (const project of context.projects) {
      const tests = await project.globTestFiles()
      for (const [flag, files] of [
        ['--exclude', tests.testFiles],
        ['--typecheck.exclude', tests.typecheckTestFiles],
      ] as const) {
        for (const file of files.filter(isLegacyFile)) {
          const pattern = relative(project.config.dir || project.config.root, file)
            .split(sep)
            .join('/')
            .replace(/([*?()[\]{}!+@\\])/gu, '\\$1')
          excluded.push(flag, pattern)
        }
      }
    }
  } finally {
    await context.close()
  }
  const coverage = tier === 'coverage'
  const args = [
    ...(coverage
      ? [vitestConfig.coverage.exclude].flat()
      : [vitestConfig.typecheck.exclude].flat()),
    '**/*.legacy/**',
  ].flatMap(pattern => [coverage ? '--coverage.exclude' : '--typecheck.exclude', pattern])
  args.push(...excluded)
  if (!coverage && tier !== 'slow' && vitestConfig.typecheck.enabled === true) {
    if (vitestConfig.typecheck.checker !== 'tsc') {
      if (hasArchivedDirectories(member))
        throw new Error('Archived inputs require the supported tsc checker')
      writeFileSync(output, JSON.stringify(args) + '\n')
      return args
    }
    const project =
      vitestConfig.typecheck.tsconfig === undefined
        ? ts.findConfigFile(member, ts.sys.fileExists)
        : resolve(member, vitestConfig.typecheck.tsconfig)
    if (project === undefined) throw new Error(`Missing effective typecheck project: ${member}`)
    const scoped = scopedProject(project, output + '.tsconfig.json')
    args.push('--typecheck.tsconfig', scoped.path)
  }
  writeFileSync(output, JSON.stringify(args) + '\n')
  return args
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [script, tier, output] = process.argv.slice(2)
  if (script === undefined || tier === undefined || output === undefined)
    throw new Error('Missing archive Vitest arguments')
  await archiveVitestArgs(process.cwd(), script, tier, output)
}
