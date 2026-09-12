# LLMProfile @ 1

限定名：`domain.aggregate.LLMProfile@1`

LLMProfile 是一个模型的完整档案，也是该模型在一个租户模型目录中的成员资格聚合根。身份为 `(tenant_id, routing_name)`。它不代表模型请求、响应、会话选择或 Agent。

## 内容

- `tenant_id`、规范化且非空的 `routing_name`
- `origin`：`domain.enum.ModelOrigin@1`
- `routing`：`domain.value-object.ModelRouting@1`
- `modalities`：`domain.value-object.ModelModalities@1`
- `aptitudes`：固定九个应用能力键，值为 `domain.enum.AptitudeTier@1`
- `limits`：`domain.value-object.ModelLimits@1`
- `preprocessing_constraints`、`created_at`、`updated_at`、`withdrawn_at`

## 生命周期

`create_custom`、`create_official`、`update`、`withdraw`、`relist`。撤回保留聚合和变更台账；同名复活恢复原聚合身份。official 档案只能由部署组合根种入，公开写面不可修改或撤回。

## 命令与事件

命令：`CreateCustomLLMProfile`、`UpdateCustomLLMProfile`、`WithdrawCustomLLMProfile`、`SeedOfficialLLMProfiles`、`RelistLLMProfile`。

事件：`LLMProfileCreated`、`LLMProfileUpdated`、`LLMProfileWithdrawn`、`LLMProfileRelisted`。模型在某轮被选中属于会话侧事实，只引用本聚合身份和必要快照。

所有模型请求统一经 OpenRouter 边界发出；模型档案不拥有工具或 Agent 行为。
