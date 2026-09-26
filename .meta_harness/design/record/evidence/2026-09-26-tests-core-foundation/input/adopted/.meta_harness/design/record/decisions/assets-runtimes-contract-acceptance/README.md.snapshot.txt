# D-041：接受资产／工具运行时／模型请求运行时一程的 34 份候选契约（2026-09-26 已接受）

- **当前状态：已接受、已冻结。**产品负责人于 2026-09-26 通过 [D-045](../assets-runtimes-formal-acceptance-2026-09-26/decision.md) 签署本决定（G4），接受下表 34 份精确契约；catalog 的 acceptance 指向本包，全部版本资源已追加到 frozen.json。
- **来源**：三份拆分提案与 D-039 的接受；两轮独立评审（`tmp/assets-runtimes/reviews/README.md`，第一轮阻断 32 → 第二轮阻断 10 → 修复波 2 后主线定点核无阻断）；主线裁定汇编 D-040 §三～§七（有效裁定已由 D-045 追认）；F 反向核对（`tmp/assets-runtimes/f-reverse-check.md`）；形式证据 run [`2026-09-25-formal-assets-runtimes`](../../evidence/2026-09-25-formal-assets-runtimes/README.md)。
- **范围定位**：只解决「这 34 份契约（含各自「已知缺口」表里仍开着的缺口，作为显式缺口）是不是有权者接受的精确对象」。**不解决**：实现与验证；账本 `tmp/assets-runtimes/pending-user-rulings.md` 里列给产品负责人的待裁项（它们是产品面的，接受契约不等于替它们作答——契约按主线倾向先落，用户改判时走新版本）；connector 的 install→usableBy 与 G-4（等专项讨论）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）；已于 2026-09-26 签署 |
| 接受记录 | 见[决定正文](decision.md)的实际接受依据与 D-045 |
| 精确修订 | main `d35b9f7a` 的设计正文；接受状态对齐后按 registry／D-045 清单登记资源 hash |
| 接受范围 | 下表 34 份，条款范围写在 [`acceptance.json`](acceptance.json)；含各契约「已知缺口」表——接受的是缺口以显式缺口存在 |
| 保留前提 | 各产品 topic 的当前 rev（见各契约页首）；Cordis 4.0.4（D-025）；D-039 的拆分与领域名；D-040 仍有效的裁定已由 D-045 追认 |
| 取代关系 | 不取代任何决定；`capability.organization-governance` v2 不自动升级 v1 的消费者（D-023 接受的 v1 仍有效） |

## 接受对象

| 契约 | 版本 | 条款范围 |
|---|---|---|
| `capability.asset-evaluation` | 1 | S-1..S-44 |
| `capability.asset-governance` | 1 | S-1..S-65 |
| `capability.asset-registry` | 1 | S-1..S-47 |
| `capability.asset-transfer` | 1 | S-1..S-53 |
| `capability.hooks-import` | 1 | S-1..S-36 |
| `capability.loop-extension-runner` | 1 | S-1..S-52 |
| `capability.mcp-bridge` | 1 | S-1..S-38 |
| `capability.modality-projection` | 1 | S-1..S-37 |
| `capability.model-profile-directory` | 1 | S-1..S-33 |
| `capability.model-request-runtime` | 1 | S-1..S-52 |
| `capability.organization-governance` | 2 | S-1..S-61 |
| `capability.stream-assembly` | 1 | S-1..S-39 |
| `capability.tool-admission` | 1 | S-1..S-48 |
| `capability.tool-execution-runtime` | 1 | S-1..S-69 |
| `capability.session-log` | 1 | S-1..S-31（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.assembly-manifest` | 1 | S-1..S-31（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.session-tenancy` | 1 | S-1..S-15（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.run-attempt-facts` | 1 | S-1..S-18（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.credential-custodian` | 1 | S-1..S-28（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.execution-environments` | 1 | S-1..S-24（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `capability.center-connection` | 1 | S-1..S-15（接口契约，[D-043 R-1](../assets-runtimes-rulings-2026-09-25/README.md)） |
| `data.arrival-events` | 1 | S-1..S-35 |
| `data.asset-model` | 1 | S-1..S-36 |
| `data.call-accounts` | 1 | S-1..S-39 |
| `data.connector` | 1 | S-1..S-23 |
| `data.content-blocks` | 1 | S-1..S-34 |
| `data.loop-extension` | 1 | S-1..S-41 |
| `data.mcp-endpoint` | 1 | S-1..S-26 |
| `data.messages` | 1 | S-1..S-50 |
| `data.model-profile` | 1 | S-1..S-28 |
| `data.model-response` | 1 | S-1..S-35 |
| `data.skill-package` | 1 | S-1..S-32 |
| `data.slash-command` | 1 | S-1..S-29 |
| `data.tool-definition` | 1 | S-1..S-31 |

返回[决定](../README.md)。
