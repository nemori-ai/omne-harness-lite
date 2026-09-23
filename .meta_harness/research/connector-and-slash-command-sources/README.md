# 连接件与斜杠命令：前身与 DSH 各自长成了什么样

以本项目前身 omne-next `omne_harness` 为起点、DeepSeek Harness（DSH）为第二参照，
核对两类资产的参考形状：**连接件**（[PF-002 §4 Connector](../../design/product/PF-002-assets-settings-and-permissions/design.md#connector)（rev 10），外部消息往里送的接入件）
与**斜杠命令**（[PF-002 §4 Slash Command](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 10），用户主动发起的入口）。

这项调查要区分三件事：两源**实际实现了什么**（代码）、**只设计了什么**（ADR、需求、设计文档，含 Proposed 与 committed-future），
以及它们的形状与本项目产品正文**在哪些条款上对得上、在哪些条款上方向相反**。
它**不能**支持「本项目该选哪种形状」——那归本程的 proposal。

- 调查对象与基线：omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（本机 `/data/qiwei/repos/omne-next`，排除 `.claude/worktrees/` 副本）；
  DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-root@0.1.5-rc.2`，本仓库 `tmp/sources/dsh-c291e79.tar.gz` 解包）。取证日期 2026-09-23。
- 对照的产品正文：PF-002 rev 10、PF-014 rev 3、PF-015 rev 10、PF-016 rev 3，以及统一语言
  [UL-connector](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-connector--连接件--connector)、
  [UL-slash-command](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)、
  [UL-inbound-arrival](../../design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival)。
- 消费者：本程 proposal「Connector 与 Slash Command 形状起点」（待出现）。
- 最近核对：2026-09-23 / 上述两个 SHA。

## 准入核对

- **两源都是单一快照**：未核对 git 史。omne-next 的 ADR 修正案层层叠加，**文档与代码有已知漂移**（改名未落码、SDK 与服务端路由不一致），
  逐处记在[证据记录](evidence.md)；凡两者冲突，结论以代码为准并写明分叉。
- **omne-next 的斜杠命令与大半连接件能力停在设计层**：用户命令协议 ADR-063 是 Proposed，相关需求全部是 `committed-future`；
  omne-next 自己在 2026-09-10 核实「尚无任何已交付的用户命令机制」。引用它的斜杠命令形状时**必须标明「设计，未实现」**。
- **DSH 不是多租户系统**，也没有权限层；它在租户、授权、安装权限上的空白是**没有这回事**，不是「做了别的选择」。
- 历史线索来自 `research/legacy_backup/` 下两份旧 topic，只用来找入口；本包的每条事实都在上述 SHA 上重新取证，未读 `design_legacy/`。
- 来源立场：两源的文档都是**作者自述**；omne-next 另有代码与其自己的 traceability 矩阵作反证，DSH 的短板取自其 README 的
  「Known Limitations」段与源码。未检索两源的 issue tracker。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（含两张「PF 条款 × 两源」对照表） | [研究正文](research.md) |
| 来源、行号与取证条件是否可复核 | [证据记录](evidence.md) |
| 当轮的完整论证、九问逐条回答与失败的检索 | [当轮报告](reports/2026-09-23-connector-and-slash-command.md) |

只读研究正文就知道当前该信什么；要还原某个判断当时看了哪几行、为什么这样推，再展开当轮报告。
