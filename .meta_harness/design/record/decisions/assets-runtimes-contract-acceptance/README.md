# D-041：接受资产／工具运行时／模型请求运行时一程的 27 份候选契约（**待产品负责人签字**）

- **当前状态：草案，未接受。**主线（自驱授权下，2026-09-25）把本程契约阶段的全部产物整理成可签字的接受材料；**签字前 catalog 一律 `candidate`、`frozen.json` 不登记**。产品负责人签字后：`acceptance.json` 的 `status` 改 `accepted`，catalog 27 条翻 `accepted` 并指向本包，各 v1／v2 目录逐文件登 `frozen.json`。
- **来源**：三份拆分提案与 D-039 的接受；两轮独立评审（`tmp/assets-runtimes/reviews/README.md`，第一轮阻断 32 → 第二轮阻断 10 → 修复波 2 后主线定点核无阻断）；主线裁定汇编 D-040 §三～§七（**逐条追认留产品负责人**，追认与本决定可同一次签）；F 反向核对（`tmp/assets-runtimes/f-reverse-check.md`）；形式证据 run [`2026-09-25-formal-assets-runtimes`](../../evidence/2026-09-25-formal-assets-runtimes/README.md)。
- **范围定位**：只解决「这 27 份契约（含各自「已知缺口」表里仍开着的缺口，作为显式缺口）是不是有权者接受的精确对象」。**不解决**：实现与验证；账本 `tmp/assets-runtimes/pending-user-rulings.md` 里列给产品负责人的待裁项（它们是产品面的，接受契约不等于替它们作答——契约按主线倾向先落，用户改判时走新版本）；connector 的 install→usableBy 与 G-4（等专项讨论）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`）；**尚未签** |
| 接受记录 | 待：签字时在[决定正文](decision.md)「实际接受依据」补对话原话与日期 |
| 精确修订 | HUB 分支 `panqiwei/assets-runtimes` 修复波 2 之后的提交（签字时以当时 HEAD 为准，登 `frozen.json`） |
| 接受范围 | 下表 27 份，条款范围写在 [`acceptance.json`](acceptance.json)；含各契约「已知缺口」表——接受的是缺口以显式缺口存在 |
| 保留前提 | 各产品 topic 的当前 rev（见各契约页首）；Cordis 4.0.4（D-025）；D-039 的拆分与领域名；D-040 的裁定被追认或被逐条改判 |
| 取代关系 | 不取代任何决定；`capability.organization-governance` v2 不自动升级 v1 的消费者（D-023 接受的 v1 仍有效） |

## 接受对象

| 契约 | 版本 | 条款范围 |
|---|---|---|
| `capability.asset-evaluation` | 1 | S-1..S-42 |
| `capability.asset-governance` | 1 | S-1..S-65 |
| `capability.asset-registry` | 1 | S-1..S-47 |
| `capability.asset-transfer` | 1 | S-1..S-53 |
| `capability.hooks-import` | 1 | S-1..S-36 |
| `capability.loop-extension-runner` | 1 | S-1..S-49 |
| `capability.mcp-bridge` | 1 | S-1..S-38 |
| `capability.modality-projection` | 1 | S-1..S-37 |
| `capability.model-profile-directory` | 1 | S-1..S-33 |
| `capability.model-request-runtime` | 1 | S-1..S-52 |
| `capability.organization-governance` | 2 | S-1..S-61 |
| `capability.stream-assembly` | 1 | S-1..S-39 |
| `capability.tool-admission` | 1 | S-1..S-48 |
| `capability.tool-execution-runtime` | 1 | S-1..S-69 |
| `data.arrival-events` | 1 | S-1..S-35 |
| `data.asset-model` | 1 | S-1..S-36 |
| `data.call-accounts` | 1 | S-1..S-39 |
| `data.connector` | 1 | S-1..S-23 |
| `data.content-blocks` | 1 | S-1..S-34 |
| `data.loop-extension` | 1 | S-1..S-40 |
| `data.mcp-endpoint` | 1 | S-1..S-26 |
| `data.messages` | 1 | S-1..S-50 |
| `data.model-profile` | 1 | S-1..S-28 |
| `data.model-response` | 1 | S-1..S-35 |
| `data.skill-package` | 1 | S-1..S-32 |
| `data.slash-command` | 1 | S-1..S-29 |
| `data.tool-definition` | 1 | S-1..S-31 |

返回[决定](../README.md)。
