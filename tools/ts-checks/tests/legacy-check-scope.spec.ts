import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isLegacyDirectory, isLegacyFile } from '../src/core/check-scope.ts'
import { collectSources } from '../src/index.ts'
import { collectRepositorySources } from '../src/repository.ts'
import { collectMemberSources } from '../src/metrics/sources.ts'
import { listAcceptanceFiles } from '../src/acceptance/coverage.ts'
import { planCheck } from '../src/testing/scope.ts'
import { typecheckStep, type PlanFile } from '../src/testing/steps.ts'
import type { AffectedRules } from '../src/testing/config.ts'
import type { WorkspaceMember } from '../src/core/workspace.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'omne-legacy-scope-'))
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
  it('excludes directory suffixes, preserves similar names and file basenames', () => {
    expect(isLegacyDirectory('packages/nested.legacy/core')).toBe(true)
    expect(isLegacyFile('packages\\nested.legacy\\a.ts')).toBe(true)
    expect(isLegacyFile('tools/live/file.legacy')).toBe(false)
    expect(isLegacyDirectory('tools/old.legacy-not')).toBe(false)
  })

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

  it('static collectors skip nested archived directories and keep active violations', () => {
    const root = fixture()
    for (const path of [
      'packages/live/src/a.ts',
      'packages/nested.legacy/core/a.ts',
      'packages/similar.legacy-not/src/a.ts',
    ])
      put(root, path, 'export const value = 1\n')
    for (const path of [
      'packages/live/acceptance/PF-001.acceptance.ts',
      'packages/nested.legacy/core/acceptance/PF-001.acceptance.ts',
    ])
      put(root, path, '// covers: PF-001 S1\n')
    const expected = [
      'packages/live/acceptance/PF-001.acceptance.ts',
      'packages/live/src/a.ts',
      'packages/similar.legacy-not/src/a.ts',
    ]
    for (const collect of [collectSources, collectRepositorySources, collectMemberSources])
      expect(
        collect(root)
          .map(file => file.path)
          .sort(),
      ).toEqual(expected)
    expect(
      listAcceptanceFiles(root, {
        directory: 'acceptance',
        memberRoots: ['packages'],
        ownerRoles: [],
      }),
    ).toEqual(['packages/live/acceptance/PF-001.acceptance.ts'])
  })

  it('full executor uses filtered pnpm targets and propagates an active failure', () => {
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
    expect(typecheckStep(root, file)).not.toBe(0)
    expect(() => readFileSync(join(root, 'root-shortcut'))).toThrow()
    put(
      root,
      'tools/live/package.json',
      JSON.stringify({
        name: '@fixture/live',
        scripts: { typecheck: 'node -e "process.exit(0)"' },
      }),
    )
    expect(typecheckStep(root, file)).toBe(0)
  })
})
