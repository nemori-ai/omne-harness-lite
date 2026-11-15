import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { linkWorkspace } from '../../../src/deps/graph.ts'

const made: string[] = []

export function removeTemporaries(): void {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
}

export function temporaryDirectory(prefix: string): string {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
  made.push(path)
  return path
}

export function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=someone', '-c', 'user.email=someone@example.com', ...args],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

export function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

export function commit(root: string, message: string): string {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

export function repository(root: string = temporaryDirectory('loop-repo-')): string {
  git(root, 'init', '-q')
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  git(root, 'config', 'core.autocrlf', 'false')
  write(root, '.git/no-global-excludes', '')
  ignoreGlobalExcludes(root)
  write(root, 'README.md', 'repo\n')
  commit(root, 'init')
  return root
}

export function copyRepository(source: string): string {
  const root = temporaryDirectory('loop-repo-')
  cpSync(source, root, { recursive: true })
  ignoreGlobalExcludes(root)
  return root
}

function ignoreGlobalExcludes(root: string): void {
  git(root, 'config', 'core.excludesFile', join(root, '.git/no-global-excludes'))
}

const CANARY = fileURLToPath(new URL('./repo/', import.meta.url))

export function copyCanary(root: string): void {
  cpSync(CANARY, root, { recursive: true })
  const restore = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git') restore(full)
      } else if (entry.name.endsWith('.ts.txt')) renameSync(full, full.slice(0, -'.txt'.length))
    }
  }
  restore(root)
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
  linkWorkspace(root, join(root, 'node_modules'))
}
