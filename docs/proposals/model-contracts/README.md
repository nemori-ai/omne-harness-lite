# 模型档案契约候选

状态：**in-review**。本目录承接历史 LLM 档案和其组成定义的语义；它不是正式规格，不批准模型目录服务、请求执行、会话选择或新字段。

权威候选正文是 [v1/contract.md](v1/contract.md)。四个历史 JSON Schema 仍作为[归档原件](../../../spec/archive/ddd-models/README.md)保留，只有候选附件地位，不能被描述为正式或完整行为验证。

| 旧定义 | 候选中的单义引用 |
|---|---|
| `domain.aggregate.LLMProfile@1` | [模型档案](v1/contract.md#模型档案) |
| `domain.value-object.ModelRouting@1` | [路由约束](v1/contract.md#路由约束) |
| `domain.value-object.ModelModalities@1` | [模态集合](v1/contract.md#模态集合) |
| `domain.value-object.ModelLimits@1` | [令牌限额](v1/contract.md#令牌限额) |
| `domain.enum.ModelOrigin@1` | [来源词表](v1/contract.md#来源词表) |
| `domain.enum.AptitudeTier@1` | [能力声明等级](v1/contract.md#能力声明等级) |

未决事项和 Schema 覆盖缺口在候选正文中明确列出。被接受后才可进入 `spec/{data,capabilities,compositions}` 与 catalog。

## 当前需求对应与缺口

需求依据为 [SYS-LLM](../../requirements/system/constraints.md#sys-llm)，动态变化的
目标见 [SYS-DYNAMIC](../../requirements/system/fully-dynamic-system.md)。现有候选仅有
档案和路由数据输入，不能证明所有实际请求统一经 OpenRouter，也未定义动态更新
对在途工作的完整含义。

后续 [PF-023](../../requirements/product/user/PF-023-session-model-selection-and-continuity.md)
确立会话级合法模型切换：候选读面、耐久模态判据、未知能力、目标窗口的一次
非破坏压缩、选择不外溢及下一轮接续，尚未在本候选中建模。
[PF-022](../../requirements/product/agent/PF-022-multimodal-response-and-output.md)
同时要求模型原生多模态输出与工具结果可交付；档案声明不能证明实际链路具备
这些能力。逐 Step 金额归 [PF-019](../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md)，
模型选择与费用准入需衔接，不能把 token 限额当货币预算。

2026-09-12 按 D-004 补充本入口的当前关系，使用本轮需求工作区快照；
这不是对旧版本的历史追溯声明，也不改变 in-review 状态。接受具体设计前再固定
所采用的确认条款与 Git 基线。

本批当前接受范围现从 [D-008 核心能力](../core-capabilities/README.md)进入；
本页历史候选仍保持原来源身份，未覆盖部分不随新决定自动接受。
