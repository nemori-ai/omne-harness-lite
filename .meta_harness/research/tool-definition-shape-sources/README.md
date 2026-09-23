# 三个参考源的工具定义形状

这项调查查三个参考源各自的「工具定义」由什么构成，并与本项目产品正文里「一份工具定义长什么样」逐条对照：
[PF-006 §5.3](../../design/product/PF-006-tools-and-skills/design.md#53-一份工具定义长什么样)（rev 14）连同它引用的常驻、依赖、替换件、返回值、执行环境、模态、后台诸节，
[PF-002 的身份、Tool 与 MCP](../../design/product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现)（rev 10），
[PF-007 的多命令范式与 `Tools()`](../../design/product/PF-007-meta-capabilities/design.md#多命令范式)（rev 16）。

它要区分的是：**哪条条款在哪一源里现成就能承载，哪条要改，哪条与该源的既有机制方向相反，哪条三源都没有。**
它不回答该选哪一源、怎样拼：研究只写到这些事实让什么不可能、要付出什么代价。

- 调查对象与基线：
  - DeepSeek Harness `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-root@0.1.5-rc.2`，主检出 `tmp/sources/dsh-c291e79.tar.gz`，SHA-256 已钉）
  - omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（本机克隆；`langchain-core 1.6.1`、`langgraph 1.2.11`）
  - 本仓库 `feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`（**未进 main、不是证据、只作形状参考**）
  - 以上均为 2026-09-23 静态阅读，未运行测试。
- 消费者：本程的 proposal「工具定义基线」（待出现）。
- 最近核对：2026-09-23 / 上述三个版本；产品正文 PF-006 rev 14、PF-002 rev 10、PF-007 rev 16。

## 准入核对

三源的精确版本、取得方式、立场与各自局限记在 [证据记录](evidence.md) 的「取证条件总览」。
下面三条局限必须随结论一起往下传：

- **全部是静态阅读。**三源的测试本轮都没跑，行为观察来自源码、生成文档与作者笔记，不是运行结果。
- **minimal-runtime 不是证据。**它是本项目的实验分支，引用的是已退役谱系的候选契约；本包只拿它当「形状长什么样」的参考，
  它自述的未闭合项原文照录，不代表本项目的现行状态。
- **omne-next 与 minimal-runtime 的路径是本机活路径，没有钉成归档**（DSH 已钉），路径失效后只能靠 commit SHA 重新取得。
  `research/legacy_backup/multi-command-tool-sources/` 只当线索用过，事实都已在上述修订上重新取证。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么；对照表；发现的产品正文张力 | [研究正文](research.md) |
| 来源、行号与立场是否可复核 | [证据记录](evidence.md) |
| 六个调查问题的逐条回答与逐格理由 | [当轮报告 2026-09-23](reports/2026-09-23-tool-definition-shape.md) |

只读研究正文就知道当前该信什么；要追某一格为什么这样评、或还原取证过程里被修正的判断时，再展开当轮报告。
