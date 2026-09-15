# media-content 的验证范围

本页说明各版本条款有哪些证据支持、哪些没有。更新本页不改动冻结的版本目录。

## v2

[v2](v2/contract.md) 没有形式模型，本轮也没有新增模型：内容取得、保留与交付的性质是
跨能力的接口义务与失败处置，没有需要模型检查的状态空间被识别出来。不为此建立空模型，
条款的符合性由消费者契约与提供者验收承担。

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [CT-01](v2/contract.md) 操作面、限额可查询、gone 语义 | 无模型；[CD v2 Schema](../../data/core-work/v2/schema.json) 的 `MediaRef` / `MediaMetadata` 提供结构证据 | 暂存回收、保留期结束后的具名 gone、限额查询的真实行为 |
| [CT-02](v2/contract.md) 引用与占用共同成立、跨提供者保留 | 无自有模型；共同提交的原子性与恢复由 [CC v2](../../compositions/core-work-coordination/v2/contract.md) 的 `Admission` / `Recovery` 模型在其自身范围内支持（见 [core-capabilities 验证范围](../../../docs/proposals/core-capabilities/verification.md)） | 外部字节提供者的保留、认回与 GC 屏障 |
| [CT-03](v2/contract.md) 输入原件引用与 delivery | 无模型；模型能否原生消费某模态由 [model-execution](../model-execution/README.md) 的 `ModelSelection` 在其范围内支持（见 [core-capabilities 验证范围](../../../docs/proposals/core-capabilities/verification.md)） | 真实模态送达、文件直送的 provider 能力 |
| [CT-03](v2/contract.md) 工具生成媒体的来源记录与帧/结果去重（v2 新增） | 无模型；[tools v2](../tools/v2/contract.md) 的结果与帧条款是该规则的消费侧，其 `ToolCall` 模型不建模媒体 | 全部：`producedBy` 的记录时机、同一 `mediaId` 在帧与结果中的客户端去重 |
| [CT-04](v2/contract.md) 内容流、部分成功与缺失块 | 无模型；缺失块的形状由 [CD v2](../../data/core-work/v2/contract.md) 的 `missing` 给出 | 流的实际顺序、刷新与恢复后的最终一致、媒体失败的独立呈现 |

## v1

[v1](v1/contract.md) 的覆盖情况相同（不含 v2 新增的来源记录与去重规则）；当时的设计来源
与评审见 [core-capabilities 提案](../../../docs/proposals/core-capabilities/README.md)与其
[验证范围](../../../docs/proposals/core-capabilities/verification.md)，其中"媒体 GC"被明确
列为待后续实现验收的项目。
