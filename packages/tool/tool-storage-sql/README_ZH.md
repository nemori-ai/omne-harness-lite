# @omne-harness/tool-storage-sql

[English](README.md)

Tool 记录仓与原件保管的 SQL 提供者。根入口导出 `createSqlToolLedgerStore`（耐久的 `ToolLedgerStore`）、`createSqlToolOutputCustody`（耐久的 `ToolOutputCustody`）与静态材料 `toolStorageMaterials()`。它在任何 SQL 存储契约的提供者上工作，不导入提供者。

## 职责与状态

本包把 Tool 账本的耐久记录与工具输出的原件保存在各租户的事务域内，与会话日志同域（Reduce 裁定 R1-D2）。依据是 tool-exec 线的 D2 决策记录（#421 评论 6561321713）。具名消费者是应用装配的 `tool-records` 行与应用的材料目录，两者都尚未交付。

| 部分                                         | 状态                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `createSqlToolLedgerStore`                   | 已实现。`durability: 'durable'`。每次调用是一次 `domain-serial` 读，或一次按修订号条件的 SQL 提交 |
| `createSqlToolOutputCustody`                 | 已实现。任意大小的原件分块保存，最后提交清单封存                                                  |
| `toolStorageMaterials()`                     | 已实现。一个参加者 `tool`、一条迁移、三个读 handler，全部在 `tl_` 表上                            |
| `./cordis` 插件、`tool-records` 行、目录合并 | 不在本包，归应用侧（波 B 与 L-APP）                                                               |
| 真实 SQLite 提供者、两个进程、断电           | 未验证，留联调 A                                                                                  |

## 使用

应用用 `storage` 行与会话存储组合提供的同一个 `storage` 和 `tenantDomainLookup` 构造两个适配器：

```ts
import {
  createSqlToolLedgerStore,
  createSqlToolOutputCustody,
} from '@omne-harness/tool-storage-sql'

const options = {
  storage, // `storage` 行的 SqlStorage
  domains, // TenantDomainLookup：已发布的租户事务域目录
  combination: { combinationVersion, manifestDigest }, // 为租户作用域登记的组合
}
const store = createSqlToolLedgerStore(options)
const custody = createSqlToolOutputCustody({
  ...options,
  maxCommandBytes, // 与 `storage` 行同一个值
  maxChunkBytes: 524_288,
})
```

记录仓交给 `createToolLedger` 与 `@omne-harness/tool-host-local` 的 `createLocalStartCoordinator`。保管交给账本端口与执行侧。适配器不持有资源，不需要释放。材料与会话、Model 的材料一起放进应用的 `SqlMaterialCatalog`。

## 契约

端口形状归 [`@omne-harness/tool`](../tool/src/ledger-store.ts)（`ToolLedgerStore`）与 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p05-执行事实与原输出)（`ToolOutputCustody`）。SQL 操作归 [`@omne-harness/sql-contract`](../../storage/sql-contract/SPEC.md)。[SPEC.md](SPEC.md) 写本包在类型以外做什么：提交顺序、每种 SQL 结果的答复、租户隔离、分块与清单协议、构造期核对与已知限制。[docs/public-api.md](docs/public-api.md) 列出导出。

## 设计

`src/ledger-store.ts` 与 `src/custody.ts` 是两个适配器。`src/tenant.ts` 经目录解析租户的事务域。`src/worker/` 里的 Worker 模块是 `tool` 参加者、迁移与三个读 handler，它们共用 `src/worker/facts.ts` 的事实协议。[docs/architecture.md](docs/architecture.md) 写表与机制，[docs/flows.md](docs/flows.md) 写提交与保管的流程。

## 配置与运行

| 选项                 | 拥有者   | 规则                                                                                          |
| -------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `storage`、`domains` | 应用装配 | 受信的 `storage` 与 `tenantDomainLookup` 行。目录不含的租户不写入                             |
| `combination`        | 应用装配 | 为租户作用域列出 `tool` 参加者的组合                                                          |
| `maxCommandBytes`    | 应用装配 | 与 `storage` 行同一个值，装配把同一个值交给两行                                               |
| `maxChunkBytes`      | 应用装配 | 其 base64 长度加 `CHUNK_ENVELOPE_BYTES` 必须不超过 `maxCommandBytes`，否则工厂抛 `RangeError` |

选项都没有缺省值。本包从不登记租户或组合。

## 验证

在本目录运行：

```sh
pnpm run build
pnpm run typecheck
NO_COLOR=1 pnpm exec vitest run --mode fast
```

测试在 node:sqlite 测试提供者（`tests/fixtures/sqlite-storage.ts`）上运行真实的 Worker 模块。它们运行 `@omne-harness/tool/testing` 的两组记录仓套件与 `@omne-harness/tool-contract/testing` 的保管套件，手柄齐全，没有不适用项。测试还检查分块、中断与重送、混入他租户行时的租户隔离、重开数据库文件、原子提交，以及启动协调器在本仓上的套件。测试提供者不建模 Worker、队列、组提交与断电。启动协调器的授权套件不适用：协调器没有授权消费点。

## 维护

新增 `LedgerRecord` 种类不需要改本包：记录仓按键保存记录，不解释记录。`ToolLedgerStore`、`ToolOutputCustody` 的形状或 SQL 契约变化时，要同步改本包与测试。Worker 模块变化会改变它的摘要，从而改变清单摘要，应用要登记新的组合版本。表名保持 `tl_` 前缀。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、表与机制
├── flows.md              账本提交与保管流程
├── object-model.md       记录、块与清单
├── public-api.md         公开边界与定义索引
├── context.md            消费者用法与系统定位
└── cordis.md             不适用：没有 Cordis 绑定
src/                      适配器、选项与 Worker 模块
tests/                    持续测试；fixtures/ 放 SQLite 测试提供者
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      仍有消费者的实现取舍
examples/                 针对公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 放其输入
```

每个目录有 README.md 说明职责，有 index.md 作导航。阅读路径见 [index.md](index.md)。
