# Claude Code / Codex hooks 与本项目 Loop 拓展点的对照

本项目的 Loop 拓展点是从状态点推出来的十一个位置，外加两个维度与三档干预力（[PF-012 §5.8](../../design/product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)，rev 7）。
这项调查把 Claude Code 与 Codex 的 hooks 逐个事件摊开，看它们各落在哪个位置、需要哪档干预力、哪些落不上，
哪些输出和「只能靠改日志起作用」「可否决挂了当否决」「系统不替人作答」相撞；并评估 DSH 的 hook-protocol 与两个桥接包作为兼容层起点时差在哪。
它同时为「租户经 hook 自定义人机协作流程」收集三方的现有能力（[PF-008](../../design/product/PF-008-human-in-the-loop/design.md#52-那个判断函数)，rev 4）。

**它区分的是**：哪些是宿主协议本身的事实（随宿主版本失效），哪些是按 PF-012 定义作出的映射推断（随产品正文 rev 失效）；
**它还不能支持的**：Claude Code 2.1.280 的实测行为（本轮只有文档）、Codex 的 rollout 持久化（副本不含）、任何「兼容层该怎么做」的选择。

- 调查对象与基线：Claude Code **2.1.280**（官方 hooks 参考页 2026-09-23 快照，随包保存）；Codex 源码 **`5c5308fc9a`** + 2026-09-20 文档副本；
  DSH **`c291e796`**（`0.1.5-rc.2`）`packages/hooks/*`；独立旁证 cc-master `613a00e7` 的 Codex 探针（对象 0.142.5–0.145.0）。
- 消费者：本程 proposal「hooks 兼容层基线」（待出现）。
- 最近核对：2026-09-23 / 上述版本（首轮）。

## 准入核对

调查对象、精确版本、取得方式与各来源的立场与局限，逐项记在 [证据记录](evidence.md)；取证条件与结论不写在同一页。本轮有三处限制要随结论一起传下去：

- **Claude Code 只有文档证据**：无源码、未跑探针；页内最高提到 v2.1.274，本机是 2.1.280。
- **Codex 副本不含 rollout 持久化代码**：hook 记录与 `updatedInput` 改写是否落盘，未核。
- **事件→位置的映射是本轮按 PF-012 rev 7 所作的推断**，不是宿主自述；宿主的「轮」与本项目的 Run 边界不完全重合。

本家族不拥有方案选择：结论只写到「这条事实让什么变得不可能、什么要额外付出代价」为止。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么 | [研究正文](research.md) |
| 来源、取证条件与局限是否可复核 | [证据记录](evidence.md) |
| 某一轮当时的完整报告原貌（事件逐项表、映射全表、映射不上的清单、跨宿主差异） | [历次报告](reports/) 按日期取用：[2026-09-23](reports/2026-09-23-hooks-to-positions.md) |
| 按来源分别看到了什么 | [来源笔记](notes/)：[Claude Code](notes/claude-code.md) · [Codex](notes/codex.md) · [DSH](notes/dsh-hook-protocol.md) |

Claude Code 官方参考页的原样快照在 [sources/](sources/)，附 `provenance.json` 与 `SHA256SUMS`。
只读研究正文就知道当前该信什么；要核对原始引文、行号或还原当时的完整映射时，才展开来源笔记与报告。
