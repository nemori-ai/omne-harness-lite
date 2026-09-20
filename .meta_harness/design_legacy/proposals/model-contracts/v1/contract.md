# 模型档案及组成定义候选契约（v1）

状态：**in-review**。本文件保留历史定义的数据、操作、事件和不变量；术语不表达聚合、服务或运行时所有权。它不改变“所有模型请求统一经 OpenRouter 边界发出”的已确认约束，也不把档案变成请求、响应、会话选择、Agent 或工具行为的拥有者。

## 模型档案

模型档案由 `(tenant_id, routing_name)` 识别，其中 `routing_name` 必须规范化且非空。其数据为：`tenant_id`、`routing_name`、`origin`、`routing`、`modalities`、`aptitudes`、`limits`、`preprocessing_constraints`、`created_at`、`updated_at` 和 `withdrawn_at`。

候选生命周期操作为 `create_custom`、`create_official`、`update`、`withdraw`、`relist`。候选命令为 `CreateCustomLLMProfile`、`UpdateCustomLLMProfile`、`WithdrawCustomLLMProfile`、`SeedOfficialLLMProfiles`、`RelistLLMProfile`；候选事件为 `LLMProfileCreated`、`LLMProfileUpdated`、`LLMProfileWithdrawn`、`LLMProfileRelisted`。

撤回保留档案和变更台账；以相同名称复活时恢复原身份。`official` 档案只能由受信任的部署组合种入，公开写入面不得修改或撤回。某轮选择了模型是会话侧事实，只能引用此身份和所需快照。

## 路由约束

路由约束是 `allowed_providers` 和 `fallback_allowed`：前者为非空、有序、唯一的字符串列表，后者为布尔值。它表达 OpenRouter 路由约束，不包含密钥、客户端或请求状态。实际将约束应用到请求属于模型请求行为，未由本候选批准。

## 模态集合

输入 `inputs` 与输出 `outputs` 都是非空集合，成员只能为 `text`、`image`、`audio`、`video`。集合约束保留为候选数据语义；运行时如何拒绝或降级超出模态的请求未定义。

## 令牌限额

`max_input_tokens` 和 `max_output_tokens` 都是大于零的整数。它们的限额含义被保留；超出限额时的请求处理不是数据结构可独立决定的行为。

## 来源词表

`origin` 的闭集为 `official`、`custom`。`official` 的受信任种入条件保留在模型档案的生命周期规则中，不能因词表单独存在而丢失。

## 能力声明等级

`aptitudes` 是固定九个应用能力键到等级的映射。等级闭集为 `strong`、`medium`、`weak`、`unable`，只表示档案声明，绝不表示运行时保证或已验证能力事实。

## 旧定义到候选的映射

| 旧定义 | 数据承接 | 行为/不变量承接 | 原件/候选附件 |
|---|---|---|---|
| `domain.aggregate.LLMProfile@1` | 本节所列全部档案字段和身份 | 生命周期、五个命令、四个事件、official 限制、撤回/复活、会话事实边界 | [model](../../../../spec/archive/ddd-models/domain/aggregates/llm-profile/v1/model.md)，[schema](../../../../spec/archive/ddd-models/domain/aggregates/llm-profile/v1/schema.json) |
| `domain.value-object.ModelRouting@1` | providers 与 fallback | 非空、有序、唯一；只表达 OpenRouter 路由约束 | [model](../../../../spec/archive/ddd-models/domain/value-objects/model-routing/v1/model.md)，[schema](../../../../spec/archive/ddd-models/domain/value-objects/model-routing/v1/schema.json) |
| `domain.value-object.ModelModalities@1` | inputs、outputs | 两集合非空且成员受限 | [model](../../../../spec/archive/ddd-models/domain/value-objects/model-modalities/v1/model.md)，[schema](../../../../spec/archive/ddd-models/domain/value-objects/model-modalities/v1/schema.json) |
| `domain.value-object.ModelLimits@1` | 两个 token 上限 | 两值均为正整数 | [model](../../../../spec/archive/ddd-models/domain/value-objects/model-limits/v1/model.md)，[schema](../../../../spec/archive/ddd-models/domain/value-objects/model-limits/v1/schema.json) |
| `domain.enum.ModelOrigin@1` | `official`/`custom` | official 的写入授权条件由档案操作承担 | [model](../../../../spec/archive/ddd-models/domain/enums/model-origin/v1/model.md) |
| `domain.enum.AptitudeTier@1` | 四级词表和九键声明 | 声明与运行时保证严格区分 | [model](../../../../spec/archive/ddd-models/domain/enums/aptitude-tier/v1/model.md) |

## 未决事项与 Schema 覆盖缺口

- 历史 LLMProfile Schema 的 `aptitudes` 只有 `minProperties: 9`，没有表示固定九个键；本候选保留该缺口，未自行发明键集。
- 历史 Schema 不能证明档案身份唯一、revision、时间顺序、状态转换、撤回/复活、授权或跨租户引用规则。
- 预处理约束的结构和语义、`routing_name` 的规范化规则、档案更新字段和事件载荷未定义。
- 档案绑定到请求、会话选择、模型切换与超限处理的行为仍待单独 review。
