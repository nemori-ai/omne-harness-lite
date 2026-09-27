import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { IDENTITY_TYPE_NAMES } from '@omne-harness-lite/identity-values'
import {
  collectSources,
  corePureImports,
  createIdentityDecisionInputs,
  IDENTITY_CHECK_INPUTS,
  identityAccountReferences,
  identityDecisionInputs,
  identityScopeColumns,
  noWallClock,
  runRules,
  type SourceFile,
} from '../src/index.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })
const root = fileURLToPath(new URL('../../../', import.meta.url))
const real = (path: string): SourceFile =>
  file(path, readFileSync(join(root, 'packages', path), 'utf8'))

// 独立列出节点范围，防止新增规则遗漏一个包而测试仍通过。
const purePackages = [
  'content-blocks',
  'asset-model',
  'model-profile',
  'call-accounts',
  'messages',
  'tool-definition',
  'loop-extension',
  'skill-package',
  'connector',
  'mcp-endpoint',
  'arrival-events',
  'model-response',
  'slash-command',
  'stream-assembly',
  'asset-evaluation',
]

describe('core-pure-imports', () => {
  it.each(purePackages)('%s 不导入 Cordis、kernel、storage 或非 core 插件', pkg => {
    for (const specifier of [
      '@deepseek-ai/cordis',
      '@omne-harness-lite/kernel-basis',
      '@omne-harness-lite/storage',
      '@omne-harness-lite/asset-governance',
    ]) {
      const source = file(`core/${pkg}/src/index.ts`, `import type { Value } from '${specifier}'`)
      expect(corePureImports.check([source])).toHaveLength(1)
    }
  })

  it('精确公开依赖与纯构件可用；不自动准许其他 core 包', () => {
    const good = [
      file(
        'core/content-blocks/src/index.ts',
        `import { parseAccountId } from '@omne-harness-lite/identity-values'
import schema from '@omne-harness-lite/identity-values/schema'
import Ajv from 'ajv/dist/2020.js'
import { parse } from './strict.ts'
import localSchema from '../schema/content-blocks.schema.json'`,
      ),
      file('core/asset-model/src/hash.ts', `import { createHash } from 'node:crypto'`),
      file(
        'core/asset-evaluation/src/index.ts',
        `import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createHash } from 'node:crypto'`,
      ),
      file(
        'core/stream-assembly/src/index.ts',
        `import { Buffer } from 'node:buffer'
import { ArrivalEnvelope } from '@omne-harness-lite/arrival-events'`,
      ),
      file('core/skill-package/src/parse.ts', `import { parseDocument } from 'yaml'`),
      file(
        'core/tool-definition/src/pattern.ts',
        `import { RegExpParser } from '@eslint-community/regexpp'`,
      ),
    ]
    expect(corePureImports.check(good)).toEqual([])
    expect(
      corePureImports.check([
        file(
          'core/content-blocks/src/x.ts',
          `import { createState } from '@omne-harness-lite/stream-assembly'`,
        ),
      ]),
    ).toHaveLength(1)
  })

  it('不经私有 src、dist、未登记子入口或相对路径穿透包边界', () => {
    for (const specifier of [
      '@omne-harness-lite/identity-values/src/values',
      '@omne-harness-lite/identity-values/dist/index.js',
      '@omne-harness-lite/identity-values/secret',
      '../../identity-values/src/index.ts',
      '../../../infra/clock/src/index.ts',
      '../schema/hidden.ts',
      'node:fs',
      'node:child_process',
    ])
      expect(
        corePureImports.check([
          file('core/content-blocks/src/x.ts', `export * from '${specifier}'`),
        ]),
      ).toHaveLength(1)
  })

  it('静态、重导出、类型导入、require、import()、转义字面量都查；计算说明符拒绝', () => {
    const source = file(
      'core/content-blocks/src/x.ts',
      [
        `import '@deepseek-ai/cordis'`,
        `export { Value } from '@omne-harness-lite/storage'`,
        `type T = import('@omne-harness-lite/kernel-basis').Value`,
        `const a = require('@omne-harness-lite/storage')`,
        `const b = import('@omne-harness-lite/storage')`,
        `import K = require('@omne-harness-lite/storage')`,
        String.raw`import '\u0040omne-harness-lite/storage'`,
        `const d = import(computed)`,
        `const e = require('node:' + name)`,
        `// import '@deepseek-ai/cordis'`,
        `const note = "import '@deepseek-ai/cordis'"`,
      ].join('\n'),
    )
    expect(corePureImports.check([source]).map(v => v.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('既有 kernel/storage 职责例外；产品测试不限制', () => {
    expect(
      corePureImports.check([
        file('core/kernel-basis/src/x.ts', `import { Context } from '@deepseek-ai/cordis'`),
        file('core/storage/src/x.ts', `import { Kysely } from 'kysely'`),
        file('core/content-blocks/tests/x.spec.ts', `import fs from 'node:fs'`),
      ]),
    ).toEqual([])
  })

  it('collectSources + CLI 真实临时包：坏依赖退出1，合法包退出0', () => {
    const scratch = join(root, 'tmp')
    mkdirSync(scratch, { recursive: true })
    const dir = mkdtempSync(join(scratch, 'core-rules-'))
    try {
      const src = join(dir, 'core/content-blocks/src')
      mkdirSync(src, { recursive: true })
      const path = join(src, 'index.ts')
      writeFileSync(path, `import { Context } from '@deepseek-ai/cordis'`)
      expect(runRules(collectSources(dir)).map(v => v.rule)).toContain('core-pure-imports')
      const cli = resolve(root, 'tools/ts-checks/src/cli.ts')
      const bad = spawnSync(process.execPath, ['--experimental-strip-types', cli, dir], {
        encoding: 'utf8',
      })
      expect(bad.status).toBe(1)
      expect(bad.stderr).toContain('[core-pure-imports]')
      writeFileSync(path, `import { parseAccountId } from '@omne-harness-lite/identity-values'`)
      const good = spawnSync(process.execPath, ['--experimental-strip-types', cli, dir], {
        encoding: 'utf8',
      })
      expect(good.status).toBe(0)
      expect(good.stdout).toContain('PASS:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('SC-OE-3 no-wall-clock', () => {
  it('Date.now、new Date()、performance.now 各有必红反例，并保留原真实扫描', () => {
    const source = file(
      'core/content-blocks/src/x.ts',
      `Date.now()
new Date( )
performance . now ( )`,
    )
    expect(noWallClock.check([source]).map(v => v.line)).toEqual([1, 2, 3])
    expect(
      noWallClock.check([
        file(
          source.path,
          `const d = new Date(issuedAt)
const note = 'new Date()'; // Date.now()
const t = clock.now()`,
        ),
        file('infra/clock/src/clock.ts', 'Date.now(); new Date(); performance.now()'),
        file('core/content-blocks/tests/x.spec.ts', 'new Date()'),
      ]),
    ).toEqual([])
  })
})

describe('identity SC-1 精确输入', () => {
  const path = 'assets/asset-governance/src/admission.ts'
  const rule = createIdentityDecisionInputs({
    ...IDENTITY_CHECK_INPUTS,
    decisionTargets: [{ path, functionName: 'canAccess' }],
  })

  it('规则输入消费公开身份类型清单，非第二份领域名单', () => {
    expect(IDENTITY_CHECK_INPUTS.identityTypeNames).toBe(IDENTITY_TYPE_NAMES)
    expect(Object.isFrozen(IDENTITY_CHECK_INPUTS.identityTypeNames)).toBe(true)
  })

  it('登记准入参数的物理品牌、嵌套成员、本地别名、具名import改名必红', () => {
    const source = file(
      path,
      `import type { HostName as Remote } from './physical.ts'
type Physical = Branded<string, 'FilePath'>
interface Basis { actor: TenantId; host: Remote; path: Physical }
export function canAccess(input: Basis): boolean { return true }`,
    )
    expect(rule.check([source])).toHaveLength(1)
    expect(rule.check([source])[0]?.message).toMatch(/HostName.*FilePath/)
  })

  it('身份/持有/效力输入合法；未点名的路径函数和组织结构谓词不受查', () => {
    const source = file(
      path,
      `export function canAccess(actor: TenantId, held: HoldingRecord, standing: MembershipStanding) { return true }
export function readFile(path: FilePath) { return path }
export function shareAncestor(parentOf: ParentSnapshot) { return true }`,
    )
    expect(rule.check([source])).toEqual([])
    expect(
      identityDecisionInputs.check([file(path, 'function readFile(path: FilePath) {}')]),
    ).toEqual([])
    expect(
      rule.check([
        file(path, `export function canAccess(input: { label: 'Path' }) { return true }`),
      ]),
    ).toEqual([])
  })

  it('品牌构造器改名不丢失物理品牌证据', () => {
    const source = file(
      path,
      `import type { Branded as Brand } from './brands.ts'
type Physical = Brand<string, 'FilePath'>
export function canAccess(path: Physical) { return true }`,
    )
    expect(rule.check([source])).toHaveLength(1)
    expect(rule.check([source])[0]?.message).toContain('FilePath')
  })

  it('@identityDecision 标注函数、箭头和方法同样查，不把注释字样当任意函数', () => {
    const source = file(
      path,
      `/** @identityDecision */
export function judge(host: HostName) { return true }
/** @identityDecision */
export const judgeArrow = (env: EnvironmentVariables) => true
class Guard {
  /** @identityDecision */
  judge(instance: RuntimeInstanceId) { return true }
}
// @identityDecision
function unrelated(path: FilePath) {}`,
    )
    expect(identityDecisionInputs.check([source])).toHaveLength(3)
  })

  it('注册目标/类型标注消失会红，身份与物理名字重叠输入拒绝', () => {
    expect(rule.check([file(path, 'export function renamed(actor: TenantId) {}')])).toHaveLength(1)
    expect(rule.check([])).toHaveLength(1)
    expect(rule.check([file(path, 'export function canAccess(actor) {}')])).toHaveLength(1)
    expect(() =>
      createIdentityDecisionInputs({
        ...IDENTITY_CHECK_INPUTS,
        identityTypeNames: ['TenantId'],
        physicalTypeNames: ['TenantId'],
      }),
    ).toThrow('重叠')
  })
})

describe('identity SC-2 账号记录', () => {
  const path = 'tenancy/account-identity/src/schema.ts'
  it('两个AccountId字段（含改名与品牌别名）必红；登录状态引用与合法账号记录不报', () => {
    const source = file(
      path,
      `import { type AccountId as Account } from '@omne-harness-lite/identity-values'
type LinkedAccount = OpaqueIdentifier<'AccountId'>
interface AccountRecord { id: Account; linked: LinkedAccount }
interface LoginStateRow { login: LoginStateId; account: AccountId }`,
    )
    expect(identityAccountReferences.check([source])).toHaveLength(1)
    expect(
      identityAccountReferences.check([
        file(path, 'interface AccountRecord { id: AccountId; identifier: LoginIdentifier }'),
      ]),
    ).toEqual([])
  })

  it('真实AccountRow原文通过；向string自身份记录添加一个typed引用必红', () => {
    const original = real(path)
    expect(identityAccountReferences.check([original])).toEqual([])
    const anchor = 'export interface AccountRow {'
    expect(original.text).toContain(anchor)
    const mutant = file(
      path,
      original.text.replace(anchor, `${anchor}\nreadonly linked: AccountId`),
    )
    expect(identityAccountReferences.check([mutant])).toHaveLength(1)
  })

  it('普通string聚类键语义不由类型语法检查证明', () => {
    expect(
      identityAccountReferences.check([
        file(path, 'interface AccountRow { account_id: string; arbitrary_cluster: string }'),
      ]),
    ).toEqual([])
  })
})

describe('identity SC-9 持久归属', () => {
  const path = 'core/asset-model/src/records.ts'
  it('optional、nullable、nullable本地别名成对列必红', () => {
    const source = file(
      path,
      `interface HoldingRecord { organization?: OrganizationId; tenant?: TenantId }
type HoldingRow = { organization: OrganizationId | null; tenant: TenantId | undefined }
type MaybeTenant = TenantId | null
interface HoldingTable { organization?: OrganizationId; tenant: MaybeTenant }`,
    )
    expect(identityScopeColumns.check([source])).toHaveLength(3)
  })

  it('合法ScopeLayerIdentity、两个互斥判别分支及不归属的读面不误报', () => {
    const source = file(
      path,
      `interface HoldingRecord { scope: ScopeLayerIdentity }
type OtherRow = { layer: 'organization'; organization: OrganizationId } | { layer: 'tenant'; tenant: TenantId }
interface SelectionReading { organization?: OrganizationId; tenant?: TenantId }
interface MemberRecord { organization: OrganizationId; tenant: TenantId }`,
    )
    expect(identityScopeColumns.check([source])).toEqual([])
  })

  it('@scopedRecord明确标注持久形状；测试免查', () => {
    const text = `/** @scopedRecord */
interface StoredObject { organization?: OrganizationId; tenant?: TenantId }`
    expect(identityScopeColumns.check([file(path, text)])).toHaveLength(1)
    expect(identityScopeColumns.check([file('core/asset-model/tests/x.spec.ts', text)])).toEqual([])
  })
})
