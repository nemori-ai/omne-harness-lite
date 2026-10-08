# 验证输入

`content-before-admission.schema.json` 是准入拒绝扩展的独立回归输入，供 `assertContentSchemaTransition` 核对变化范围。它不作为当前公共 Schema，不导出、不发布；当前形状归 `schema/content-blocks.schema.json`。

该输入保持原规范字节，固定 SHA-256 为 `809d2a5db29db6a91096535017cc9bf4e7f75a3b93469520173e82916fff1bb5`。测试必须同时核对固定摘要和已采用的精确变化：允许拒绝结果、拒绝原因及对应条件，其他形状保持。不能用当前文件覆盖本输入，或从当前文件生成预期来消除失败。


content-examples.md 保留完整形状／具名拒绝／消费者行为输入；admission-examples.md 只保留名字封口增量的规范输入，避免重复整份正文。输入的 JSON、预期及手算不是单次执行记录。当前行为以 [SPEC](../../SPEC.md) 为准；字节基准不能从候选重算。
