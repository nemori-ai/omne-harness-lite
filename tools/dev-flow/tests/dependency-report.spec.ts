import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { CONSTRAINT_PATH } from '@omne-harness/repo-toolchain/arch/constraints'
import type { DependencyRow } from '@omne-harness/repo-toolchain/arch/dependencies'
import { createPackage } from '../src/package-template/create.ts'
import { scanPackages } from '../src/package-template/scan.ts'
import {
  removeTemporaries,
  repository,
  write,
} from '../../repo-toolchain/tests/fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

function checkout(): string {
  const root = repository()
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - apps/*\n')
  write(root, 'package.json', JSON.stringify({ engines: { node: '>=24 <25' } }))
  cpSync(
    // 根 tsconfig.base.json 只是指向共享预设的 extends；快照里直接放预设本身。
    fileURLToPath(new URL('../../repo-config/tsconfig.base.json', import.meta.url)),
    join(root, 'tsconfig.base.json'),
  )
  write(root, 'docs/architecture/accepted.md', '# Accepted\n')
  return root
}

function constraints(
  root: string,
  rules: readonly string[],
  extra: Record<string, unknown> = {},
): void {
  write(
    root,
    CONSTRAINT_PATH,
    JSON.stringify({
      schemaVersion: 1,
      domains: [],
      roles: [],
      rules: rules.map(id => ({ id, source: 'docs/architecture/accepted.md' })),
      ...extra,
    }),
  )
}

function member(
  root: string,
  group: string,
  name: string,
  variant: 'module' | 'service-provider' = 'module',
): string {
  createPackage({ root, group, name, variant, write: true })
  return `packages/${group}/${name}`
}

function rows(root: string, path: string): readonly DependencyRow[] {
  const scan = scanPackages(root, [path])[0]
  if (scan === undefined) throw new Error(`missing member ${path}`)
  return scan.dependencies
}

function located(row: DependencyRow) {
  return {
    rule: row.rule,
    state: row.state,
    age: row.age,
    member: row.member,
    targetMember: row.targetMember,
    key: row.key,
    reason: row.reason,
    sites: row.sites.map(site => ({ path: site.path, line: site.line })),
  }
}

describe('dependency rows', () => {
  it('reports an illegal IC-5 edge on the scanned member', () => {
    const root = checkout()
    const authorization = member(root, 'identity', 'authorization')
    member(root, 'infra', 'storage-sql')
    write(
      root,
      `${authorization}/src/index.ts`,
      "import { SqlStorage } from '@omne-harness/storage-sql'\nvoid SqlStorage\n",
    )
    write(root, 'packages/infra/storage-sql/src/index.ts', 'export class SqlStorage {}\n')
    constraints(root, ['IC-5'], {
      roles: [
        {
          id: 'authorization',
          paths: [`${authorization}/src/**`],
          layer: 'policy',
          domains: [],
          status: 'adopted',
          source: 'docs/architecture/accepted.md',
        },
        {
          id: 'sql',
          paths: ['packages/infra/storage-sql/src/**'],
          layer: 'storage-adapter',
          domains: [],
          status: 'adopted',
          source: 'docs/architecture/accepted.md',
        },
      ],
    })
    expect(
      rows(root, authorization)
        .filter(row => row.rule === 'IC-5')
        .map(located),
    ).toEqual([
      {
        rule: 'IC-5',
        state: 'deviation',
        age: 'unjudged',
        member: authorization,
        targetMember: 'packages/infra/storage-sql',
        key: '@omne-harness/storage-sql#SqlStorage',
        reason: '非装配消费者引用私有入口或提供者实现，BASE无精确符号同提交例外',
        sites: [{ path: `${authorization}/src/index.ts`, line: 1 }],
      },
    ])
  })

  it('reports a cycle hidden by a cordis subpath and a resolved relative import', () => {
    const root = checkout()
    const sdk = member(root, 'access', 'sdk')
    const entry = member(root, 'access', 'server-entry', 'service-provider')
    write(
      root,
      `${sdk}/src/index.ts`,
      "import { route } from '@omne-harness/server-entry/cordis'\nexport const client = route\n",
    )
    write(root, `${entry}/src/cordis.ts`, 'export const route = 1\n')
    write(
      root,
      `${entry}/src/internal.ts`,
      "import { client } from '../../sdk/src/index.ts'\nexport const inbound = client\n",
    )
    const cycle = rows(root, sdk).find(row => row.rule === 'member-cycle')
    expect(cycle).toMatchObject({
      rule: 'member-cycle',
      state: 'deviation',
      member: sdk,
      targetMember: entry,
      reason: `成员之间成环：${sdk}、${entry}`,
    })
    expect(cycle?.sites).toEqual([
      { path: `${sdk}/src/index.ts`, line: 1 },
      { path: `${entry}/src/internal.ts`, line: 1 },
    ])
  })

  it('reports a type-only workspace import that has no declaration', () => {
    const root = checkout()
    const sdk = member(root, 'access', 'sdk')
    const contract = member(root, 'access', 'public-contract')
    write(root, `${contract}/src/index.ts`, 'export interface Value { readonly id: string }\n')
    write(
      root,
      `${sdk}/src/index.ts`,
      "import type { Value } from '@omne-harness/public-contract'\nexport type Alias = Value\n",
    )
    expect(rows(root, sdk).filter(row => row.rule === 'undeclared-dependency')).toEqual([
      {
        id: JSON.stringify(['undeclared-dependency', sdk, '@omne-harness/public-contract']),
        rule: 'undeclared-dependency',
        state: 'deviation',
        age: 'unjudged',
        member: sdk,
        targetMember: contract,
        key: '@omne-harness/public-contract',
        reason:
          '源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明',
        expected: 'dependencies、peerDependencies 或 devDependencies',
        sites: [{ path: `${sdk}/src/index.ts`, line: 1 }],
        relation: expect.objectContaining({
          specifier: '@omne-harness/public-contract',
          symbol: 'Value',
          type: true,
          member: sdk,
          target: { kind: 'workspace', member: contract },
        }),
      },
    ])
  })

  it('keeps an exact import exception and still deviates on a different symbol', () => {
    const root = checkout()
    const session = member(root, 'session', 'session')
    const sql = member(root, 'storage', 'storage-sql')
    write(root, `${sql}/src/index.ts`, 'export class SqlStorage {}\n')
    write(
      root,
      `${session}/src/index.ts`,
      "import { readCredentialBindingIn, writeCredentialBindingIn } from '@omne-harness/storage-sql'\nvoid readCredentialBindingIn\nvoid writeCredentialBindingIn\n",
    )
    write(root, `${session}/SPEC.md`, '# Session\n\n## transaction-read\n\nSame commit.\n')
    constraints(root, ['IC-5'], {
      roles: [
        {
          id: 'session',
          paths: [`${session}/src/**`],
          layer: 'policy',
          domains: [],
          status: 'adopted',
          source: 'docs/architecture/accepted.md',
        },
        {
          id: 'sql',
          paths: [`${sql}/src/**`],
          layer: 'storage-adapter',
          domains: [],
          status: 'adopted',
          source: 'docs/architecture/accepted.md',
        },
      ],
      importExceptions: [
        {
          id: 'tx-read-sample',
          member: session,
          target: sql,
          symbols: ['readCredentialBindingIn'],
          sharedStorage: 'credential-binding',
          source: `${session}/SPEC.md#transaction-read`,
        },
      ],
    })
    const ic5 = rows(root, session).filter(row => row.rule === 'IC-5')
    expect(ic5).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'IC-5',
          state: 'converged',
          member: session,
          targetMember: sql,
          key: '@omne-harness/storage-sql#readCredentialBindingIn',
          reason:
            '静态例外：docs/architecture/constraints.json packages/session/session/SPEC.md#transaction-read；共同存储 credential-binding，事务行为仍需证据',
        }),
        expect.objectContaining({
          rule: 'IC-5',
          state: 'deviation',
          member: session,
          targetMember: sql,
          key: '@omne-harness/storage-sql#writeCredentialBindingIn',
          reason: '非装配消费者引用私有入口或提供者实现，BASE无精确符号同提交例外',
        }),
      ]),
    )
  })

  it('leaves a role-less workspace import unknown', () => {
    const root = checkout()
    const authorization = member(root, 'identity', 'authorization')
    member(root, 'infra', 'storage-sql')
    write(
      root,
      `${authorization}/src/index.ts`,
      "import { SqlStorage } from '@omne-harness/storage-sql'\nvoid SqlStorage\n",
    )
    write(root, 'packages/infra/storage-sql/src/index.ts', 'export class SqlStorage {}\n')
    constraints(root, ['IC-5', 'IC-1'])
    const ic5 = rows(root, authorization).filter(row => row.rule === 'IC-5')
    expect(ic5).toEqual([
      expect.objectContaining({
        rule: 'IC-5',
        state: 'unknown',
        member: authorization,
        targetMember: 'packages/infra/storage-sql',
        reason: '没有采用的非装配入口责任；不能给 apps 或候选入口通用豁免',
      }),
    ])
    expect(ic5.some(row => row.state === 'deviation' || row.state === 'converged')).toBe(false)
  })

  it('keeps the IC-4 skip for packages/core/kernel-basis and still flags another package root', () => {
    const root = checkout()
    const basis = member(root, 'core', 'kernel-basis')
    const widget = member(root, 'util', 'widget')
    const cordis = "import { Service } from '@deepseek-ai/cordis'\nexport const marker = Service\n"
    write(root, `${basis}/src/index.ts`, cordis)
    write(root, `${widget}/src/index.ts`, cordis)
    constraints(root, ['IC-4'])
    expect(rows(root, basis).some(row => row.rule === 'IC-4' && row.state === 'deviation')).toBe(
      false,
    )
    const flagged = rows(root, widget)
      .filter(row => row.rule === 'IC-4' && row.state === 'deviation')
      .map(located)
    const expected = {
      rule: 'IC-4',
      state: 'deviation',
      age: 'unjudged',
      member: widget,
      targetMember: undefined,
      key: '@deepseek-ai/cordis#Service',
      reason: `公开根 ${widget}/src/index.ts 的源码依赖闭包引入 Cordis 绑定`,
      sites: [{ path: `${widget}/src/index.ts`, line: 1 }],
    }
    expect(flagged).toEqual([expected])
  })
})
