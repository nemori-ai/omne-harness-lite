# 可复用方法

这里维护“怎样建模、设计与验证 harness”的方法依据及演化；guide/governance 等容器仍按实际导入状态消费。
已整理的架构方法集中进入 [handbook 的参考包](../agents/skills/harness-design-handbook/canonical/references/topics.md)，
此处不复制第二套正文；旧指南与新 skill 的权威入口后续统一切换。

| 目录 | 归属 |
|---|---|
| `guide/` | 范式、能力建模、运行演化、性质与证据、示例及参考 |
| `governance/` | 需求维护、知识流转、接受、版本与验证方法 |
| `research/`、`proposals/`、`decisions/` | 方法自身的研究依据、候选评审与接受选择 |

## 方法研究

- [外部 harness 的提案与决定机制](research/harness-design-decisions/README.md)：按具体仓库修订核对设计知识治理及候选比较，事实与可借鉴建议分别记录；不自动改变本工作区的采用规则。

topic 模板包与其家族相邻，归 [design 各 family 的 .templates/](../design/README.md#主题是信息包)，
本目录不维护集中模板或重复副本。

待设计系统的具体需求和设计归 [design/](../design/README.md)；可执行的 skill 入口归
[agents/](../agents/README.md)。返回 [Meta Harness](../README.md)。
