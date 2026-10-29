import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planCheck } from '../src/testing/scope.ts'
import { typecheckStep, type PlanFile } from '../src/testing/steps.ts'
import type { AffectedRules } from '../src/testing/config.ts'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-legacy-scope-')))
  roots.push(root)
  return root
}
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
const rules: AffectedRules = {
  excludeRoots: [],
  globalPaths: ['package.json'],
  readers: [],
  memberDocuments: [],
  pythonPaths: [],
  residentPaths: ['docs/**'],
  residentBuild: [],
}
const member = (path: string, name: string, dependencies: string[] = []): WorkspaceMember => ({
  path,
  name,
  dependencies,
  scripts: { build: 'build', typecheck: 'check', test: 'test', acceptance: 'acceptance' },
})
const members = [
  member('tools/live', '@fixture/live', ['@fixture/old']),
  member('packages/old.legacy/core', '@fixture/old'),
  member('packages.legacy/unused', '@fixture/unused'),
  member('tools/old.legacy-not', '@fixture/similar'),
]

describe('legacy check boundaries', () => {
  it.each([true, false])('full=%s retains active checks and only required legacy builds', full => {
    const plan = planCheck(['unknown.txt'], members, rules, new Set(), full)
    expect(plan.mode).toBe('full')
    expect(plan.typecheck).toEqual(['tools/live', 'tools/old.legacy-not'])
    expect(plan.test).toEqual(plan.typecheck)
    expect(plan.acceptance).toEqual(plan.typecheck)
    // 退役成员不进构建清单；在役成员的上游由 turbo 构建。
    expect(plan.build).toEqual([
      { path: 'tools/live', reason: 'selected' },
      { path: 'tools/old.legacy-not', reason: 'selected' },
    ])
  })

  it('archived changes do not trigger unknown full fallback or Python traversal', () => {
    const plan = planCheck(
      ['packages.legacy/a.ts', 'tools/nested.legacy/package.json'],
      members,
      rules,
      new Set(),
    )
    expect(plan.mode).toBe('scoped')
    expect(plan.files.map(file => file.category)).toEqual(['excluded', 'excluded'])
    expect([plan.build, plan.typecheck, plan.test, plan.acceptance]).toEqual([[], [], [], []])
    expect(plan.python.run).toBe(false)
    expect(() =>
      planCheck(
        [],
        members,
        {
          ...rules,
          readers: [{ paths: ['docs/**'], members: ['tools/missing'], why: 'fixture' }],
        },
        new Set(),
      ),
    ).toThrow('不存在的成员')
  })

  it('full executor uses filtered turbo targets and propagates an active failure', () => {
    const root = fixture()
    put(root, 'pnpm-workspace.yaml', 'packages:\n  - tools/*\n  - packages.legacy/*\n')
    put(
      root,
      'tools/live/package.json',
      JSON.stringify({
        name: '@fixture/live',
        scripts: { typecheck: 'node -e "process.exit(7)"' },
      }),
    )
    put(
      root,
      'packages.legacy/old/package.json',
      JSON.stringify({ name: '@fixture/old', scripts: { typecheck: 'node -e "process.exit(0)"' } }),
    )
    put(
      root,
      'package.json',
      JSON.stringify({
        private: true,
        // turbo 要读被检查仓库根的 packageManager 才能解析 workspace。
        packageManager: 'pnpm@10.28.1',
        scripts: { typecheck: "node -e \"require('fs').writeFileSync('root-shortcut', 'wrong')\"" },
      }),
    )
    const plan = planCheck(
      [],
      [member('tools/live', '@fixture/live'), member('packages.legacy/old', '@fixture/old')],
      rules,
      new Set(),
      true,
    )
    const file: PlanFile = { head: '', dirty: false, base: { ref: '', mergeBase: '' }, plan }
    const budget = {
      workers: 2,
      machine: { cores: 2, idleFraction: 1, freeMemoryMiB: 4096 },
      source: 'sampled' as const,
    }
    expect(typecheckStep(root, file, budget)).not.toBe(0)
    expect(() => readFileSync(join(root, 'root-shortcut'))).toThrow()
    put(
      root,
      'tools/live/package.json',
      JSON.stringify({
        name: '@fixture/live',
        scripts: { typecheck: 'node -e "process.exit(0)"' },
      }),
    )
    expect(typecheckStep(root, file, budget)).toBe(0)
  })
})
