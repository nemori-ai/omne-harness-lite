// offer-expiry 消费者（SC-OE-1/2）、凭据材料（SC-CV-1）、注册组合（S-5）、清除链解析（OG S-42）与存储边界（N-2）：
// 内存夹具两向自测，加真实源码的变异核对。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  noDialectBypass,
  ogS42DynamicResolve,
  scCv1,
  scOe1,
  scOe2,
  terminalOutcomeClosed,
  type SourceFile,
} from '../src/index.ts'

const OG = 'tenancy/organization-governance/src/'
const AI = 'tenancy/account-identity/src/'
const AR = 'tenancy/account-registration/src/'
const file = (path: string, text: string): SourceFile => ({ path, text })
const real = (path: string): SourceFile =>
  file(path, readFileSync(new URL(`../../../packages/${path}`, import.meta.url), 'utf8'))

describe('sc-oe-1', () => {
  it('持久记录类型（*Record／*Row／*Table）以 OfferState 为字段 ⇒ 报出', () => {
    const bad = file(
      `${OG}records.ts`,
      [
        'export interface InvitationRecord {',
        '  readonly id: InvitationId',
        '  readonly state: OfferState', // 3
        '}',
        'type OfferRow = { settled: OfferState | null }', // 5
        'export interface InvitationTable extends Base<X> {',
        '  state: OfferState', // 7
        '}',
      ].join('\n'),
    )
    expect(scOe1.check([bad]).map(v => v.line)).toEqual([3, 5, 7])
  })

  it('合规：记录只存 SettledState | null；读面类型带 OfferState 不算；offer-expiry 自身不查', () => {
    const clean = file(
      `${OG}types.ts`,
      [
        'export interface InvitationRecord { readonly settled: SettledState | null }',
        'export interface InvitationReading { readonly state: OfferState }',
        'function invitationState(record: InvitationRecord): OfferState | "unavailable" { return x }',
      ].join('\n'),
    )
    const owner = file('core/offer-expiry/src/offer.ts', 'interface StateRecord { s: OfferState }')
    expect(scOe1.check([clean, owner])).toEqual([])
  })

  it('变异核对：真实的 OG records.ts 原文无违反；把 settled 改成 OfferState ⇒ 报出', () => {
    const original = real(`${OG}records.ts`)
    expect(scOe1.check([original, real(`${OG}types.ts`)])).toEqual([])
    const anchor = 'readonly settled: SettledState | null'
    expect(original.text).toContain(anchor)
    const mutated = file(
      original.path,
      original.text.replace(anchor, 'readonly settled: OfferState | null'),
    )
    expect(scOe1.check([mutated])).toHaveLength(1)
  })
})

describe('sc-oe-2', () => {
  it('接受路径里对派生状态逐值比较（=== 与 case，含嵌套回调）⇒ 报出', () => {
    const bad = file(
      `${OG}offers.ts`,
      [
        'async function acceptInvitation(deps: Deps, a: unknown): Promise<Outcome<T, F>> {',
        '  return deps.storage.write(async tx => {',
        "    if (state === 'expired') return fail('offerExpired')", // 3
        "    if ('withdrawn' === state) return fail('offerWithdrawn')", // 4
        '    switch (state) {',
        "      case 'accepted':", // 6
        "        return fail('alreadyAccepted')",
        '    }',
        '  })',
        '}',
        'class Offers {',
        '  async acceptAffiliationRequest(t: unknown): Promise<X> {',
        "    if (state !== 'pending') return fail('x')", // 13
        '  }',
        '}',
      ].join('\n'),
    )
    expect(scOe2.check([bad]).map(v => v.line)).toEqual([3, 4, 6, 13])
  })

  it("合规：接受路径只经 acceptable()、比较 'unavailable'；撤回路径按状态分派不在范围；写 settled 不是比较", () => {
    const clean = file(
      `${OG}offers.ts`,
      [
        'async function acceptInvitation(deps: Deps): Promise<X> {',
        "  if (state === 'unavailable') return fail('unavailable')",
        "  if (!acceptable(state)) return fail('offerNoLongerValid')",
        "  await d.updateTable('invitation').set({ settled: 'accepted' }).execute()",
        '}',
        'function withdrawStep(state: OfferState): WithdrawStep {',
        '  switch (state) {',
        "    case 'pending':",
        "      return 'write'",
        '  }',
        '}',
      ].join('\n'),
    )
    expect(scOe2.check([clean])).toEqual([])
  })

  it('变异核对：真实的 OG offers.ts 原文无违反；把 acceptable() 换成逐值比较 ⇒ 报出', () => {
    const original = real(`${OG}offers.ts`)
    expect(scOe2.check([original])).toEqual([])
    const anchor = "if (!acceptable(state)) return fail('offerNoLongerValid')"
    expect(original.text.split(anchor)).toHaveLength(3)
    const mutated = file(
      original.path,
      original.text.replaceAll(
        anchor,
        "if (state === 'expired') return fail('offerNoLongerValid')",
      ),
    )
    expect(scOe2.check([mutated])).toHaveLength(2)
  })
})

describe('sc-cv-1', () => {
  it('CV 包之外对材料值做成员访问、正则解析、JSON.parse ⇒ 报出', () => {
    const bad = file(
      `${AI}accounts.ts`,
      [
        'let material: CredentialMaterial | undefined',
        "const [scheme] = material.split('$')", // 2
        'const salt = snapshot.material.slice(0, 8)', // 3
        'const n = row.credential_material.length', // 4
        "const p = (row.credential_material as CredentialMaterial).split('$')", // 5
        'const ok = /^scrypt\\$/.test(material)', // 6
        'const parsed = JSON.parse(snapshot.credential_material)', // 7
        'const first = material[0]', // 8
      ].join('\n'),
    )
    expect(scCv1.check([bad]).map(v => v.line)).toEqual([2, 3, 4, 5, 8, 6, 7])
  })

  it('合规：品牌断言、原样存取与传递；CV 包自己解析材料不算', () => {
    const clean = file(
      `${AI}records.ts`,
      [
        'return { kind: "live", accountId, material: row.credential_material as CredentialMaterial }',
        'await credentials.verify(snapshot.material, presented)',
        '.values({ credential_material: material })',
        'readonly material: CredentialMaterial',
      ].join('\n'),
    )
    const cv = file(
      'tenancy/credential-verification/src/scrypt.ts',
      "const parts = material.split('$')",
    )
    expect(scCv1.check([clean, cv])).toEqual([])
  })

  it('变异核对：真实的 AI 源码原文无违反；在 logins.ts 里拆材料 ⇒ 报出', () => {
    const names = ['accounts.ts', 'logins.ts', 'records.ts', 'schema.ts']
    expect(scCv1.check(names.map(n => real(`${AI}${n}`)))).toEqual([])
    const original = real(`${AI}logins.ts`)
    const anchor = 'snapshot.credential_material as CredentialMaterial,'
    expect(original.text).toContain(anchor)
    const mutated = file(
      original.path,
      original.text.replace(
        anchor,
        `${anchor}\n        snapshot.credential_material.split('$')[0],`,
      ),
    )
    expect(scCv1.check([mutated])).toHaveLength(1)
  })
})

describe('terminal-outcome-closed', () => {
  const constant = [
    'export const TERMINAL_OUTCOMES = [',
    "  'registered',",
    "  'identifier-taken',",
    "  'credential-rejected',",
    "  'interrupted',",
    '] as const',
    'export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]',
  ].join('\n')

  it('合规：恰四值；返回 TerminalOutcome 的函数只返回四值；嵌套回调返回别的字面量不算', () => {
    const impl = file(
      `${AR}register.ts`,
      [
        'class Registration {',
        '  async register(id: unknown, c: unknown): Promise<TerminalOutcome> {',
        "    const step = await withStorage(async () => { return 'ok' })",
        "    if (step !== 'ok') return 'interrupted'",
        "    return 'registered'",
        '  }',
        '}',
        "function helper(): 'ok' | 'no' { return 'no' }",
      ].join('\n'),
    )
    expect(terminalOutcomeClosed.check([file(`${AR}index.ts`, constant), impl])).toEqual([])
  })

  it('第五个值、断言、常量多一值或换了值、类型另加成员 ⇒ 报出', () => {
    const fifth = file(
      `${AR}register.ts`,
      [
        'async function register(id: unknown): Promise<TerminalOutcome> {',
        "  if (x) return 'failed'", // 2
        "  return 'unknown' as TerminalOutcome", // 3
        '}',
      ].join('\n'),
    )
    const found = terminalOutcomeClosed.check([file(`${AR}index.ts`, constant), fifth])
    // 第 3 行两处：断言本身，以及它塞进来的第五个值
    expect(found.map(v => v.line).sort()).toEqual([2, 3, 3])

    const widened = constant
      .replace("'interrupted',", "'interrupted',\n  'other',")
      .replace('(typeof TERMINAL_OUTCOMES)[number]', '(typeof TERMINAL_OUTCOMES)[number] | string')
    expect(terminalOutcomeClosed.check([file(`${AR}index.ts`, widened)])).toHaveLength(2)
    const renamed = constant.replace("'interrupted'", "'aborted'")
    expect(terminalOutcomeClosed.check([file(`${AR}index.ts`, renamed)])).toHaveLength(1)
  })

  it('包不存在 ⇒ 静默；包在而常量缺席 ⇒ 报出', () => {
    expect(terminalOutcomeClosed.check([file(`${OG}x.ts`, "return 'failed'")])).toEqual([])
    expect(terminalOutcomeClosed.check([file(`${AR}index.ts`, 'export {}')])).toHaveLength(1)
  })

  it('变异核对：真实的 AR 源码原文无违反；追加一个返回第五个值的 register ⇒ 报出', () => {
    // 常量在 types.ts（实现后的布局），index.ts 只再导出；规则看整包，所以两份都喂
    const types = real(`${AR}types.ts`)
    const original = real(`${AR}index.ts`)
    expect(terminalOutcomeClosed.check([types, original])).toEqual([])
    const mutated = file(
      original.path,
      `${original.text}\nexport async function register(): Promise<TerminalOutcome> {\n  return 'failed'\n}\n`,
    )
    expect(terminalOutcomeClosed.check([types, mutated])).toHaveLength(1)
  })
})

describe('og-s42-dynamic-resolve', () => {
  it('AR 之外经 ctx.get、resolveOptional、inject 解析 organization-purge，或引用常量 ⇒ 报出（OG 自己解析也算）', () => {
    const entry = file(
      'tenancy/governance-center-entry/src/x.ts',
      [
        "import { ORGANIZATION_PURGE_SERVICE } from '@omne-harness-lite/organization-governance'", // 1
        'const p = ctx.get(ORGANIZATION_PURGE_SERVICE)', // 2（常量引用也在这一行）
        "const q = resolveOptional<Purge>(ctx, 'organization-purge')", // 3
        "export const plugin = definePlugin({ inject: ['storage', 'organization-purge'] })", // 4
      ].join('\n'),
    )
    const og = file(`${OG}plugin.ts`, 'const self = ctx.get(ORGANIZATION_PURGE_SERVICE)')
    const found = ogS42DynamicResolve.check([entry, og])
    expect(found.map(v => `${v.path.split('/')[1]}:${v.line}`).sort()).toEqual([
      'governance-center-entry:1',
      'governance-center-entry:2',
      'governance-center-entry:2',
      'governance-center-entry:3',
      'governance-center-entry:4',
      'organization-governance:1',
    ])
  })

  it('合规：AR 解析；OG 定义并 provide；测试里解析', () => {
    const ar = file(
      `${AR}plugin.ts`,
      "import { ORGANIZATION_PURGE_SERVICE } from '@omne-harness-lite/organization-governance'\ninject: ['organizations', ORGANIZATION_PURGE_SERVICE]\nctx.get(ORGANIZATION_PURGE_SERVICE)",
    )
    const og = file(
      `${OG}plugin.ts`,
      "export const ORGANIZATION_PURGE_SERVICE = 'organization-purge' as const\nctx.provide(ORGANIZATION_PURGE_SERVICE, svc)",
    )
    const test = file(
      'tenancy/organization-governance/tests/purge.spec.ts',
      "ctx.get('organization-purge')",
    )
    expect(ogS42DynamicResolve.check([ar, og, test])).toEqual([])
  })

  it('变异核对：真实的 OG plugin.ts 原文无违反；让它自己解析一次 ⇒ 报出', () => {
    const original = real(`${OG}plugin.ts`)
    expect(ogS42DynamicResolve.check([original])).toEqual([])
    const anchor = 'ctx.provide(ORGANIZATION_PURGE_SERVICE,'
    expect(original.text).toContain(anchor)
    const mutated = file(
      original.path,
      original.text.replace(anchor, `ctx.get(ORGANIZATION_PURGE_SERVICE)\n    ${anchor}`),
    )
    expect(ogS42DynamicResolve.check([mutated])).toHaveLength(1)
  })
})

describe('no-dialect-bypass', () => {
  it('tenancy 包源码从 storage-sql 导入库连接构件、经命名空间用它、new Kysely( ⇒ 报出', () => {
    const bad = file(
      `${OG}db.ts`,
      [
        "import { openStorage, type StorageSqlConfig } from '@omne-harness-lite/storage-sql'", // 1
        "import { NodeSqliteDialect as D } from '@omne-harness-lite/storage-sql'", // 2
        "import * as sq from '@omne-harness-lite/storage-sql'", // 3
        'const s = new sq.SqlStorage(x)', // 4
        'const db = new Kysely<Db>({ dialect: new D(opts) })', // 5
      ].join('\n'),
    )
    expect(
      noDialectBypass
        .check([bad])
        .map(v => v.line)
        .sort(),
    ).toEqual([1, 2, 4, 5])
  })

  it('合规：只经 Storage 协议；Kysely 只作类型；测试与装配以外的包不查', () => {
    const clean = file(
      `${OG}records.ts`,
      [
        "import type { Kysely } from 'kysely'",
        "import { narrow, type Storage } from '@omne-harness-lite/storage'",
        'export type Db = Kysely<OgDatabase>',
      ].join('\n'),
    )
    const test = file(
      'tenancy/organization-governance/tests/support.ts',
      "import { openStorage } from '@omne-harness-lite/storage-sql'\nnew Kysely({ dialect })",
    )
    const infra = file('infra/storage-sql/src/open.ts', 'const db = new Kysely({ dialect })')
    expect(noDialectBypass.check([clean, test, infra])).toEqual([])
  })

  it('变异核对：真实的 tenancy 源码原文无违反；在 OG records.ts 里另开连接 ⇒ 报出', () => {
    const original = real(`${OG}records.ts`)
    expect(noDialectBypass.check([original, real(`${AI}schema.ts`)])).toEqual([])
    const mutated = file(
      original.path,
      `${original.text}\nconst side = new Kysely<OgDatabase>({ dialect })\n`,
    )
    expect(noDialectBypass.check([mutated])).toHaveLength(1)
  })
})
