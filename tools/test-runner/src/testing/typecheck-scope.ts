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
