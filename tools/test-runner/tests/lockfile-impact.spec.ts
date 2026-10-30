// 锁文件影响面：两份 pnpm-lock.yaml 的差异落到哪些成员上。守的是三种结论的边界——
// 能映射的只命中对应成员，判不准的（顶层设置、根依赖、解析失败、解释不了的引用）全量，等价的无影响。
// 另用仓库真实的锁文件核对解析器认得 pnpm 9 实际写出的格式、importer 与成员清单对得上。解析器自身的用例在 pnpm-lockfile.spec.ts。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fileTree, listWorkspaceMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { readTestRunsConfig } from '../src/testing/config.ts'
import { lockfileImpact } from '../src/testing/lockfile-impact.ts'
import { parseLockfileYaml } from '../src/testing/pnpm-lockfile.ts'
import {
  ALIAS_DEPENDENCY,
  BASE,
  DANGLING_REFERENCE,
  EQUIVALENT,
  MEMBERS,
  ONE_MEMBER_DEPENDENCY,
  OVERRIDES,
  ROOT_DEPENDENCY,
  SHARED_UPGRADE,
  UNPARSABLE,
} from './fixtures/lockfiles.ts'

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

describe('lockfileImpact', () => {
  it('只改一个成员的依赖：只命中那个成员，并记下它新依赖的包', () => {
    const result = lockfileImpact(BASE, ONE_MEMBER_DEPENDENCY, MEMBERS)
    expect(result).toEqual({
      kind: 'members',
      members: [{ path: 'packages/c', importerChanged: true, packages: ['extra@1.0.0'] }],
      reason: expect.stringContaining('lockfile 改动按 importer 映射到 1 个成员：packages/c'),
    })
  })

  it('只升级一个被两个成员依赖的包：直接依赖的与隔一跳依赖的都命中，不相关的不命中', () => {
    const result = lockfileImpact(BASE, SHARED_UPGRADE, MEMBERS)
    expect(result).toEqual({
      kind: 'members',
      members: [
        {
          path: 'packages/a',
          importerChanged: false,
          packages: ['leaf@1.0.0', 'leaf@1.1.0', 'mid@1.0.0'],
        },
        { path: 'packages/b', importerChanged: true, packages: ['leaf@1.0.0', 'leaf@1.1.0'] },
      ],
      reason: expect.stringContaining('映射到 2 个成员：packages/a、packages/b'),
    })
  })

  it('去掉一个包时按基线的依赖图找成员：删依赖的成员命中', () => {
    const result = lockfileImpact(ONE_MEMBER_DEPENDENCY, BASE, MEMBERS)
    expect(result.kind).toBe('members')
    if (result.kind === 'members')
      expect(result.members).toEqual([
        { path: 'packages/c', importerChanged: true, packages: ['extra@1.0.0'] },
      ])
  })

  it('顶层 overrides 有变化：全量，原因写出键名', () => {
    expect(lockfileImpact(BASE, OVERRIDES, MEMBERS)).toEqual({
      kind: 'full',
      reason: 'lockfile 顶层 overrides 有变化，判为全量',
    })
  })

  it('lockfileVersion 有变化：全量', () => {
    const head = BASE.replace("lockfileVersion: '9.0'", "lockfileVersion: '10.0'")
    expect(lockfileImpact(BASE, head, MEMBERS)).toMatchObject({
      kind: 'full',
      reason: expect.stringContaining('顶层 lockfileVersion 有变化'),
    })
  })

  it('任一份解析失败：全量，原因写明哪一份、哪一行', () => {
    expect(lockfileImpact(BASE, UNPARSABLE, MEMBERS)).toMatchObject({
      kind: 'full',
      reason: expect.stringMatching(/^HEAD 的 pnpm-lock\.yaml 解析失败（第 \d+ 行：/u),
    })
    expect(lockfileImpact(UNPARSABLE, BASE, MEMBERS)).toMatchObject({
      kind: 'full',
      reason: expect.stringContaining('基线的 pnpm-lock.yaml 解析失败'),
    })
  })

  it('两份等价（顺序、空行不同）：无影响', () => {
    expect(EQUIVALENT).not.toBe(BASE)
    expect(lockfileImpact(BASE, EQUIVALENT, MEMBERS)).toEqual({
      kind: 'unchanged',
      reason: '两份 pnpm-lock.yaml 解析后等价',
    })
  })

  it('根 importer 的依赖有变化：全量', () => {
    expect(lockfileImpact(BASE, ROOT_DEPENDENCY, MEMBERS)).toEqual({
      kind: 'full',
      reason: '根 importer（.）的依赖有变化，判为全量',
    })
  })

  it('变化的包被根 importer 间接依赖：全量，原因写出那个包', () => {
    // 根的 tooling 改为依赖 leaf，再升级 leaf：根 importer 条目不变，但它经 tooling 依赖了变化的包。
    const base = BASE.replace(
      '  tooling@1.0.0: {}',
      '  tooling@1.0.0:\n    dependencies:\n      leaf: 1.0.0',
    )
    const head = SHARED_UPGRADE.replace(
      '  tooling@1.0.0: {}',
      '  tooling@1.0.0:\n    dependencies:\n      leaf: 1.1.0',
    )
    expect(lockfileImpact(base, head, MEMBERS)).toMatchObject({
      kind: 'full',
      reason: expect.stringMatching(/^根 importer（\.）依赖的 .*leaf@1\.1\.0.* 有变化，判为全量$/u),
    })
  })

  it('别名依赖按 version 里的 名字@版本 找 snapshot：改了被别名的包，命中用别名的成员', () => {
    const head = ALIAS_DEPENDENCY.replace(
      '  other@2.0.0(peer@3.0.0):\n',
      '  other@2.0.0(peer@3.0.0):\n    optional: true\n',
    )
    expect(head).not.toBe(ALIAS_DEPENDENCY)
    expect(lockfileImpact(ALIAS_DEPENDENCY, head, MEMBERS)).toMatchObject({
      kind: 'members',
      members: [
        { path: 'packages/c', importerChanged: false, packages: ['other@2.0.0(peer@3.0.0)'] },
      ],
    })
  })

  it('受影响的 importer 不在成员清单里：全量', () => {
    const members = MEMBERS.filter(member => member.path !== 'packages/c')
    expect(lockfileImpact(BASE, ONE_MEMBER_DEPENDENCY, members)).toEqual({
      kind: 'full',
      reason: 'importer packages/c 不在成员清单里，判为全量',
    })
  })

  it('依赖引用了 snapshots 里没有的版本：全量，原因写出那条引用', () => {
    expect(lockfileImpact(BASE, DANGLING_REFERENCE, MEMBERS)).toEqual({
      kind: 'full',
      reason:
        'lockfile 改动解释不了（importer packages/b 依赖的 leaf@1.2.0 在 snapshots 里没有条目），判为全量',
    })
  })

  it('packages 里变化的包没有对应的 snapshot：全量', () => {
    // 两份都多一个没有 snapshot、没人依赖的包，HEAD 里它的 integrity 变了。
    const orphan = (integrity: string) =>
      BASE.replace(
        'snapshots:',
        `  orphan@1.0.0:
    resolution: {integrity: ${integrity}}

snapshots:`,
      )
    expect(lockfileImpact(orphan('sha512-o1'), orphan('sha512-o2'), MEMBERS)).toEqual({
      kind: 'full',
      reason:
        'lockfile 改动解释不了（packages 里变化的 orphan@1.0.0 在 snapshots 里没有条目），判为全量',
    })
  })

  it('变化的 snapshot 没有任何 importer 直接或间接依赖它：全量', () => {
    const orphan = (entry: string) =>
      BASE.replace(
        '  peer@3.0.0: {}',
        `  orphan@1.0.0: ${entry}

  peer@3.0.0: {}`,
      ).replace(
        'snapshots:',
        `  orphan@1.0.0:
    resolution: {integrity: sha512-o1}

snapshots:`,
      )
    expect(
      lockfileImpact(orphan('{}'), orphan('\n    dependencies:\n      peer: 3.0.0'), MEMBERS),
    ).toEqual({
      kind: 'full',
      reason:
        'lockfile 改动解释不了（变化的 orphan@1.0.0 没有任何 importer 直接或间接依赖它），判为全量',
    })
  })
})

describe('仓库真实的 pnpm-lock.yaml', () => {
  const text = readFileSync(resolve(ROOT, 'pnpm-lock.yaml'), 'utf8')
  const members = listWorkspaceMembers(fileTree(ROOT), readTestRunsConfig().affected.excludeRoots)

  it('解析器认得它的写法，自比等价', () => {
    expect(lockfileImpact(text, text, members)).toEqual({
      kind: 'unchanged',
      reason: '两份 pnpm-lock.yaml 解析后等价',
    })
  })

  it('每个 importer 都是成员清单里的成员或根', () => {
    const importers = parseLockfileYaml(text).get('importers')
    expect(importers).toBeInstanceOf(Map)
    if (!(importers instanceof Map)) return
    const known = new Set(members.map(member => member.path))
    const unknown = [...importers.keys()].filter(path => path !== '.' && !known.has(path))
    expect(unknown).toEqual([])
  })

  it('改一个 snapshot 条目时，每条依赖引用都能在 snapshots 里找到', () => {
    // 给 snapshots 段里第一个带 dependencies 的条目加一行：结论是哪种取决于谁依赖它，但不能是「解释不了」。
    const marker = /^(  '?[^\s].*'?:)\n(    dependencies:\n)/mu
    const start = text.indexOf('\nsnapshots:\n')
    expect(start).toBeGreaterThan(0)
    const tail = text.slice(start)
    expect(tail).toMatch(marker)
    const head = text.slice(0, start) + tail.replace(marker, '$1\n    cpu: [x64]\n$2')
    const result = lockfileImpact(text, head, members)
    expect(result.kind).not.toBe('unchanged')
    expect(result.reason).not.toMatch(/解析失败|解释不了/u)
  })
})
