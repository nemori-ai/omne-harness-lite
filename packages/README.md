# 产品包

这里放产品的可复用包，按 `packages/<能力族>/<职责包>/` 两层组织：第一层只组织相关能力，
**不是 workspace 成员**；第二层才拥有 `package.json`、`src`、依赖、公开入口和测试。
布局规则见[源码布局](../docs/workspace.md)，承诺归属见[架构维护入口](../.meta_harness/design/architecture/README.md)。
未迁包的分层状态仍由其 realization 节点记录，新单元不预建四件套。

## 当前成员

| 包                                                                                         | 兑现什么                                                                                                                                                                                                                          | 状态                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`frontend/governance-center-client`](frontend/governance-center-client/README.md)         | 公开health与EC2/HT2无状态治理协议客户端                                                                                                                                                                                           | D038/D045受限实现；不含CLI命令与登录存储                                                                                                          |
| [`frontend/client-local-state`](frontend/client-local-state/README.md)                     | CLS1本地完整记录、比较替换与资源收场                                                                                                                                                                                              | D046提供者增量；不含网络用例和CLI/TUI                                                                                                             |
| [`frontend/governance-client-operations`](frontend/governance-client-operations/README.md) | 共享治理用例、固定使用、本地结算与安全结果                                                                                                                                                                                        | D047；CLI/TUI装配仍需独立完成                                                                                                                     |
| `core/identity-values`                                                                     | `data.identity-values` v1：身份值解析与相等、上级链纯函数、Schema 校验、交接凭证（Ed25519）、不透明标识生成                                                                                                                       | 实现完整，测试对契约 examples 机检                                                                                                                |
| `core/offer-expiry`                                                                        | `data.offer-expiry` v1：`Instant`／`Duration`、`OfferTiming`、派生状态、`offer_ttl` 解析、`Clock` 形状；`./testing` 给可控时钟替身                                                                                                | 实现完整                                                                                                                                          |
| `core/kernel-basis`                                                                        | Cordis 4.0.4 取证 probe（`tests/basis/`）、`definePlugin`、`Outcome`／`Ack`、`FIBER_STATE`、`resolveOptional`；`./testing` 的 `bootAssembly`                                                                                      | 实现完整；basis 条目的 `probe` 指向这里                                                                                                           |
| `core/storage`                                                                             | 存储协议：一次读／写事务、`lockRow`／`lockSentinel`、四型失败、`mapStorageError`；`./conformance` 是任何提供者都必须通过的一致性套件                                                                                              | 实现完整                                                                                                                                          |
| `infra/storage-sql`                                                                        | 协议的 Kysely 提供者：sqlite（`node:sqlite`，自写 Driver）／postgres 由配置切换，迁移运行器，错误码映射，升级守卫（属主排他、迁移前只读核对、sqlite 快照与确认）；插件 `storage-sql` provide `storage`                            | sqlite 上一致性套件与升级测试全绿；pg 16 上一致性套件 19／19、升级测试 3／3（运行 `2026-09-23-tests-tenancy-leg-2`）；pg 本版只接线、不作部署目标 |
| `infra/clock-lease`                                                                        | `clock` 服务：每次现读墙钟、与存储里写在前的租约和用过的最晚时刻比对，回拨 ⇒ `'unavailable'`；自带 `clock_lease` 迁移片段与迁移前核对 `clockPreflight`                                                                            | 实现完整                                                                                                                                          |
| `tenancy/credential-verification`                                                          | `credentials` 服务面（解析、派生材料、比对、政策判定；密码 scrypt）                                                                                                                                                               | 实现完整                                                                                                                                          |
| `tenancy/account-identity`                                                                 | `capability.account-identity` v1 与 v2 的 `accounts`／`logins` 服务面（v2：出示物与 `LoginStateId` 分离、`logins.exchange`）、`account` 与登录状态表的迁移片段                                                                    | 实现完整                                                                                                                                          |
| `tenancy/organization-governance-sql`                                                      | `capability.organization-governance` v1 的四个服务面、迁移片段工厂（跨 owner 外键的目标与名字由装配给）                                                                                                                           | 实现完整                                                                                                                                          |
| `tenancy/account-registration`                                                             | `composition.account-registration` v1 的 `registration` 服务面                                                                                                                                                                    | 实现完整                                                                                                                                          |
| `tenancy/governance-center-entry`                                                          | `composition.governance-center-entry` v1 的入口层，落在传输绑定 `…-https-json` v1 上：插件 `governance-center-entry`（TLS 客户端一面、判定次序、27 条路由）与 `governance-center-ops`（本机套接字完整体检）、迁移片段、迁移前核对 | 实现完整；包内常量见包 [README](tenancy/governance-center-entry/README.md)                                                                        |

`infra` 组名与 `apps/tenancy-host` 节点名已由产品负责人拍板（[D-027](../.meta_harness/design/record/decisions/infrastructure-names-and-sqlite-durability/README.md)，2026-09-23）。
各包的分层状态与遗留见各自的 realization 节点 README；全部成员的测试记在运行 `2026-09-23-tests-tenancy-leg-2`。

## 硬约束

- 基础设施**不提供 in-memory 实现**：存储开发期用 sqlite 文件库，只改配置切 pg；测试用临时文件。
- 失败值字面以契约为准，两套拼法并存（`account-identity` kebab-case，其余 camelCase），不自造统一层。
- 契约目录（`.meta_harness/design/spec/**/v1/`）不可改；实现发现契约措辞问题报 spec owner。
- `packages/` 与 `apps/` 内不得出现墙钟（`infra/`、测试及D047的具名副本显示取时文件除外）、`ctx.bail(`；`accounts.produce(`、`organization-purge` 等受限调用只有注册组合够得着——由 [tools/ts-checks](../tools/ts-checks/README.md) 在 `pnpm run check` 里守，规则全集见其 README。

## 历史

2026-09-20 这里曾回退到空骨架：此前一批上游 fork 源码与「目标设计」文档随旧设计链退役，
原件在 Git 历史（`git log --oneline -- packages/session/session`）。2026-09-22 起按
[D-023](../.meta_harness/design/record/decisions/tenant-domain-design-acceptance/README.md)
接受的租户领域规格重新建包。

N4 公共形状与纯计算分别归 [core/organization-governance](core/organization-governance/SPEC.md) 和 [core/model-request-runtime](core/model-request-runtime/SPEC.md)。SQL 治理和 local 模型提供者的现行范围由模块旁 SPEC 明确。
