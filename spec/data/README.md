# 数据契约

本目录只登记明确接受的版本化契约，身份和版本状态以 [catalog](../catalog.json) 为准。规范表达与维护见[规格入口](../README.md)。

本轮 [Agent 运行时共享身份](agent-runtime-identity/README.md)有独立范围与接受依据。
其他候选见[提案入口](../../docs/proposals/README.md)，不因组织迁移自动生效。

- [共享工作身份、动作与内容](core-work/README.md)：v1 由 D-008 接受；v2 由 D-015 接受，补齐内容块（`reasoning`、`system_reminder`、`deferred_receipt`、`tool_call.validation`、嵌套 `tool_result.value`）与命令声明维度。
