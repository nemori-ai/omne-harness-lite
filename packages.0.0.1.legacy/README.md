# 产品包

这里放产品的可复用包，目标按 `packages/<能力组>/<成员>/` 两层组织。第一层组织相关知识，不是workspace成员；第二层拥有package.json、src、依赖、公开入口和验证。
目标分组、公共SDK位置与包边界见[产品包组织](../docs/package-organization.md)，开发环境见[workspace](../docs/workspace.md)，责任见[领域地图](../docs/domains/boundaries.md)。下表仍列现有真实路径，不表示目标目录已迁移；未迁承诺继续沿[原维护入口](../.meta_harness/design/architecture/README.md)及实际成员定位。
未迁包的分层状态仍由其 realization 节点记录，新单元不预建四件套。

## 当前成员

| 包                                                                                         | 兑现什么                                                                                                                                                                                                                          | 状态                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`core/client-local-state`](core/client-local-state/README.md) | 本地记录、CAS、存储工厂资源与正式服务定义 | 原 CLS1 行为保持；提供者独立 |
| [`core/governance-client-operations`](core/governance-client-operations/README.md) | ActionIntent、操作、报告、关闭观察资源及正式服务 | 原 CG2 业务与模型义务保持 |
| [`core/governance-center-entry-https-json`](core/governance-center-entry-https-json/README.md) | HTTPS/JSON 传输形状与正式服务 | EC2/HT2；不自动升级协议 |
| [`frontend/governance-center-client-https`](frontend/governance-center-client-https/README.md)         | 公开health与EC2/HT2无状态治理协议客户端                                                                                                                                                                                           | D038/D045受限实现；不含CLI命令与登录存储                                                                                                          |
| [`frontend/client-local-state-sqlite`](frontend/client-local-state-sqlite/README.md)                     | CLS1本地完整记录、比较替换与资源收场                                                                                                                                                                                              | D046提供者增量；不含网络用例和CLI/TUI                                                                                                             |
| [`frontend/governance-client-operations-local`](frontend/governance-client-operations-local/README.md) | 共享治理用例、固定使用、本地结算与安全结果                                                                                                                                                                                        | D047；CLI/TUI装配仍需独立完成                                                                                                                     |
| `core/identity-values`                                                                     | `data.identity-values` v1：身份值解析与相等、上级链纯函数、Schema 校验、交接凭证（Ed25519）、不透明标识生成                                                                                                                       | 实现完整，测试对契约 examples 机检                                                                                                                |
| `core/offer-expiry`                                                                        | `data.offer-expiry` v1：`Instant`／`Duration`、`OfferTiming`、派生状态、`offer_ttl` 解析、`Clock` 形状；`./testing` 给可控时钟替身                                                                                                | 实现完整                                                                                                                                          |
| `core/kernel-basis`                                                                        | Cordis 4.0.4 取证 probe（`tests/basis/`）、`definePlugin`、`Outcome`／`Ack`、`FIBER_STATE`、`resolveOptional`；`./testing` 的 `bootAssembly`                                                                                      | 实现完整；basis 条目的 `probe` 指向这里                                                                                                           |
| `core/storage`                                                                             | 存储协议：一次读／写事务、`lockRow`／`lockSentinel`、四型失败、`mapStorageError`；`./conformance` 是任何提供者都必须通过的一致性套件                                                                                              | 实现完整                                                                                                                                          |
| `infra/storage-sql`                                                                        | 协议的 Kysely 提供者：sqlite（`node:sqlite`，自写 Driver）／postgres 由配置切换，迁移运行器，错误码映射，升级守卫（属主排他、迁移前只读核对、sqlite 快照与确认）；插件 `storage-sql` provide `storage`                            | sqlite 上一致性套件与升级测试全绿；pg 16 上一致性套件 19／19、升级测试 3／3（运行 `2026-09-23-tests-tenancy-leg-2`）；pg 本版只接线、不作部署目标 |
| `infra/clock-lease`                                                                        | `clock` 服务：每次现读墙钟、与存储里写在前的租约和用过的最晚时刻比对，回拨 ⇒ `'unavailable'`；自带 `clock_lease` 迁移片段与迁移前核对 `clockPreflight`                                                                            | 实现完整                                                                                                                                          |
| `tenancy/credential-verification-scrypt`                                                          | `credentials` 服务面（解析、派生材料、比对、政策判定；密码 scrypt）                                                                                                                                                               | 实现完整                                                                                                                                          |
| `tenancy/account-identity-sql`                                                                 | `capability.account-identity` v1 与 v2 的 `accounts`／`logins` 服务面（v2：出示物与 `LoginStateId` 分离、`logins.exchange`）、`account` 与登录状态表的迁移片段                                                                    | 实现完整                                                                                                                                          |
| `tenancy/organization-governance-sql`                                                      | `capability.organization-governance` v1 的四个服务面、迁移片段工厂（跨 owner 外键的目标与名字由装配给）                                                                                                                           | 实现完整                                                                                                                                          |
| `tenancy/account-registration-sequential`                                                             | `composition.account-registration` v1 的 `registration` 服务面                                                                                                                                                                    | 实现完整                                                                                                                                          |
| `tenancy/governance-center-entry-node`                                                          | `composition.governance-center-entry` v1 的入口层，落在传输绑定 `…-https-json` v1 上：插件 `governance-center-entry`（TLS 客户端一面、判定次序、27 条路由）与 `governance-center-ops`（本机套接字完整体检）、迁移片段、迁移前核对 | 实现完整；包内常量见包 [README](tenancy/governance-center-entry-node/README.md)                                                                        |

`infra` 组名与 `apps/tenancy-host` 节点名已由产品负责人拍板（D-027，2026-09-23）。
各包的分层状态与遗留见各自的 realization 节点 README；全部成员的测试记在运行 `2026-09-23-tests-tenancy-leg-2`。

## 文档与维护入口

能力组与成员各自维护文档，规则归[两层成员文档](../docs/member-documentation.md)。组README说明真实成员的工程分工、依赖和组合验证，包README说明使用、契约、设计及维护。必要内容登记缺项，独立阅读任务再拆专题；新模板的采用不表示这些现有包已经整改。

## 硬约束

- 基础设施**不提供 in-memory 实现**：存储开发期用 sqlite 文件库，只改配置切 pg；测试用临时文件。
- 失败值字面以契约为准，两套拼法并存（`account-identity` kebab-case，其余 camelCase），不自造统一层。
- 公开定义及完整行为承诺由接口拥有者维护；有效承诺变化须明确依据、影响和采用范围，同步当前消费者。
- `packages/` 与 `apps/` 内不得出现墙钟（`infra/`、测试及D047的具名副本显示取时文件除外）、`ctx.bail(`；`accounts.produce(`、`organization-purge` 等受限调用只有注册组合够得着——由 [tools/ts-checks](../tools/ts-checks/README.md) 在 `pnpm run check` 里守，规则全集见其 README。

## 历史

2026-09-20 这里曾回退到空骨架：此前一批上游 fork 源码与「目标设计」文档随旧设计链退役，
原件在 Git 历史（`git log --oneline -- packages/session/session`）。2026-09-22 起按
D-023
接受的租户领域规格重新建包。

N4 公共形状与纯计算分别归 [core/organization-governance](core/organization-governance/SPEC.md) 和 [core/model-request-runtime](core/model-request-runtime/SPEC.md)。SQL 治理和 local 模型提供者的现行范围由模块旁 SPEC 明确。

R1-T2新增 [身份定义](core/account-identity/SPEC.md)、[注册定义](core/account-registration/SPEC.md) 和
[装配关闭协调器](core/assembly-lifecycle/SPEC.md)，以及两张网络面共用的 [EntryOpening](core/governance-center-entry/SPEC.md)。
身份提供者纯根、正式 Service 和真实宿主管理绑定已进入施工验证；完整 L3 验收尚未完成，不能由成员表推断整改已接受。

R1-T4新增 [插件树合成与加载机制](core/cordis-plugin-tree/SPEC.md)，复用装配关闭协调器。
治理宿主接入与本增量 L3 验收仍在实施中。
