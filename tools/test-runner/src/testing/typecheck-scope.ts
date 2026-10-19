// 类型检查由 turbo 直接运行成员的 `typecheck` 脚本，嵌套归档目录的排除写在成员的 tsconfig 里（`exclude`）。
// 这里在运行前核对排除确实生效：成员自己的 `exclude` 盖掉了模板给的那条，或者 include 指到成员目录外的
// 归档目录，编译根里就会混进归档文件。查到就报错并点名，不悄悄改写成员的配置。只解析配置，不跑 tsc。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  hasArchivedDirectories,
  scopedProject,
  typecheckProject,
} from '@omne-harness/repo-toolchain/archive/archive-project'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

function typecheckScript(member: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(member, 'package.json'), 'utf8'))
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('scripts' in manifest) ||
    typeof manifest.scripts !== 'object' ||
    manifest.scripts === null ||
    !('typecheck' in manifest.scripts) ||
    typeof manifest.scripts.typecheck !== 'string'
  )
    throw new Error(`Missing declared typecheck script: ${member}`)
  return manifest.scripts.typecheck
}

/** 一个成员的问题；没有问题时为 undefined。`scratch` 放核对时生成的临时配置。 */
export function typecheckScopeProblem(member: string, scratch: string): string | undefined {
  const script = typecheckScript(member)
  const project = typecheckProject(script, member)
  if (project === undefined)
    return hasArchivedDirectories(member)
      ? `Cannot exclude archived inputs from this typecheck script: ${script}`
      : undefined
  const scoped = scopedProject(project, join(scratch, 'tsconfig.json'))
  if (scoped.path === project || scoped.path === join(project, 'tsconfig.json')) return undefined
  return `Archived files are compiler roots; exclude them in ${project}`
}

/** 计划里的成员逐个核对；有问题就一次报出全部，不运行类型检查。 */
export function checkTypecheckScopes(root: string, members: readonly WorkspaceMember[]): void {
  const problems: string[] = []
  for (const member of members) {
    const scratch = mkdtempSync(join(tmpdir(), 'omne-typecheck-scope-'))
    try {
      const problem = typecheckScopeProblem(join(root, member.path), scratch)
      if (problem !== undefined) problems.push(`${member.path}: ${problem}`)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'))
}
