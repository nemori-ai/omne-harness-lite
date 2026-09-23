# 斜杠命令怎样被识别、解析与留痕：Codex、Claude Code、DSH、omne-next 与 pi

五个来源里，一行以 `/` 开头的输入**什么时候算命令、怎样切出名字与参数、「展开成提示词」与「宿主内置动作」怎样区分、
展开后会话记录里留下什么**，以及它们对照本项目产品正文时各条款能不能承载。

这项调查要区分：各家**实现**怎么做（源码、实例、实测会话记录）、**文档**怎么说（两者分叉时逐处记下），
以及产品正文**还没有说法**的地方（只报告，不裁决）。它**不能**支持「本项目该选哪种识别或解析规则」——那归本程的 proposal。

- 调查对象与基线（2026-09-23 取证）：
  - Codex `5c5308fc9a9ee789049d646ef11e5400384b9c6f`（TUI 源码 + 2026-09-20 官方文档副本 + issue）
  - Claude Code `2.1.280`（官方文档原样字节钉存于 [`sources/`](sources/provenance.json) + 本机实例字符串探针 + 本机会话记录 + issue）
  - DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`（`0.1.5-rc.2`）
  - omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`（前缀分类器代码 + ADR-063 与命令需求，后两者无实现）
  - pi `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`（只作对照）
- 对照的产品正文：[PF-002 §4 Slash Command](../../design/product/PF-002-assets-settings-and-permissions/design.md#slash-command)（rev 11）、
  [PF-014](../../design/product/PF-014-inbound-intake-and-queueing/design.md)（rev 3）§5 / §6、
  [PF-016](../../design/product/PF-016-cli-tui-delivery-surface/design.md)（rev 3）§5.4 / §5.7 / §9、
  [UL-slash-command](../../design/ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)，
  以及产品负责人 2026-09-23 裁决（斜杠命令两种性质：提示词的名称 / 触发系统业务流程的命令名），本包只当输入。
- 消费者：本程 proposal「斜杠命令识别与解析基线」（待出现）。
- 最近核对：2026-09-23 / 上列版本。

## 准入核对

- **对象与版本**都钉到 SHA 或精确版本号；Claude Code 无源码，官方文档以原样字节随包钉存（`SHA256SUMS`），hooks 页复用同程 topic 的钉存字节。
- **Codex 的 TUI 源码没有钉存字节**：主检出钉住的 tarball 不含 `codex-rs/tui`，本轮从本机另一份同 SHA 克隆 `git archive` 取得，并与钉住 tarball 的共有路径逐文件比对一致；复现需要任一 openai/codex 克隆。
- **Claude Code 的实现证据只有两类**：已压缩二进制的字符串探针（不是源码阅读），与本机会话记录（只覆盖本机用过的命令，`/compact`、`/goal` 样本来自 2.1.227）。探针词与命中计数见[当轮报告](reports/2026-09-23-slash-command-parsing.md#claude-code-实例探针)。
- **omne-next 的命令框架整体未交付**：除前缀分类器外全部是 Proposed ADR 与 committed-future 需求，引用时标〔设计〕。
- **没有做任何运行实验**：标「推断」的边界行为都没有被构造反例验证；负面结论全部是「读遍未找到」档（清单见 [evidence.md](evidence.md#负面结论的强度)）。
- **两面证据**：各家短板取自 GitHub issue（CC 与 Codex 各细读 5 条，检索式与零命中记录在当轮报告）、上游作者的决策记录与文档—代码分叉；DSH 与 pi 未检索 issue tracker。
- 与 [connector-and-slash-command-sources](../connector-and-slash-command-sources/README.md) 分工：那边是对象形状（身份、绑定、生命周期），本包是输入识别与留痕；重叠处引用那边编号，**对其 E-S13 的一处 DSH 行为给出代码层面的反向观察**（见当轮报告「对已交付 topic 的补正」）。
- 未读 `design_legacy/`。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（含「对照产品正文时撞上的缺口」） | [研究正文](research.md) |
| 13 条产品条款 × 5 个来源的五档对照表、各家内建命令清单与归类、歧义案例集 | [当轮报告](reports/2026-09-23-slash-command-parsing.md) |
| 来源、行号与取证条件是否可复核；文档与实现在哪里分叉 | [证据索引](evidence.md) |
| 按来源分别看到了什么 | [Codex](notes/codex.md)、[Claude Code](notes/claude-code.md)、[DSH](notes/dsh.md)、[omne-next](notes/omne-next.md)、[pi](notes/pi.md) |
| Claude Code 官方文档的原样字节 | [`sources/`](sources/provenance.json)（校验：`sha256sum -c SHA256SUMS`） |

只读研究正文就知道当前该信什么；要还原某个判定当时看了哪几行、为什么这样推，再展开当轮报告与来源笔记。
