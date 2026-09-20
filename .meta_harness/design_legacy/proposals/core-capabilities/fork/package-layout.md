# 按能力族和职责包组织源码 fork

本次修订消费用户 2026-09-14 的明确要求：从第一天起按能力族和领域职责布局
`packages/`。它取代[原施工计划](plan.md)中以共同来源/构建方便为由合成
`dsh-baseline`、以后再拆包的选择。D-005/D-006/D-008 的能力与规格承诺不变；
这是已有源码起点的包边界修订，不新增目标产品实现或重发冻结规格。

## 依据与组织规则

固定上游仍为 `c291e7961a515f6d7af9304e7fd1d257929aef26`。
[上游 packages 说明](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/README.md)
按能力族组织，叶子包区分能力定义、具体提供者和消费扩展，bundle 负责组合。
本项目采用这种责任判断；上游 `core` 同时容纳默认 Loop 等产品骨架，不能将
其内容照搬为本项目内核。分组目录不创建 package.json，也不是服务或部署节点。

每个叶子包拥有源码、依赖、公开入口、测试、许可和来源映射。能力定义、提供者、
消费扩展有独立变化/依赖/生命周期职责时分包；无独立职责时不加转发壳。
消费者依赖定义与契约，具体提供者由装配选择。共享类型只拥有一份定义，不能靠
复制类型或状态来消除依赖。来源、迁移批次和 baseline 状态不作为聚合产品包的理由。
长期规范落在 [workspace](../../../maintenance/workspace.md)，各级 README 维护导航。

## 本轮叶子包与依赖

以下 npm 名称均以 `@omne-harness-lite/` 为前缀，均保留 private、0.0.0 和唯一
`./baseline` 公开入口。这个入口明确当前是源机制，后续产品 API 按其目标契约开发。
包名表达职责，baseline 不再是一个装入所有能力的包。无需旧路径兼容入口。

| 能力族/叶子目录 | npm 名称 | 当前实际职责 | 本地运行依赖 |
|---|---|---|---|
| core/scope | scope | 唯一作用域身份、父链、路由 carrier 与受管贡献容器 | 无 |
| core/agent | agent | 已选 agent 注册、factory、initiator 与 dispatch 原语 | scope |
| util/brand | brand | 名义类型品牌辅助 | 无 |
| util/values | values | JSON 值判定、快照与冻结 | 无 |
| util/timeout | timeout | timer/signal 协作原语，无产品超时政策 | 无 |
| media/content | media-content | 源附件引用、错误和纯请求投影辅助 | brand |
| model/llm | llm | 源消息、请求配置、流累积/装配、错误与归因 | brand、values、media-content |
| session/session | session | 源内存历史、surface/header、序号与 SessionStore | scope、brand、values、llm |
| session/projection | session-projection | 源投影定义、注册与 fold | session |
| session/persistence | session-persistence | 源存储接口、句柄及数据校验 | session、brand、values |
| storage/jsonl | jsonl | 普通文件写入、同步、追加回滚与首行读取 | 无 |
| context/system-prompt | system-prompt | 动态 prompt 贡献与渲染 | scope、llm |
| tools/tools | tools | 源工具定义、Schema、贡献、调用与呈现 | scope、llm、values |
| agent/loop | agent-loop | runtime-context 与 assistant-stream 的驱动辅助 | session、llm |

表中运行依赖包括公开声明需要的 type-only 边；Cordis 和 zod 等第三方依赖由
实际使用包自行声明，版本沿既有锁定。测试使用的额外包只列 devDependencies。
`core/scope` 只保留一份活动 Symbol/WeakMap；agent 与全部能力直接消费同一个
公开入口，不留 agent 的 scope 转发。包间不从相邻 src/dist 路径穿透访问。

源 llm 的 Message/ContentBlock 是现有源消息词汇的唯一实现定义；保留 Session
等对这些纯类型/算法的依赖，无模型网络服务反向依赖。它们不冒充 D-008 的
core-work v1。当前拆包不引入第二份产品共享数据模型；以后目标实现必须消费
core-work 的唯一实现映射。JSONL 尚不是 Session/DR 提供者，因此放 storage
辅助包；不创建尚未实现的 persistence-jsonl、审批或 OpenRouter 空包。

## 历史验证范围

迁移绑定 `475389d`，逐文件身份与实际结果由下节证据保留。公开依赖、单一 scope、
来源映射与隔离产物的验证共同约束本次拆分；当前布局继续由 workspace 和包拥有者维护。

验收要求：原 666 项行为测试的语义覆盖保留（混合测试可按职责拆文件）；所有
14 个真实包独立构建/消费；依赖无环，工具检查不掩盖未声明依赖；一个 scope
实现被真实多包组合共同消费；来源原件、许可和修订记录完整；活动索引无旧
包路径，历史记录有迁移导航。通过这些检查只支持重组后的源基线，不支持宣称
目标租户/耐久审批/HITL/完整模型出口已实现。main 合并和外部发布不在本次范围。

## 接受与验证

2026-09-14，任务作者依据用户要求调整实际布局的授权，结合独立只读评审，接受
本次组织方向并由 [D-009](../../../decisions/D-009-package-organization.md)记录。
评审者没有代为接受，未表述为用户逐项审阅了叶子名称。

architecture-reviewer 评审基线为 `475389d`，候选本文 SHA-256 为
`99c9200cdd3df053f9eb94f22762782e7403a88668bc65be4be528bcb296401d`。
在包、依赖、源码归属及验证方案范围内无阻断问题；建议在外部 tarball 的
strict tsc 夹具中，通过公开 baseline 入口扩展 SessionEventMap、
SessionProjectionStateMap/Map 并运行实际 projection。已采纳至
[公开扩展夹具](../../../../tools/package-checks/fixtures/projection.ts)。
该评审未运行实现测试，也没有重评 D-005/D-006/D-008 产品契约。

迁移文件映射见[迁移清单](evidence/package-layout-migration.json)；实际实施与
验收结果见[布局交付](package-layout-delivery.md)。
