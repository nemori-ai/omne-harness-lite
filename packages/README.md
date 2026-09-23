# 产品包

这里放产品的可复用包，按 `packages/<能力族>/<职责包>/` 两层组织：第一层只组织相关能力，
**不是 workspace 成员**；第二层才拥有 `package.json`、`src`、依赖、公开入口和测试。
布局规则见[源码布局](../docs/workspace.md)。每个包对应一个
[realization 节点](../.meta_harness/design/realization/README.md)，节点 README 记录它的分层状态。

## 当前成员（2026-09-22，租户领域第一程）

| 包 | 兑现什么 | 状态 |
|---|---|---|
| `core/identity-values` | `data.identity-values` v1：身份值解析与相等、上级链纯函数、Schema 校验、交接凭证（Ed25519）、不透明标识生成 | 实现完整，测试对契约 examples 机检 |
| `core/offer-expiry` | `data.offer-expiry` v1：`Instant`／`Duration`、`OfferTiming`、派生状态、`offer_ttl` 解析、`Clock` 形状；`./testing` 给可控时钟替身 | 实现完整 |
| `core/kernel-basis` | Cordis 4.0.4 取证 probe（`tests/basis/`）、`definePlugin`、`Outcome`／`Ack`、`FIBER_STATE`、`resolveOptional`；`./testing` 的 `bootAssembly` | 实现完整；basis 条目的 `probe` 指向这里 |
| `core/storage` | 存储协议：一次读／写事务、`lockRow`／`lockSentinel`、四型失败、`mapStorageError`；`./conformance` 是任何提供者都必须通过的一致性套件 | 实现完整 |
| `infra/storage-sql` | 协议的 Kysely 提供者：sqlite（`node:sqlite`，自写 Driver）／postgres 由配置切换，迁移运行器，错误码映射；插件 `storage-sql` provide `storage` | sqlite 上一致性套件全绿；pg 只接线、未跑 |
| `infra/clock` | `clock` 服务：单调钟锚定 + 存储里写在前的租约，回拨 ⇒ `'unavailable'`；自带 `clock_lease` 迁移 | 实现完整 |
| `tenancy/credential-verification` | `credentials` 服务面（解析、派生材料、比对、政策判定） | **只有类型与义务清单**，实现在第二程 |
| `tenancy/account-identity` | `capability.account-identity` v1 的 `accounts`／`logins` 服务面 | **只有类型、失败集合类型测试与契约场景 `it.todo`** |
| `tenancy/organization-governance` | `capability.organization-governance` v1 的四个服务面 | 同上 |
| `tenancy/account-registration` | `composition.account-registration` v1 的 `registration` 服务面 | 同上 |

`infra` 组名与 `apps/tenancy-host` 节点名已由产品负责人拍板（[D-027](../.meta_harness/design/record/decisions/infrastructure-names-and-sqlite-durability/README.md)，2026-09-23）。
第一程的范围、验收与遗留见 `tmp/tenancy-leg-1-plan.md`（本地计划，不入库）与各节点 README。

## 硬约束

- 基础设施**不提供 in-memory 实现**：存储开发期用 sqlite 文件库，只改配置切 pg；测试用临时文件。
- 失败值字面以契约为准，两套拼法并存（`account-identity` kebab-case，其余 camelCase），不自造统一层。
- 契约目录（`.meta_harness/design/spec/**/v1/`）不可改；实现发现契约措辞问题报 spec owner。
- `packages/` 内不得出现墙钟、`ctx.bail(`，`accounts.produce(` 与 `organization-purge` 只有注册组合够得着——由 [tools/ts-checks](../tools/ts-checks/README.md) 在 `pnpm run check` 里守。

## 历史

2026-09-20 这里曾回退到空骨架：此前一批上游 fork 源码与「目标设计」文档随旧设计链退役，
原件在 Git 历史（`git log --oneline -- packages/session/session`）。2026-09-22 起按
[D-023](../.meta_harness/design/record/decisions/tenant-domain-design-acceptance/README.md)
接受的租户领域规格重新建包。
