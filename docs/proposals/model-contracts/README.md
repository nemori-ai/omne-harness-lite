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
