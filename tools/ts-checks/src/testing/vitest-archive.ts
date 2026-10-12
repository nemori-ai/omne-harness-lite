import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parseCLI, resolveConfig } from 'vitest/node'
import { scopedProject } from './archive-project.ts'

export async function archiveVitestArgs(
  member: string,
  script: string,
  tier: string,
  output: string,
): Promise<string[]> {
  if (!/^vitest\s/u.test(script) || /[;&|<>]/u.test(script))
    throw new Error(`Cannot exclude archived inputs from this test script: ${script}`)
  const { options } = parseCLI(script)
  const { vitestConfig } = await resolveConfig({ ...options, root: member })
  if ((vitestConfig.projects?.length ?? 0) > 0)
    throw new Error('Archived inputs require a single Vitest project')
  const args = [...vitestConfig.typecheck.exclude, '**/*.legacy/**'].flatMap(pattern => [
    '--typecheck.exclude',
    pattern,
  ])
  if (tier !== 'slow' && vitestConfig.typecheck.enabled === true) {
    if (vitestConfig.typecheck.checker !== 'tsc')
      throw new Error('Archived inputs require the supported tsc checker')
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
