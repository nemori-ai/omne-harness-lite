# @omne-harness/identity-sql

[English](README.md)

身份持久提供者：账号、凭据、组织、成员关系、邀请与登录落在 SQL 存储契约的系统事务域 `system.identity`，凭据只存 scrypt 派生材料。本成员实现 [identity 契约](../identity/SPEC.md)的三项操作、资格读口与治理端口，并提供 `./cordis` 插件。

## 职责与状态

本成员按 [DP-3 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6561478373)建立，是 identity 契约 ID-16 资格读口、ID-17 注册激活、签发登录、识别登录与 ID-18 治理端口的持久提供者。消费者是应用 `apps/harness-server` 的 `identity` 行（APP-4b），经 `@omne-harness/identity/cordis` 的三个服务键 `identityOperations`、`tenantStanding` 与 `identityGovernance` 使用它。

已实现并验证：注册激活单事务、签发与识别、资格读口、创建团队、邀请与处置、退出、移除与调整角色、切换当前租户、撤销登录与退出登录、本人有效登录名单、空闲期限刷新、重启后记录仍在、从迁移 001 升级到 002、停止后的答复、`./cordis` 插件。未实现：更换凭据、组织隶属、未激活留存（本阶段不提供）。待确认：个人组织采用 `default-team` revision `'1'`，见 [SPEC IS-02](SPEC.md#is-02)。

## 使用

独立使用：

```ts
import { openScrypt, SCRYPT_PROFILE } from '@omne-harness/scrypt'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
} from '@omne-harness/identity-sql'

// storage 是一个 SqlStorage，它的目录含 identitySqlMaterials() 的材料。
await storage.registerCombination(identitySqlRegistration())
const scrypt = openScrypt(SCRYPT_PROFILE)
if (!scrypt.ok) throw new Error(scrypt.code)
const decoy = scrypt.module.derive('<随机秘密>', () => ({ ok: true }))
const sql = createIdentitySql({
  storage,
  clock, // IdentityClock
  terms, // LoginTermsSource
  invitationTerms, // InvitationTermsSource
  scrypt: scrypt.module,
  decoyMaterial: /* decoy.done 的 material */ '',
})
await sql.operations.registerAndActivate({ loginIdentifier: 'ada', credential: '...' })
sql.stop()
await scrypt.module.close()
```

工厂不读墙钟，不打开 scrypt，不登记组合，也不关闭任何东西。调用方先登记组合，用完后先 `stop()` 再关闭 scrypt 模块。

Cordis 集成：`@omne-harness/identity-sql/cordis` 导出 `IdentitySqlPlugin`。它 `inject: ['storage', 'identityClock']`。配置是两个登录时长 `maxLifetime`、`idlePeriod` 与两个邀请时长 `invitationDefaultDuration`、`invitationMaxDuration`，都是 `PT<秒>S` 文本，四项必填，缺一项时 fiber 失败。`IDENTITY_SQL_DEFAULT_CONFIG` 列出初值，供部署显式取用：登录 30 天与空闲 7 天，邀请默认 7 天、最长 30 天。插件体打开 scrypt、派生假材料、登记组合、用注入的时钟构造提供者，并提供三个键。细节见 [docs/cordis.md](docs/cordis.md)。

应用把 `identitySqlMaterials()` 聚合进存储目录，否则参加者与读 handler 不可用。

## 契约

公开类型在 `src/index.ts`，导航见 [docs/public-api.md](docs/public-api.md)。三项操作、资格读口与治理端口的结果类型归 identity 契约，本成员不复制。本成员自己的行为归 [SPEC.md](SPEC.md)：记录位置与组合（IS-01）、注册单事务与输入上界（IS-02）、秘密只以派生形式保存（IS-03）、签发（IS-04）、识别（IS-05）、资格读口（IS-06）、停止后（IS-07）、重启后（IS-08）、迁移 002 与升级（IS-09）、治理写与读（IS-10、IS-11）、撤销与当前选择（IS-12）、组织邀请与名单（IS-13）、空闲刷新（IS-14）、邀请时长（IS-15）。

错误：结果都经返回值给出。只有写入结果不能确定时拒绝 Promise，错误类型是 `IdentitySqlResultUnknown`。生命周期与资源责任见 SPEC「所有权、失败与生命周期」。

## 设计

`src/provider.ts` 持有停止标志与最晚时钟读数，做三项操作与读口的非 SQL 计算。`src/governance.ts` 是治理端口，共用同一实例的存储、时钟与停止标志。`src/worker/` 的参加者与读 handler 执行 SQL，以及必须与写入或读取同处一个事务的记录核对。`src/materials.ts` 一处定义参加者、迁移、读 handler、事务域与组合版本。`src/cordis.ts` 把工厂接到 Cordis。完整设计见 [docs/architecture.md](docs/architecture.md)、[docs/flows.md](docs/flows.md) 与 [docs/object-model.md](docs/object-model.md)。

## 配置与运行

配置是两个登录时长与两个邀请时长，拥有者是装配的 `identity` 行。scrypt 参数固定为 `SCRYPT_PROFILE`，这是 IC-14 的登记偏离，规则见 SPEC 已知限制 3。运行前提：Node 24 以上、一个已装入材料目录的 `storage` 提供者。调用方负责登记组合与关闭存储。本成员负责停止提供者与关闭 scrypt。

## 验证

成员目录运行 `pnpm run build`、`pnpm run typecheck`、`NO_COLOR=1 pnpm exec vitest run --mode fast`、`NO_COLOR=1 pnpm exec vitest run --mode slow`。用例经 `dist` 导入本成员，改源码后先构建。测试与义务的对应、真实依赖与未覆盖见 [SPEC 组合与验证](SPEC.md#组合与验证)与 [tests/README.md](tests/README.md)。

## 维护

- 改表结构：写新的迁移模块，不改 `001-identity` 与 `002-governance` 已发布的字节。`schema.ts` 里 001 的表名与语句由 `tests/public-entry.spec.ts` 钉住。同步 `src/worker/schema.ts` 的表名、`materials.ts` 的读 handler 表清单与 [docs/object-model.md](docs/object-model.md)。
- 改读 handler 的输入输出：同步 `schema.ts` 的类型、`provider.ts` 的解析函数与对应用例。
- 改结果映射：先改 SPEC 的条款与用例，再改 `provider.ts` 或 `governance.ts`。
- 改治理命令的核对：核对写在 `worker/participant.ts` 与 `worker/read-governance.ts`。负控用例按文本改写 `dist` 副本，改动核对的写法时同步 `tests/fixtures/mutants.ts` 的锚点。
- 改配置字段：同步 `config.ts`、`cordis.ts` 的 Standard Schema、应用行与装配页。
- 升级 identity、sql-contract 或 scrypt：重跑全部用例，核对 SPEC「消费的承诺」表。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              注册、签发、识别、读口与治理的流程
├── object-model.md       表、行与提供者对象
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             插件、IC 核对表与撤除
src/                      工厂、治理端口、配置、材料、插件；worker/ 下是参加者、两个迁移与读 handler
tests/                    持续测试；fixtures/ 存放真实 sqlite-provider 夹具与子进程脚本
schema/                   不适用：本成员没有对外 Schema
verification/             不适用：没有形式模型或证明
adr/                      不适用：取舍记录在 DP-3 决策记录与 SPEC
examples/                 不适用：示例在本文「使用」一节
resources/                不适用：没有非源码资源
acceptance/               留给独立验收者，当前没有场景
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。
