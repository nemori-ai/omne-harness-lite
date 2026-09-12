# 开发模型评估

本目录保存切换**开发 agent**主力模型前，对防御辅助是否仍有收益的可审阅
实验。它不评价产品运行时 agent：后者的用户目标、会话分布、外部副作用和
验收证据不同，必须另立协议，不能挪用这里的结论。

评估对象是某一候选模型在明确的模型、推理、harness、工具和 prompt 条件下，
对同一防御辅助的三种处理：`retain`、`simplify` 与 `remove`。系统保证、用户
约束和正式契约不属于可由本实验移除的辅助；它们的变更仍由所属规格和决定
授权。[D-003](../decisions/D-003-defensive-evaluation.md) 是这一边界的接受
依据，[防御模式](../defensive-patterns.md) 说明目前指导和保证的导航，
[维护规则](../maintenance/defensive-evolution.md) 规定何时复核和怎样记录退出。

## 运行与结果

固定的第一版开发任务集在 [developer-model-v1.json](suites/developer-model-v1.json)。
它含训练与留出任务，覆盖权威归属、未批准提案、无新观测的重争论、因果复议、
局部修改的流程负担，以及跨边界、取消和资源保证。它是评估输入，不是产品
runtime 基准。

实验报告须符合 [Schema](formats/developer-model-experiment.schema.json)，并用：

```sh
python spec/tools/evaluate_developer_model.py path/to/report.json
```

命令验证报告和本地证据文件，输出仅有 `evidence-ready` 或
`needs-completion`。前者只表示三种处理、训练/留出、重复运行、版本和 hash、
约束观察、成本及人工记录已齐全；它不计算显著性、不判定哪一方案更好、不授
权采用、更不切换模型。`needs-completion` 明确缺项、未观察的关键约束、失败
约束或不可验证证据。真实模型调用、付费调用和模型切换都不在此工具范围内。

每个报告的 `adoption_record` 必须由人填写为 `undecided`、`adopt` 或
`do_not_adopt`，并说明限定范围。候选在这些任务上表现良好最多支持“在该范围
内可能已内化此辅助”的假设；它不证明模型永不犯错，也不能外推到未测模型、
工具、prompt、任务或产品 runtime。

完整字段语义、执行和复核方式见 [协议](protocol.md)。
