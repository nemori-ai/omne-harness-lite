# D-025：Cordis 采用版本 `@deepseek-ai/cordis` 4.0.4

- **当前状态：已接受，一个版本号。**闭合条件（probe 在 4.0.4 上全绿）尚未兑现，见下表。
- **来源**：[D-023](../tenant-domain-design-acceptance/decision.md) 把「Cordis 采用版本」列为未闭合项；
  [basis/cordis](../../../basis/README.md#当前状态) 四条条目 `version: 4.0.2`、`probe: null`，按 [basis 准入](../../../basis/README.md#准入)属待核对主张；
  投影 v1 [Q-13／Q-14](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)。
- **需求与方法前提**：根 `AGENTS.md`「项目心智模型」「Cordis 直接使用官方发布包」；
  [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel) 的维护边界。
- **实际接受依据**：2026-09-22 实施规划会话，产品负责人（`panqiwei`）在「4.0.2（与 basis 行号、手册基线、已装源码一致）」与「4.0.4（最新，须按 4.0.4 重取证）」之间选 **4.0.4**。

## 选择与范围

| 来源中的选择项 | 本次处置与依据 | 被接受的精确范围 | 仍待决或未验证的部分 |
|---|---|---|---|
| 第一批产品包依赖的 Cordis 版本 | **接受 4.0.4**：跟最新发布，取证一次到位；代价是 basis 四条的 `lines` 与三条待核对主张要按 4.0.4 源码重核 | 承载仓库 `packages/**` 对 `@deepseek-ai/cordis` 的依赖钉 `4.0.4`；basis 条目的 `version` 改 `4.0.4` | probe 尚未写；4.0.2→4.0.4 的变更清单未读（上游 CHANGELOG 未随包发布），差异只能由 probe 与源码对读揭示 |

## 理由与保留前提

版本要在第一次建包前定，否则每个包各钉各的。选最新而不是取证基线，是因为取证工作（probe）本来就要做，
做在 4.0.4 上不比做在 4.0.2 上多；反过来先钉 4.0.2 再升级要做两次。
**前提**：probe 是版本变化传播到设计的唯一通路（[basis README](../../../basis/README.md#怎样被消费)）——
probe 没写完之前，任何「4.0.4 与 4.0.2 语义相同」的说法都只是读源码的推断，不是依据。

## 取代与影响

不取代任何决定。

| 受影响拥有者/消费者 | 应更新的引用 | 闭合条件 |
|---|---|---|
| [basis/cordis](../../../basis/README.md#当前状态) 四条 | `version: 4.0.4`、`lines` 按 4.0.4 重核、`probe` 指向 `packages/core/kernel-basis/tests/basis/<id>.test.ts`、`checked` 改为取证日期 | **已完成**（2026-09-22，四条 probe 在 4.0.4 上通过；`async-control-not-bail` 的读数按 4.0.4 源码改正：Promise 被当作 bail 值而非被忽略，结论不变） |
| 六节点共用的三条待核对主张（可选 inject 语义、`ctx.provide` 纳管、插件体抛出后 fiber 状态）与 account-registration 的 `ctx.fiber.state` 读取 | 升为 basis 条目或写进 `kernel-basis` 节点 verification | **已完成**（2026-09-22，四个 probe 与 basis 四条同目录，见 [basis 当前状态](../../../basis/README.md#当前状态)；是否升格为条目另议） |
| 四个 tenancy 插件节点 `design.md` 的「手册基线 4.0.2，采用版本尚无决定」 | 改为指向本决定 | 随节点 README「源码位置」同批更新 |
| [D-023](../tenant-domain-design-acceptance/decision.md)「取代与影响」表 | Cordis 采用版本一项标已闭合 | **已完成** |
| 承载仓库根 `pnpm-workspace.yaml` catalog | `@deepseek-ai/cordis: 4.0.4` | **已完成**（2026-09-22，catalog 钉 4.0.4） |

**不表示**：任何 Cordis 语义已被核实（那要看 probe）；DSH 其他复用组件（fork 维护的那些）的采用版本已定；4.0.x 后续补丁自动采用——升级要重跑全部 probe 并出新决定或在本决定下记一次核对。

返回[本 topic 入口](README.md)。
