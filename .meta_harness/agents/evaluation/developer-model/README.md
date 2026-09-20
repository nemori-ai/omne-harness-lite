# 开发 agent 防御辅助评估

本目录保存切换开发 agent 模型或提示时，对一项防御辅助采用 `retain`、`simplify` 或 `remove`
的可审阅实验。它不评价产品 runtime agent，也不授权修改产品保证、用户约束或正式契约。

## 采用边界

当前仅采用这里的证据协议和公开样例；旧产品来源中的采用决定保留为来源事实，不自动成为这个自包含工作区的授权。
退出任何辅助都要有明确有权者接受，记录模型、版本、harness、工具、prompt、任务范围、替代机制和复核触发。
缺少足够证据时保持既有辅助，不把“尚未观察失败”解释为模型已经内化规则。
模型、harness、工具、prompt 或任务分布发生实质变化，已知故障复发，或保护边界改变时，重新评估原采用决定。

## 运行与结果

公开任务包见 [developer-model-v1.json](suites/developer-model-v1.json)，格式见
[task-suite Schema](formats/task-suite.schema.json)。它可用于调优，不是真正的留出集，也不是产品 runtime 基准。
真实实验须另存未参与调优的冻结检验集、hash 与防污染声明。

报告须符合 [experiment Schema](formats/developer-model-experiment.schema.json)。若执行仓库提供兼容检查器，
记录其精确版本、命令和输出；当前 Meta Harness 尚未自带该 CLI，因此 Schema 通过本身只能证明结构，不能宣称证据完整。

`evidence-ready` 只表示基线及候选各 arm、冻结留出、重复运行、可回查配置、约束观察、成本和人工记录齐全。
违反关键约束是完整的负面证据；未观察、缺失轨迹或条件不可比才是不完整。完整解释见[协议](protocol.md)。
