// 入口层包（governance-center-entry）的规则：包尚未建（波次 2 同期），所以每条都在内存夹具里
// 两向自测，另在临时目录里造出整个包，经 collectSources 与 CLI 证明「真有违反就退出 1」。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { collectSources, runRules, type SourceFile } from '@omne-harness/repo-toolchain'
import {
  RULES,
  credentialsParseOnly,
  noNetworkListenInTenancy,
  noPeerAddress,
  opsEventWhitelist,
  opsImportWhitelist,
  presentationOnlyAuthn,
  restrictedCallSites,
  singleTableEntry,
} from '../src/rules/index.ts'

const E = 'tenancy/governance-center-entry-node/'
const file = (path: string, text: string): SourceFile => ({ path, text })
const events = file(
  'core/governance-center-entry/src/events.ts',
  [
    "export const SERVING_EVENT = 'governance-center-entry/serving-started' as const",
    "export const STOPPED_EVENT = 'governance-center-entry/serving-stopped' as const",
    "export const DEFECT_EVENT = 'governance-center-entry/defect-observed' as const",
    "export const LISTENING_EVENT = 'governance-center-entry/ops-listening-started' as const",
  ].join('\n'),
)

describe('ops-import-whitelist', () => {
  const cleanOps = file(
    `${E}src/ops/server.ts`,
    [
      "import { createServer } from 'node:http'",
      "import { definePlugin } from '@omne-harness/kernel-basis'",
      "import type { Storage } from '@omne-harness/storage'",
      "import { instantToRfc3339 } from '@omne-harness/offer-expiry'",
      "import { SERVING_EVENT as serving, STOPPED_EVENT as stopped } from '@omne-harness/governance-center-entry'",
      "import { fullHealth } from './health.ts'",
      "import type { Context } from '@deepseek-ai/cordis'",
      "import { z } from 'zod'",
    ].join('\n'),
  )

  it('合规：白名单内的包、cordis 与 zod、node:*、事件声明模块与 ops 目录内互引', () => {
    expect(opsImportWhitelist.check([events, cleanOps])).toEqual([])
  })

  it.each([
    ['@omne-harness/kernel-basis/cordis', 0],
    ['@omne-harness/kernel-basis/testing', 1],
    ['@omne-harness/kernel-basis/unknown', 1],
    ['@omne-harness/storage/cordis', 0],
    ['@omne-harness/governance-center-entry', 0],
    ['@omne-harness/governance-center-entry/cordis', 0],
    ['@omne-harness/governance-center-entry/private', 1],
    ['@omne-harness/assembly-lifecycle/cordis', 0],
    ['@omne-harness/assembly-lifecycle/private', 1],
    ['@omne-harness/offer-expiry/cordis', 0],
    ['@omne-harness/storage/cordis/private', 1],
    ['@omne-harness/offer-expiry/cordis/private', 1],
  ])('kernel 子入口按精确路径判断：%s', (specifier, violations) => {
    const input = file(`${E}src/ops/binding.ts`, `import { helper } from '${specifier}'`)
    expect(opsImportWhitelist.check([events, cleanOps, input])).toHaveLength(violations)
  })

  it('运维面导入治理包、本包别处、第三方、白名单包的子入口、动态说明符 ⇒ 逐条报出', () => {
    const bad = file(
      `${E}src/ops/bad.ts`,
      [
        "import { LOGINS_SERVICE } from '@omne-harness/account-identity'",
        "import { ROUTES } from '../routing/table.ts'",
        "import { Hono } from 'hono'",
        "import { suite } from '@omne-harness/storage/conformance'",
        'const m = await import(moduleName)',
        "import { readFileSync } from 'fs'",
      ].join('\n'),
    )
    const found = opsImportWhitelist.check([events, cleanOps, bad])
    expect(found.map(v => v.line)).toEqual([1, 2, 3, 4, 5, 6])
    expect(found.every(v => v.path === bad.path && v.rule === 'ops-import-whitelist')).toBe(true)
  })

  it('事件声明模块导入任何 @omne-harness/*、本包模块或别的第三方 ⇒ 报出', () => {
    const badEvents = file(
      'core/governance-center-entry/src/events.ts',
      [
        "import type { LoginStateId } from '@omne-harness/identity-values'",
        "import { x } from '@omne-harness/organization-governance'",
        "import { y } from './routing/table.ts'",
        "import mitt from 'mitt'",
        "export const SERVING_EVENT = 'governance-center-entry/serving-started' as const",
      ].join('\n'),
    )
    expect(opsImportWhitelist.check([badEvents, cleanOps]).map(v => v.line)).toEqual([1, 2, 3, 4])
  })

  it('合规：公共纯事件叶子只导入 Instant 类型', () => {
    const okEvents = file(
      'core/governance-center-entry/src/events.ts',
      ["import type { Instant } from '@omne-harness/offer-expiry'", events.text].join('\n'),
    )
    expect(opsImportWhitelist.check([okEvents, cleanOps])).toEqual([])
  })

  it('入口层包不存在 ⇒ 静默通过；包在而运维面目录或事件声明模块缺席 ⇒ 报布局偏离', () => {
    expect(
      opsImportWhitelist.check([file('tenancy/account-identity-sql/src/a.ts', "import 'zod'")]),
    ).toEqual([])
    const onlyRouting = file(`${E}src/routing/table.ts`, 'export const ROUTES = {}')
    const drift = opsImportWhitelist.check([onlyRouting])
    expect(drift).toHaveLength(2)
    expect(drift.map(v => v.message).join('\n')).toMatch(/事件声明模块[\s\S]*运维面目录/)
    // 测试文件不算包存在
    expect(opsImportWhitelist.check([file(`${E}tests/x.spec.ts`, "import 'zod'")])).toEqual([])
  })
})

describe('D055 maintenance import boundary', () => {
  const ops = file(
    `${E}src/ops/requests.ts`,
    "import { readJsonText } from '../json.ts'; import { OnlineMaintenance } from '../maintenance/online.ts'",
  )
  it.each([
    ['governance-maintenance.schema.json', 0],
    ['other.schema.json', 1],
  ])('permits only the adopted maintenance resource: %s', (name, violations) => {
    const input = file(`${E}src/schema-inputs.ts`, `import data from '../schema/${name}'`)
    expect(opsImportWhitelist.check([events, ops, input])).toHaveLength(violations)
  })
  it('checks the D-116 resource leaf and permits only its finite generated entry', () => {
    const schema = file(
      `${E}src/routing/schema.ts`,
      "import { entryDefinitions } from '../schema-inputs.ts'; import type { ErrorObject } from 'ajv/dist/2020.js'; const validators = require('./generated/ordinary.cjs')",
    )
    const inputs = file(
      `${E}src/schema-inputs.ts`,
      "import { createRequire } from 'node:module'; const a = require('@omne-harness/governance-center-entry/schema'); const b = require('@omne-harness/identity-values/schema'); const c = require('@omne-harness/offer-expiry/schema')",
    )
    expect(opsImportWhitelist.check([events, ops, schema, inputs])).toEqual([])
    for (const specifier of [
      './center-id/read-or-mint.ts',
      '@omne-harness/account-identity',
      '@omne-harness/governance-center-entry',
      '@omne-harness/governance-center-entry/cordis',
      '@omne-harness/governance-center-entry/schema/private',
      '../schema/governance-center-entry.schema.json',
      './generated/ordinary.cjs',
    ]) {
      const unsafe = file(`${E}src/schema-inputs.ts`, `import '${specifier}'`)
      expect(opsImportWhitelist.check([events, ops, unsafe])).toHaveLength(1)
    }
    for (const specifier of ['./generated/other.cjs', '../routes.ts']) {
      const unsafe = file(`${E}src/routing/schema.ts`, `const value = require('${specifier}')`)
      expect(opsImportWhitelist.check([events, ops, unsafe])).toHaveLength(1)
    }
  })
  it('allows the adopted readonly maintenance dependencies', () => {
    const source = file(
      `${E}src/maintenance/input.ts`,
      [
        "import { SnapshotFailure } from '@omne-harness/storage'",
        "import { instantFromRfc3339 } from '@omne-harness/offer-expiry'",
        "import { readSnapshotCenterId } from '../center-id/snapshot.ts'",
        "import { entryValidator } from '../routing/schema.ts'",
        "import { readJsonText } from '../json.ts'",
        "import { parseMetadata } from './metadata.ts'",
      ].join('\n'),
    )
    expect(opsImportWhitelist.check([events, ops, source])).toEqual([])
  })
  it('allows only the two migrated center identity names on the snapshot leaf', () => {
    const target = '@omne-harness/governance-center-entry'
    const read = file(
      `${E}src/center-id/snapshot.ts`,
      `import { isGovernanceCenterId as valid, type GovernanceCenterId } from '${target}'`,
    )
    expect(opsImportWhitelist.check([events, ops, read])).toEqual([])
    for (const text of [
      `import { EntryOpening } from '${target}'`,
      `import { isGovernanceCenterId, EntryOpening } from '${target}'`,
      `import * as entry from '${target}'`,
      `import entry from '${target}'`,
      `import '${target}'`,
      `export { isGovernanceCenterId } from '${target}'`,
      `const entry = await import('${target}')`,
      `const entry = require('${target}')`,
      `import { EntryOpeningService } from '${target}/cordis'`,
    ]) {
      const unsafe = file(`${E}src/center-id/snapshot.ts`, text)
      expect(opsImportWhitelist.check([events, ops, unsafe])).toHaveLength(1)
    }
    const wrongLeaf = file(`${E}src/center-id/table.ts`, read.text)
    expect(opsImportWhitelist.check([events, ops, wrongLeaf])).toHaveLength(1)
  })
  it('checks every permitted readonly leaf instead of trusting its filename', () => {
    for (const leaf of [
      'json.ts',
      'routing/schema.ts',
      'center-id/snapshot.ts',
      'center-id/snapshot-structure.ts',
      'center-id/table.ts',
    ]) {
      const unsafe = file(
        `${E}src/${leaf}`,
        "import { readOrMint } from './read-or-mint.ts'; import { x } from '@omne-harness/account-identity'",
      )
      expect(opsImportWhitelist.check([events, ops, unsafe])).toHaveLength(2)
    }
    const schema = file(
      `${E}src/routing/schema.ts`,
      "import { createRequire } from 'node:module'; import { Ajv2020 } from 'ajv/dist/2020.js'; const a = require('@omne-harness/governance-center-entry/schema'); const b = require('@omne-harness/identity-values/schema'); const c = require('@omne-harness/offer-expiry/schema')",
    )
    expect(opsImportWhitelist.check([events, ops, schema])).toEqual([])
  })
  it('blocks governance and write-capable paths behind an allowed maintenance import', () => {
    const source = file(
      `${E}src/maintenance/unsafe.ts`,
      [
        "import { x } from '@omne-harness/account-identity'",
        "import { y } from '@omne-harness/storage-sql'",
        "import { decide } from '../routing/decide.ts'",
        "import { readOrMint } from '../center-id/read-or-mint.ts'",
        "import { plugin } from '../plugin.ts'",
        'await import(dynamicName)',
      ].join('\n'),
    )
    expect(opsImportWhitelist.check([events, ops, source]).map(v => v.line)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })
})

describe('ops-event-whitelist', () => {
  const header =
    "import { SERVING_EVENT as serving, STOPPED_EVENT as off, DEFECT_EVENT as defect, LISTENING_EVENT as listening } from '@omne-harness/governance-center-entry'\n"

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
      "import * as events from '@omne-harness/governance-center-entry'\nctx.on(events.SERVING_EVENT, () => {})\nctx.emit(events.LISTENING_EVENT)",
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

describe('T4 finite ops integration boundary', () => {
  const ops = file(
    `${E}src/ops/plugin.ts`,
    "import type { AssemblyDeclaration } from '@omne-harness/cordis-plugin-tree'; import type { GovernanceCenterLogger } from '../work.ts'",
  )
  it('permits only the adopted type and empty shared lifecycle leaf', () => {
    expect(
      opsImportWhitelist.check([
        events,
        ops,
        file(`${E}src/work.ts`, 'export interface GovernanceCenterLogger {}'),
      ]),
    ).toEqual([])
  })
  it.each([
    "import { AssemblyDeclaration } from '@omne-harness/cordis-plugin-tree'",
    "import type * as tree from '@omne-harness/cordis-plugin-tree'",
    "import { composePluginTree } from '@omne-harness/cordis-plugin-tree'",
    "import type { AssemblyDeclaration } from '@omne-harness/cordis-plugin-tree/cordis'",
    "import type { EntryServices } from '../entry-dependencies.ts'",
  ])('rejects extra runtime, namespace, binding and governance access: %s', text => {
    expect(opsImportWhitelist.check([events, file(`${E}src/ops/plugin.ts`, text)])).toHaveLength(1)
  })
  it('does not permit governance imports through the shared lifecycle leaf', () => {
    expect(
      opsImportWhitelist.check([
        events,
        ops,
        file(
          `${E}src/work.ts`,
          "import type { LoginsService } from '@omne-harness/account-identity'",
        ),
      ]),
    ).toHaveLength(1)
  })
  it.each([
    "import type { Context } from '@deepseek-ai/cordis'",
    "import { z } from 'zod'",
    "import { EventEmitter } from 'node:events'",
    "import { Instant } from '@omne-harness/offer-expiry'",
    "import type * as expiry from '@omne-harness/offer-expiry'",
  ])('pure public event leaf rejects extra imports: %s', text => {
    expect(opsImportWhitelist.check([file(events.path, text), ops])).toHaveLength(1)
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
        file('tenancy/account-identity-sql/src/x.ts', "db.selectFrom('account')"),
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
        "import { parseLoginStateId } from '@omne-harness/identity-values'", // 2
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
        "import type { LoginStateId } from '@omne-harness/identity-values'",
        'const caller = await logins.exchange(presented)',
        'const ids: Promise<LoginStateId> = listed',
        'function f(x: ReadonlyArray<LoginStateId>): void {}',
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([clean])).toEqual([])
  })

  it('EC2：accounts 的普通读写不是认人或按名邀请参与面', () => {
    const bad = file(
      `${E}src/routing/routes.ts`,
      [
        'accounts.read(account)',
        'services.accounts.produce(identifier, secret)',
        'services.accounts.activate(account, warrant)',
        'accounts.purge(account)',
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([bad]).map(v => v.line)).toEqual([1, 2, 3, 4])
    const clean = file(
      `${E}src/plugin.ts`,
      [
        "inject: ['logins', 'accounts', 'storage']",
        "const accounts = ctx.get('accounts')",
        'const face = accounts.participate(unit)',
        'services.accounts.resolveActivatedIdentifier(identifier)',
      ].join('\n'),
    )
    expect(presentationOnlyAuthn.check([clean])).toEqual([])
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
    const og = file('tenancy/organization-governance-sql/src/plugin.ts', "inject: ['accounts']")
    expect(presentationOnlyAuthn.check([og])).toEqual([])
  })
})

describe('no-network-listen-in-tenancy', () => {
  it('入口层包 transport/ops 之外、其他 tenancy 包 ⇒ 导入 node:http/https/net/tls 或 .listen( 报出', () => {
    const inRouting = file(`${E}src/routing/x.ts`, "import { createServer } from 'node:https'")
    const inAi = file(
      'tenancy/account-identity-sql/src/x.ts',
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
    const test = file(
      'tenancy/account-identity-sql/tests/x.spec.ts',
      "import http from 'node:http'",
    )
    expect(noNetworkListenInTenancy.check([transport, ops, infra, test])).toEqual([])
  })
})

describe('restricted-call-sites：入口 SC-1 新增的四个方法', () => {
  it('入口层包与其他非 owner 包调 createPersonal/activate/purge/sweepStaleSelections ⇒ 报出', () => {
    const entry = file(
      `${E}src/routing/leak.ts`,
      'organizations.createPersonal(a)\naccounts.activate(a, w)\naccounts.purge(a, w)\nmemberships.sweepStaleSelections(10)',
    )
    const og = file('tenancy/organization-governance-sql/src/x.ts', 'await accounts.activate(a, w)')
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
        'tenancy/organization-governance-sql/src/organizations.ts',
        'async function createPersonal(d, a) {}\nsweepStaleSelections(deps, 1)',
      ),
      file(
        'tenancy/account-identity-sql/src/accounts.ts',
        'async activate(a, w) {}\nasync purge(a, w) {}',
      ),
      file(
        'tenancy/account-registration-sequential/src/register.ts',
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
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ts-checks-entry-')))
    for (const [path, text] of Object.entries(files)) {
      const full = join(root, path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, text)
    }
    return root
  }
  const runCli = (dir: string) =>
    spawnSync(process.execPath, ['--conditions=source', '--experimental-strip-types', cli, dir], {
      encoding: 'utf8',
    })

  // 归慢层：子进程＋重 CPU：起真实 CLI 子进程，它会扫描整个仓库的执行模块。
  it('违反的包 ⇒ runRules 报出各条、CLI 退出 1 并逐条打印', { tags: ['slow'] }, () => {
    const dir = writeTree({
      ['core/governance-center-entry/src/events.ts']: events.text,
      [`${E}src/ops/plugin.ts`]: [
        "import { LOGINS_SERVICE } from '@omne-harness/account-identity'",
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
    const rules = new Set(runRules(collectSources(dir), RULES).map(v => v.rule))
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
    expect(result.stderr).toMatch(/FAIL: product-checks 发现 \d+ 处违反/)
    expect(result.stderr).toContain(`${E}src/ops/plugin.ts:2 [ops-event-whitelist]`)
  })

  // 归慢层：子进程＋重 CPU：起真实 CLI 子进程，它会扫描整个仓库的执行模块。
  it('合规的包 ⇒ CLI 退出 0', { tags: ['slow'] }, () => {
    const dir = writeTree({
      ['core/governance-center-entry/src/events.ts']: events.text,
      [`${E}src/ops/plugin.ts`]: [
        "import { definePlugin } from '@omne-harness/kernel-basis'",
        "import { SERVING_EVENT as serving, LISTENING_EVENT as listening } from '@omne-harness/governance-center-entry'",
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

describe('R1-T5 strict JSON shape owner', () => {
  const events = file('core/governance-center-entry/src/events.ts', '')
  const ops = file(`${E}src/ops/start.ts`, '')
  it('admits only the moved named type imports in the original reader', () => {
    const reader = file(
      `${E}src/json.ts`,
      "import type { JsonLimits, DuplicateMember, JsonReading } from './json-shapes.ts'",
    )
    const shapes = file(
      `${E}src/json-shapes.ts`,
      'export interface JsonLimits { depth: number }; export type JsonReading = unknown',
    )
    // Empty statements are absent from the actual declaration-only owner.
    const exactShapes = file(shapes.path, shapes.text.replace('; export', '\nexport'))
    expect(opsImportWhitelist.check([events, ops, reader, exactShapes])).toEqual([])
  })
  it.each([
    "import { JsonReading } from './json-shapes.ts'",
    "import Reading from './json-shapes.ts'",
    "import type * as Reading from './json-shapes.ts'",
    "import type { EntryServices } from './json-shapes.ts'",
    "export type { JsonReading } from './json-shapes.ts'",
    "import('./json-shapes.ts')",
  ])('rejects an expanded reader binding: %s', text => {
    expect(opsImportWhitelist.check([events, ops, file(`${E}src/json.ts`, text)])).toHaveLength(1)
  })
  it.each([
    "import type { AccountsService } from '@omne-harness/account-identity'",
    "export type { AccountsService } from '@omne-harness/account-identity'",
    "export const call = () => globalThis.fetch('https://example.invalid')",
  ])('rejects dependencies or effects in the shape owner: %s', text => {
    expect(
      opsImportWhitelist.check([events, ops, file(`${E}src/json-shapes.ts`, text)]).length,
    ).toBeGreaterThan(0)
  })
  it('does not grant the same binding to an unrelated readonly leaf', () => {
    expect(
      opsImportWhitelist.check([
        events,
        ops,
        file(`${E}src/center-id/table.ts`, "import type { JsonReading } from '../json-shapes.ts'"),
      ]),
    ).toHaveLength(1)
  })
})
