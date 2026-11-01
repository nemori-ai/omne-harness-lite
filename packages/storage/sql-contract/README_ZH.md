# @omne-harness/sql-contract

[English](README.md)

service-contract 变体草稿。

## 职责与状态

本包拥有 SQL 存储的公开形状：身份、提交与认回结果、登记、读取、静态材料、清单摘要、关闭控制口，以及三个 Cordis 服务定义。本包不实现提供者。SQLite 提供者是另一个成员（`packages/storage/sqlite-provider`），尚未建立。

状态：设计已作为 #687 revision 2 的实施输入采用（评论 6554935672），不是 D-A01 交付接受。本包已实现：公开形状、`inputDigestV2`、`manifestDigest`、`combinationManifest`、三个服务定义，以及内存替身与符合性套件。本包没有实现：任何 SQLite、Worker 或文件行为（场景 C08 至 C11、C13、C15、C17 至 C23）。

## 使用

四个入口：

- `@omne-harness/sql-contract`：公开形状与三个纯函数，不导入 Cordis。
- `@omne-harness/sql-contract/worker`：提供者 Worker 所载模块的接口，只有类型，不导入 Cordis。
- `@omne-harness/sql-contract/cordis`：`StorageService`（键 `storage`）、`StorageHostService`（键 `storageHost`）、`TenantDomainsService`（键 `tenantDomains`）、`TenantDomainLookupService`（键 `tenantDomainLookup`）。消费者注入 `storageKey`，不导入提供者。
- `@omne-harness/sql-contract/testing`：`createMemorySqlStorage` 与 `runSqlStorageConformance`，以及 `createMemoryTenantDomainLookup` 与 `runTenantDomainLookupConformance`。

SQL 操作不携带主体。注入 `storage` 只是装配范围，不是访问控制。调用 SQL 的领域入口负责授权。

## 契约

公开类型在 `src/types.ts`（根）与 `src/worker.ts`，服务定义在 `src/cordis.ts`，类型以外的行为见 [SPEC.md](SPEC.md)，定义索引见 [docs/public-api.md](docs/public-api.md)。

结果都经返回值给出，Promise 不以 reject 报告结果。字段规则由提供者核验：名字类字段非空、合法 UTF-16、UTF-8 不超过 1024 字节；`transactionDomain` 不超过 120 字节；摘要为 64 位小写十六进制。纯摘要函数遇到非严格 JSON 的事实抛 `TypeError`，不对有损形式取摘要。

## 设计

`canonical.ts` 写出 RFC 8785 文本并判断严格 JSON；`digest.ts` 与 `manifest.ts` 是纯函数；`fields.ts` 是替身使用的字段规则；`testing/memory.ts` 是替身，`testing/conformance.ts` 是套件。设计理由在已采用的 SQL r2 规格中，长期正文在 #687 第二段迁入本包。

## 配置与运行

无配置，无常驻资源。需要 Node 24 及以上。`./testing` 把夹具模块文件写入临时目录，套件结束时删除。内存替身声明持久性为 `none`。

## 验证

在本目录运行 `pnpm run build`、`pnpm run typecheck`、`pnpm exec vitest run --mode fast`。测试覆盖：字段规则（每条规则一个用例）、`commit`、`registerCombination`、`read` 的拒绝顺序、两个摘要（含清单测试向量与 RFC 8785 数字写出）、`combinationManifest` 每类问题、四个入口与不含 Cordis 的根、符合性套件对替身与故意违规提供者的结果。

未覆盖：持久性、Worker 故障、SQLite 行为、除 absent、ready、closed 以外的域状态、队列上限，以及符合性场景 C08 至 C11、C13、C15、C17 至 C23。替身通过不证明这些。

## 维护

公开形状变化时，同步 API 快照（`pnpm run contract:api`）与 `docs/public-api.md`。消费者：`packages/session/session-storage-sql`（#1000）与 SQLite 提供者（#687 第二段）。摘要测试向量与规格保持一致。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
