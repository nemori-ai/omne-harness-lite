# 项目开发文档的维护

本项目在这里维护**把这个仓库开发起来所需的说明**：环境、布局、检查、防御指导，
并通过 `blogs/` 接入独立的个人博客仓库。[README](README.md) 是阅读地图。
博客的归属与权威边界见[源码布局](workspace.md#目录与内容归属)，写作加载 `write-blog` skill。

## 这里不收什么

> **产品设计、系统架构与规格设计，以及产品/系统/算法 research 的权威正文，一律不进 `docs/`。**

它们归 [`.meta_harness/`](../.meta_harness/AGENTS.md)——那是可独立迁出的设计工作区，
拥有需求、产品正文、统一语言、规格、决定、研究与 agent 能力的**唯一**源。
一份材料若用于规定「系统该是什么样」或作为设计决定的正式依据，它的家就在那边，
**不因为它同时对开发者有用就在这里留一份**。

| 想写的东西 | 实际该去哪 |
|---|---|
| 某个能力该怎么建模、边界画在哪 | `.meta_harness/design/`，加载 `harness-design-handbook` skill |
| 某个概念精确指什么 | [统一语言](../.meta_harness/design/ubiquitous_language/README.md) |
| 上游到底保证什么、别人怎么做的 | [research](../.meta_harness/research/README.md) 或 [agents/research](../.meta_harness/agents/research/README.md) |
| 接受某个选择的正式依据 | 实际承诺拥有者的当前正文；接受过程归工作树 tmp |
| 面向读者讲述工程复盘、解释技术方案与实验 | `blogs/` 子模块，加载 `write-blog` skill |
| 设计知识怎么组织、版本怎么走 | [design/AGENTS.md](../.meta_harness/design/AGENTS.md) 的准入，与各区 README |
| **环境、命令、源码归属、检查含义、编码防御** | **这里** |

## 修改时守住的边界

- **命令与路径改了，先改实现再改说明**：环境或命令变化先改包配置、脚本及其所属说明，
  再同步[开发指南](development.md)的示例；**改完要实际把那条路径跑一遍**，不靠通读确认。
- **不在这里维护第二份权威**：源码归属的正文在[源码布局](workspace.md)，
  检查含义的正文在[验证与证据](verification.md)；其他文件引用它们，不复制结论。
- **防御指导的正文、编号与复核记录都在**[同一页](defensive-patterns.md)。
  新增或退出一条要附证据与范围，**一次没出错不足以认定提醒可以移除**。
- **不维护计数、进度与清单**：包有几个、检查覆盖多少，从实际配置与工具输出读，
  写进正文就会过期。

局部措辞或链接修复只展开被改的那一份与相称检查。
涉及新的能力边界、保证或取舍时，**这里不是落点**——回到 `.meta_harness/`。
