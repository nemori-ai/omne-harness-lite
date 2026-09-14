# 能力契约

可消费的精确身份、版本和接受依据以 [catalog](../catalog.json) 为准。
已接受的 [Live Agent 运行时 v1](live-agent/v1/contract.md)由
[能力入口](live-agent/README.md)分别说明正式规格、源码 fork 和目标实现的进度。
固定上游的历史 draft 另作来源保留，不将源基线自动作为产品契约。
其它候选继续从[提案入口](../../docs/proposals/README.md)展开。

- D-012 已接受：[run-driver](run-driver/README.md) v1 与 [session-run](session-run/README.md) v2（Inbound 到达账本）。
- D-008 已接受的本批能力：[durable-records](durable-records/README.md)、[tenant-governance](tenant-governance/README.md)、[action-authorization](action-authorization/README.md)、[session-run](session-run/README.md)、[human-decisions](human-decisions/README.md)、[tools](tools/README.md)、[model-execution](model-execution/README.md)、[media-content](media-content/README.md)、[budget-accounting](budget-accounting/README.md)、[engineering-observation](engineering-observation/README.md)、[command-input](command-input/README.md)。

能力目录不要求各自复制共享 Schema 或跨能力模型。数据定义沿 `spec/data/` 复用，
跨能力性质沿 `spec/compositions/` 建模；尚未建模的条款也不能据此算作已验证。
本批具体映射、有限范围与未完成义务见[验证范围](../../docs/proposals/core-capabilities/verification.md)。
接受契约、形式检查与实现验收的含义分别归[规格入口](../README.md#验证职责)。
