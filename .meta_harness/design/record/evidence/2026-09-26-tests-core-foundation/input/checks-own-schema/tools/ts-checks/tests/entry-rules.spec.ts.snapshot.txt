// 入口层包（governance-center-entry）的规则：包尚未建（波次 2 同期），所以每条都在内存夹具里
// 两向自测，另在临时目录里造出整个包，经 collectSources 与 CLI 证明「真有违反就退出 1」。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectSources,
  credentialsParseOnly,
  noNetworkListenInTenancy,
  noPeerAddress,
  opsEventWhitelist,
  opsImportWhitelist,
  presentationOnlyAuthn,
  restrictedCallSites,
  runRules,
  singleTableEntry,
  type SourceFile,
} from '../src/index.ts'

const E = 'tenancy/governance-center-entry/'
const file = (path: string, text: string): SourceFile => ({ path, text })
const events = file(
  `${E}src/events.ts`,
  [
    "export const serving = 'governance-center-entry/serving' as const",
    "export const stopped = 'governance-center-entry/stopped' as const",
    "export const defect = 'governance-center-entry/defect' as const",
    "export const listening = 'governance-center-ops/listening' as const",
  ].join('\n'),
)

describe('ops-import-whitelist', () => {
  const cleanOps = file(
    `${E}src/ops/server.ts`,
    [
      "import { createServer } from 'node:http'",
      "import { definePlugin } from '@omne-harness-lite/kernel-basis'",
      "import type { Storage } from '@omne-harness-lite/storage'",
      "import { instantToRfc3339 } from '@omne-harness-lite/offer-expiry'",
      "import { serving, stopped } from '../events.ts'",
      "import { fullHealth } from './health.ts'",
      "import type { Context } from '@deepseek-ai/cordis'",
      "import { z } from 'zod'",
    ].join('\n'),
  )

  it('合规：白名单内的包、cordis 与 zod、node:*、事件声明模块与 ops 目录内互引', () => {
    expect(opsImportWhitelist.check([events, cleanOps])).toEqual([])
  })

  it('运维面导入治理包、本包别处、第三方、白名单包的子入口、动态说明符 ⇒ 逐条报出', () => {
    const bad = file(
      `${E}src/ops/bad.ts`,
      [
        "import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity'",
        "import { ROUTES } from '../routing/table.ts'",
        "import { Hono } from 'hono'",
        "import { suite } from '@omne-harness-lite/storage/conformance'",
        'const m = await import(moduleName)',
        "import { readFileSync } from 'fs'",
      ].join('\n'),
    )
    const found = opsImportWhitelist.check([events, cleanOps, bad])
    expect(found.map(v => v.line)).toEqual([1, 2, 3, 4, 5, 6])
    expect(found.every(v => v.path === bad.path && v.rule === 'ops-import-whitelist')).toBe(true)
  })

  it('事件声明模块导入任何 @omne-harness-lite/*、本包模块或别的第三方 ⇒ 报出', () => {
    const badEvents = file(
      `${E}src/events.ts`,
      [
        "import type { LoginStateId } from '@omne-harness-lite/identity-values'",
        "import { x } from '@omne-harness-lite/organization-governance'",
        "import { y } from './routing/table.ts'",
        "import mitt from 'mitt'",
        "export const serving = 'governance-center-entry/serving' as const",
      ].join('\n'),
    )
    expect(opsImportWhitelist.check([badEvents, cleanOps]).map(v => v.line)).toEqual([1, 2, 3, 4])
  })

  it('合规：事件声明模块导入 node 内置、cordis 类型与 zod', () => {
    const okEvents = file(
      `${E}src/events.ts`,
      [
        "import type { Context } from '@deepseek-ai/cordis'",
        "import { z } from 'zod'",
        "import { EventEmitter } from 'node:events'",
        events.text,
      ].join('\n'),
    )
    expect(opsImportWhitelist.check([okEvents, cleanOps])).toEqual([])
  })

  it('入口层包不存在 ⇒ 静默通过；包在而运维面目录或事件声明模块缺席 ⇒ 报布局偏离', () => {
    expect(
      opsImportWhitelist.check([file('tenancy/account-identity/src/a.ts', "import 'zod'")]),
    ).toEqual([])
    const onlyRouting = file(`${E}src/routing/table.ts`, 'export const ROUTES = {}')
    const drift = opsImportWhitelist.check([onlyRouting])
    expect(drift).toHaveLength(2)
    expect(drift.map(v => v.message).join('\n')).toMatch(/事件声明模块[\s\S]*运维面目录/)
    // 测试文件不算包存在
    expect(opsImportWhitelist.check([file(`${E}tests/x.spec.ts`, "import 'zod'")])).toEqual([])
  })
})

describe('ops-event-whitelist', () => {
  const header = "import { serving, stopped as off, defect, listening } from '../events.ts'\n"

  it('合规：Cordis 上下文只订阅 serving/stopped/defect、只派发 listening；Node 发射器不管', () => {
    const clean = file(
      `${E}src/ops/plugin.ts`,
      header +
        [
          'ctx.on(serving, payload => {})',
          'ctx.once(off, () => {})',
          'this.ctx.on(defect, () => {})',
          'ctx.emit(listening)',
          "server.on('error', onError)",
          "socket.once('close', () => {})",
        ].join('\n'),
    )
    const namespaced = file(
      `${E}src/ops/ns.ts`,
      "import * as events from '../events.ts'\nctx.on(events.serving, () => {})\nctx.emit(events.listening)",
    )
    expect(opsEventWhitelist.check([clean, namespaced])).toEqual([])
  })

  it("ctx.on('login.revoked', …) 与计算出的名字、错的常量、非事件模块的同名标识符 ⇒ 报出", () => {
    const bad = file(
      `${E}src/ops/bad.ts`,
      header +
        [
          "ctx.on('login.revoked', () => {})", // 2：字符串字面量订阅治理事件
          "ctx.on(`governance-center-entry/${'serving'}`, () => {})", // 3：计算出的名字
          'ctx.on(listening, () => {})', // 4：listening 不能订阅
          'ctx.emit(serving, payload)', // 5：只许派发 listening
          "ctx.serial('account.activated', x)", // 6：serial 也是派发
          'const bus = ctx', // 7
          "bus.on('organization.purged', () => {})", // 8：别名
          'ctx.on(name, () => {})', // 9：不是从事件模块导入的名字
        ].join('\n'),
    )
    const lines = opsEventWhitelist.check([bad]).map(v => v.line)
    expect(lines).toEqual([2, 3, 4, 5, 6, 8, 9])
  })

  it('同名标识符若不是从事件声明模块导入的，不算', () => {
    const fake = file(
      `${E}src/ops/fake.ts`,
      "import { serving } from './local-names.ts'\nctx.on(serving, () => {})",
    )
    expect(opsEventWhitelist.check([fake])).toHaveLength(1)
  })

  it('运维面目录之外不查（客户端面的派发归别的规则）', () => {
    const transport = file(
      `${E}src/transport/x.ts`,
      "ctx.emit('governance-center-entry/serving', p)",
    )
    expect(opsEventWhitelist.check([transport])).toEqual([])
  })
})

describe('single-table-entry', () => {
  it('合规：字面量、带别名的字面量、定义为该字面量的常量', () => {
    const constants = file(
      `${E}src/center-id/table.ts`,
      "export const CENTER_TABLE = 'governance_center' as const",
    )
    const clean = file(
      `${E}src/center-id/read-or-mint.ts`,
      [
        "await tx.lockRow(CENTER_TABLE, { slot: 'center' })",
        "const row = await narrow<Db>(tx).selectFrom('governance_center').selectAll().executeTakeFirst()",
        "await db.updateTable(CENTER_TABLE).set({ center_id: id }).where('slot', '=', 'center').execute()",
        "await db.insertInto('governance_center as g').values(v).onConflict(oc => oc.doNothing()).execute()",
        "await db.schema.createTable('governance_center').addColumn('slot', 'text').execute()",
      ].join('\n'),
    )
    expect(singleTableEntry.check([constants, clean])).toEqual([])
  })

  it('别的表、判不出的表名、join 别的表、sql 模板与 sql.raw ⇒ 报出', () => {
    const bad = file(
      `${E}src/routing/leak.ts`,
      [
        "db.selectFrom('login_state').selectAll()", // 1
        'db.deleteFrom(TABLES.center)', // 2：成员表达式判不出
        "db.selectFrom('governance_center').innerJoin('account', 'a.id', 'g.id')", // 3
        'await sql`select * from account`.execute(db)', // 4
        "sql.raw('drop table x')", // 5
        "tx.lockRow('organization', { organization_id: o })", // 6
        "db.selectFrom(['governance_center', 'account'])", // 7
      ].join('\n'),
    )
    expect(
      singleTableEntry
        .check([bad])
        .map(v => v.line)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('入口层包之外不查', () => {
    expect(
      singleTableEntry.check([
        file('tenancy/account-identity/src/x.ts', "db.selectFrom('account')"),
      ]),
    ).toEqual([])
  })
})

describe('no-peer-address', () => {
  it('remoteAddress、x-forwarded-for 等 ⇒ 报出；注释里提到不算', () => {
    const bad = file(
      `${E}src/transport/listen.ts`,
      [
        'const who = req.socket.remoteAddress',
        "const fwd = req.headers['X-Forwarded-For']",
        'const port = socket.remotePort',
        "const real = headers['x-real-ip']",
        'const f = req.headers.forwarded',
      ].join('\n'),
    )
    expect(noPeerAddress.check([bad]).map(v => v.line)).toEqual([1, 2, 3, 4, 5])
    const clean = file(
      `${E}src/transport/listen.ts`,
      '// 不读 remoteAddress（S-16）\nconst body = await read(req)',
    )
    expect(noPeerAddress.check([clean])).toEqual([])
  })
})

describe('credentials-parse-only', () => {
  it('入口层包里 .derive( .verify( .checkPolicy( ⇒ 报出；.parse( 合规', () => {
    const bad = file(
      `${E}src/routing/register.ts`,
      'credentials.derive(c)\ncredentials.verify(m, c)\ncredentials.checkPolicy(p, c)',
    )
    expect(credentialsParseOnly.check([bad]).map(v => v.line)).toEqual([1, 2, 3])
    const clean = file(
      `${E}src/routing/register.ts`,
      'const parsed = credentials.parse(payload.credential)',
    )
    expect(credentialsParseOnly.check([clean])).toEqual([])
  })
})

describe('presentation-only-authn', () => {
  it('logins.verify(、parseLoginStateId、as LoginStateId、<LoginStateId> ⇒ 报出', () => {
    const bad = file(
      `${E}src/routing/authn.ts`,
      [
        'const judged = await logins.verify(handle)', // 1
        "import { parseLoginStateId } from '@omne-harness-lite/identity-values'", // 2
        'await logins.listEffective(payload.loginStateHandle as LoginStateId)', // 3
        'const id = <LoginStateId>payload.handle', // 4
        'const parsed = iv.parseLoginStateId(x)', // 5
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([bad]).map(v => v.line)).toEqual([1, 2, 3, 4, 5])
  })

  it('合规：exchange 认人、类型位置的 LoginStateId 泛型与导入不算', () => {
    const clean = file(
      `${E}src/routing/authn.ts`,
      [
        "import type { LoginStateId } from '@omne-harness-lite/identity-values'",
        'const caller = await logins.exchange(presented)',
        'const ids: Promise<LoginStateId> = listed',
        'function f(x: ReadonlyArray<LoginStateId>): void {}',
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([clean])).toEqual([])
  })

  it('入口层解析 accounts 服务（inject、ctx.get、resolveOptional、ACCOUNTS_SERVICE 常量）⇒ 报出', () => {
    const bad = file(
      `${E}src/plugin.ts`,
      [
        "export const plugin = definePlugin({ inject: ['logins', 'accounts', 'storage'] })", // 1
        "const accounts = ctx.get('accounts')", // 2
        "const a = resolveOptional<Accounts>(ctx, 'accounts')", // 3
        "import { ACCOUNTS_SERVICE } from '@omne-harness-lite/account-identity'", // 4
      ].join('\n'),
    )
    expect(
      presentationOnlyAuthn
        .check([bad])
        .map(v => v.line)
        .sort(),
    ).toEqual([1, 2, 3, 4])
  })

  it('合规：inject 里只有路由表点名的服务；字面量 accounts 出现在别处（日志键）不算解析', () => {
    const clean = file(
      `${E}src/plugin.ts`,
      [
        "inject: ['logins', 'registration', 'organizations', 'memberships', 'offers', 'storage', 'credentials', 'clock']",
        "const logins = ctx.get('logins')",
        "diagnostics.warn('route', { area: 'accounts' })",
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([clean])).toEqual([])
    // 入口层包之外（组织治理 inject accounts）不查
    const og = file('tenancy/organization-governance/src/plugin.ts', "inject: ['accounts']")
    expect(presentationOnlyAuthn.check([og])).toEqual([])
  })
})

describe('no-network-listen-in-tenancy', () => {
  it('入口层包 transport/ops 之外、其他 tenancy 包 ⇒ 导入 node:http/https/net/tls 或 .listen( 报出', () => {
    const inRouting = file(`${E}src/routing/x.ts`, "import { createServer } from 'node:https'")
    const inAi = file(
      'tenancy/account-identity/src/x.ts',
      "import net from 'net'\nserver.listen(0)",
    )
    const found = noNetworkListenInTenancy.check([inRouting, inAi])
    expect(found.map(v => `${v.path}:${v.line}`)).toEqual([
      `${inRouting.path}:1`,
      `${inAi.path}:1`,
      `${inAi.path}:2`,
    ])
  })

  it('合规：transport 与 ops 里可以；core/infra 与测试不在范围', () => {
    const transport = file(
      `${E}src/transport/tls.ts`,
      "import { createServer } from 'node:tls'\nserver.listen(port)",
    )
    const ops = file(
      `${E}src/ops/socket.ts`,
      "import { createServer } from 'node:http'\nserver.listen(path)",
    )
    const infra = file('infra/storage-sql/src/x.ts', "import net from 'node:net'")
    const test = file('tenancy/account-identity/tests/x.spec.ts', "import http from 'node:http'")
    expect(noNetworkListenInTenancy.check([transport, ops, infra, test])).toEqual([])
  })
})

describe('restricted-call-sites：入口 SC-1 新增的四个方法', () => {
  it('入口层包与其他非 owner 包调 createPersonal/activate/purge/sweepStaleSelections ⇒ 报出', () => {
    const entry = file(
      `${E}src/routing/leak.ts`,
      'organizations.createPersonal(a)\naccounts.activate(a, w)\naccounts.purge(a, w)\nmemberships.sweepStaleSelections(10)',
    )
    const og = file('tenancy/organization-governance/src/x.ts', 'await accounts.activate(a, w)')
    const found = restrictedCallSites.check([entry, og])
    expect(found.map(v => `${v.path}:${v.line}`)).toEqual([
      `${entry.path}:1`,
      `${entry.path}:2`,
      `${entry.path}:3`,
      `${entry.path}:4`,
      `${og.path}:1`,
    ])
  })

  it('合规：owner 包定义与自调、注册组合调用、注释里提到、相似名字', () => {
    const owners = [
      file(
        'tenancy/organization-governance/src/organizations.ts',
        'async function createPersonal(d, a) {}\nsweepStaleSelections(deps, 1)',
      ),
      file(
        'tenancy/account-identity/src/accounts.ts',
        'async activate(a, w) {}\nasync purge(a, w) {}',
      ),
      file(
        'tenancy/account-registration/src/register.ts',
        'await organizations.createPersonal(a)\nawait accounts.activate(a, w)\nawait accounts.purge(a, w)',
      ),
      file(
        `${E}src/routing/table.ts`,
        '// 不投影 createPersonal(、activate(（S-24）\norganizations.purgePersonalOrganization\nx.deactivate(1)',
      ),
    ]
    expect(restrictedCallSites.check(owners)).toEqual([])
  })
})

describe('临时目录里造出入口层包：collectSources + CLI 真的会红', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const cli = join(here, '..', 'src', 'cli.ts')
  let root: string | undefined

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
    root = undefined
  })

  const writeTree = (files: Record<string, string>) => {
    root = mkdtempSync(join(tmpdir(), 'ts-checks-entry-'))
    for (const [path, text] of Object.entries(files)) {
      const full = join(root, path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, text)
    }
    return root
  }
  const runCli = (dir: string) =>
    spawnSync(process.execPath, ['--experimental-strip-types', cli, dir], { encoding: 'utf8' })

  it('违反的包 ⇒ runRules 报出各条、CLI 退出 1 并逐条打印', () => {
    const dir = writeTree({
      [`${E}src/events.ts`]: events.text,
      [`${E}src/ops/plugin.ts`]: [
        "import { LOGINS_SERVICE } from '@omne-harness-lite/account-identity'",
        "ctx.on('login.revoked', () => {})",
      ].join('\n'),
      [`${E}src/routing/leak.ts`]: [
        "db.selectFrom('account')",
        'const who = req.socket.remoteAddress',
        'credentials.verify(m, c)',
        "import { request } from 'node:http'",
        'accounts.activate(a, w)',
      ].join('\n'),
    })
    const rules = new Set(runRules(collectSources(dir)).map(v => v.rule))
    expect([...rules].sort()).toEqual([
      'credentials-parse-only',
      'no-network-listen-in-tenancy',
      'no-peer-address',
      'ops-event-whitelist',
      'ops-import-whitelist',
      'presentation-only-authn',
      'restricted-call-sites',
      'single-table-entry',
    ])
    const result = runCli(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/FAIL: ts-checks 发现 \d+ 处违反/)
    expect(result.stderr).toContain(`${E}src/ops/plugin.ts:2 [ops-event-whitelist]`)
  })

  it('合规的包 ⇒ CLI 退出 0', () => {
    const dir = writeTree({
      [`${E}src/events.ts`]: events.text,
      [`${E}src/ops/plugin.ts`]: [
        "import { definePlugin } from '@omne-harness-lite/kernel-basis'",
        "import { serving, listening } from '../events.ts'",
        'ctx.on(serving, () => {})',
        'ctx.emit(listening)',
      ].join('\n'),
      [`${E}src/transport/tls.ts`]: "import { createServer } from 'node:tls'\nserver.listen(port)",
      [`${E}src/center-id/read.ts`]: "db.selectFrom('governance_center').selectAll()",
    })
    const result = runCli(dir)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
