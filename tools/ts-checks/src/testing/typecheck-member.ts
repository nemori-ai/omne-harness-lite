import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasArchivedDirectories, scopedProject, typecheckProject } from './archive-project.ts'

export function typecheckMember(member: string): number {
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
  const script = manifest.scripts.typecheck
  const invoke = (args: string[]): number => {
    const result = spawnSync('pnpm', ['run', 'typecheck', ...args], {
      cwd: member,
      stdio: 'inherit',
    })
    if (result.error !== undefined) throw result.error
    return result.status ?? 1
  }
  const project = typecheckProject(script, member)
  if (project === undefined) {
    if (hasArchivedDirectories(member))
      throw new Error(`Cannot exclude archived inputs from this typecheck script: ${script}`)
    return invoke([])
  }
  const temporary = mkdtempSync(join(tmpdir(), 'omne-typecheck-scope-'))
  try {
    const scoped = scopedProject(project, join(temporary, 'tsconfig.json'))
    if (scoped.path === project) return invoke([])
    if (scoped.activeFiles === 0) {
      console.log(`Typecheck skipped: no active compiler roots in ${member}`)
      return 0
    }
    return invoke(['--project', scoped.path])
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = typecheckMember(process.cwd())
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
