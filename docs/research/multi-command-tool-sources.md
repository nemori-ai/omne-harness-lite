---
kind: research
id: R-multi-command-tool-sources
scope: PF-024 的 omne_core_v1 多命令工具范式、来源差异与设计输入
---

# 多命令工具定义的来源核对

[PF-024](../requirements/product/agent/PF-024-multi-command-tool-definition.md) · [研究索引](README.md)

2026-09-13，按用户指定核对 `omne-next/omne_core_v1`。本地来源提交为
`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；下列文件与该提交的 Git blob
内容核对一致。本轮为文档、源码及相关测试的静态阅读，未安装或执行源工具，
不把源文档中的历史测试结果计作本轮实测。

本项目已确认的是“一套工具集按 Unix CLI 式使用、组装时只占一个工具槽位”。
源实现提供参考，未获得整体移植、采用其依赖或继承全部扩展协议的授权。

## 来源及可借鉴内容

| 来源与状态 | 固定版本的观察 | 本项目的设计输入 |
|---|---|---|
| [概念指南][guide]：使用文档 | 单一 LangChain tool 路由多个子命令；相关操作共享总览与帮助；比较 flat 和 typed_union | 支持 PF-024 的统一入口及命令式使用含义；具体模型工具适配由本项目定义 |
| [规范实现][implementation]：`FlatMultiCommandArgs`、`BaseMultiCommandTool` | 一个模型绑定入口，`command` 选择处理器；flat 的 params 可为字典或类型化参数；运行时参数由框架注入 | 区分模型可见调用信息、命令参数契约及可信执行上下文 |
| [规范实现][implementation]：`register_command`、`_built_in_help_handler` | 注册命令描述、参数简述和可选校验模型；自动注册 help；总览按可见集合呈现，详细帮助定位命令 | 命令目录、渐进获取用法及执行前校验的参考；不直接选定 help 字段或注册 API |
| [ADR-C014][unification]：Accepted，2026-05-09 | 统一到 core_v1 基类；保留 typed flat 与字典 params 的 flat 两类使用路径；讨论命令 Schema 演化如何影响模型绑定 | 模型入口、参数信息丰富度与定义演化需要分别判断；该 ADR 的 Python 基类选择只在来源项目生效 |
| [ADR-C013][gates]：文件头仍为 Proposed | 讨论命令/批级 gate、保留 help 与两层参数校验对齐；相关机制已能在源码定位 | 保留候选文档身份和实现观察的区别；help 不应陷入“先读 help 才能读取 help”的循环，文档学习条件不能替代授权 |
| [flat 测试][flat-tests]与[类型联合测试][union-tests]：静态检查 | 存在命令路由、帮助、隐藏命令拒绝、参数校验、错误反馈、Schema 合成等场景 | 可作为后续契约场景线索；本轮未运行，不能宣称通过 |
| [batch 测试][batch-tests]：静态检查 | 存在批内顺序、错误后停止/继续、HOLD、帮助独占及多模态聚合等场景 | 多命令定义与一次执行多条命令是分别需要选择的能力；PF-024 尚未确认批处理协议 |

## 文档差异与证据限制

- 指南只介绍 flat / typed_union；源码 `dispatch_mode` 的声明及分派路径还包含
  batch，ADR-C014 也明确存在三种模式。指南不能充当完整模式清单。
- 指南把已读标志放在 params 内；当前 `FlatMultiCommandArgs` 把它们定义在
  顶层，并兼容从 params 提升。源码和 flat 测试支持这一观察，字段位置留作
  上游版本事实，不直接决定本项目的调用形状。
- 指南说空可见集合时 help 列出空；flat 测试
  `test_empty_visible_commands_help_lists_nothing` 实际断言 `ERROR:`，
  因 help 自身也被隐藏。本项目尚未选定这一边界，不能把两种行为合并为保证。
- ADR-C014 引用并修订 ADR-C013，但后者文件头仍为 Proposed。本轮没有据
  引用或代码存在反向修改其接受状态，也没有采用它们的门控政策。

## 对后续工具设计的影响

单个模型工具入口可以对应多个具有不同参数和效果的命令。应在本项目定义中
明确该关系，再评估 DSH 的 Schema、注册和执行管线代码怎样承接；不会因
选定 fork 起点就丢掉这一已确认范式。单槽位是条目数量约束，上下文体积还
取决于描述、参数展开与帮助装载，后续比较须分别观察。

命令隐藏、帮助已读检查和真实授权有不同依据；当前权限仍需约束实际动作。
单个命令的状态、结果、后台能力与调用控制应能落到 PF-003 等既有要求上。
是否需要独立命令身份、分级命令树、批处理或特殊执行者，均留待语言无关
契约设计，不从该 Python 类层次直接推导服务、插件或存储划分。

[guide]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_core_v1/docs/guides/advanced/agentic/multi-command.zh.md
[implementation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_core_v1/libs/omne_core_v1/omne_core_v1/agentic/tool/patterns/multi_command.py
[unification]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/adrs/ADR-C014-multi-command-base-class-unification.md
[gates]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/adrs/ADR-C013-multi-command-gate-protocol.md
[flat-tests]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_core_v1/tests/unit/agentic/tool/patterns/test_multi_command_flat.py
[union-tests]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_core_v1/tests/unit/agentic/tool/patterns/test_multi_command_typed_union.py
[batch-tests]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_core_v1/tests/unit/agentic/tool/patterns/test_multi_command_batch.py
