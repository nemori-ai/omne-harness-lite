// 用例共用的假仓库、假执行器与成员。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'
import type { ReadingConfig } from '../src/config.ts'
import type { ChangedMember } from '../src/members.ts'
import type { Command, Executor, Outcome } from '../src/process.ts'
import type { Repo } from '../src/repo.ts'

export const scratch = (): string => mkdtempSync(`${tmpdir()}/pqw-adapter-test-`)

export const member = (path: string, test = true): WorkspaceMember => ({
  path,
  name: `@omne-harness/${path.split('/').pop() ?? path}`,
  scripts: test ? { test: 'vitest run' } : {},
  dependencies: [],
})

export const changedMember = (
  path: string,
  overrides: Partial<ChangedMember> = {},
): ChangedMember => ({
  path,
  name: `@omne-harness/${path.split('/').pop() ?? path}`,
  testable: true,
  files: [`${path}/src/a.ts`],
  scopes: [`${path}/`],
  ...overrides,
})

export const CONFIG: ReadingConfig = {
  cyclomatic: { warn: 10, alert: 12 },
  crap: { warn: 10, alert: 12 },
  assertPattern: '^(expect|assert)',
}

export function fakeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    root: '/repo',
    mergeBase: base => `${base}-merge-base`,
    head: () => 'abcdef1234567890',
    changedFiles: () => [],
    changedMatching: () => [],
    show: () => undefined,
    read: () => undefined,
    dirty: () => false,
    members: () => [],
    ...overrides,
  }
}

/** 值后面的参数：`--json <路径>` 取路径。 */
export const valueOf = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

/** 记下每次调用；`respond` 决定返回什么，也可以顺手写出被调方该写的文件。 */
export function recorder(
  respond: (command: Command) => Partial<Outcome> | Promise<Partial<Outcome>> = () => ({}),
) {
  const calls: Command[] = []
  const exec: Executor = async command => {
    calls.push(command)
    return { code: 0, stdout: '', stderr: '', ...(await respond(command)) }
  }
  return { calls, exec }
}
