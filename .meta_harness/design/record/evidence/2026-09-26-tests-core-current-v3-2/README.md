# 当前采用图的 MCP 夹具修正与检查器原证据

W6 当前完整依赖测试实际发现 MCP 包的资源交接夹具仍提供 Loop2，而它调用的公开 `createAssetModelJudge` 已采用 AM3；AM3 冻结 AssetContent 显式引用 LoopExtensionDefinition3。主调度在 HUB 独立 [复现155通过／2引用失败](MCP-current-AM3-fixture-before.log)，保存 [原命令与时间](MCP-current-AM3-fixture-before.json) 及完整旧夹具。只将这一测试资源坐标2改3，所有断言不动，MCP产品与冻结Schema明确仍2；之后 [157 tests](MCP-current-AM3-fixture-after.log)、[类型](MCP-current-AM3-fixture-types.log)、[格式](MCP-current-AM3-fixture-format.log) 全通过。

[采用依据、前后源码SHA](MCP-resource-fixture-correction.json) 与源提交 `0ec3eed2d5a5d3323caea5e8775de095fa13f3f0` 对应；[配置与维护输入](configuration.json)、源码 tar 保留当时图。只有MCP正文端口真实，其他夹具端口仅交固定资源且其动作一旦调用就抛错；它不证明其他正文、任意资源解析或Connector提供者。最终W6全依赖门在修正后另跑，不拿这157项替代。

本次另外保存此前实际 HUB `eabfff0f` 检查器299测试／10文件与27规则扫描的原日志及 [原运行索引](D068-dependency-pilot-HUB-release.json)。检查器全部源自该提交至本次快照未变，原结果只按原范围复用，不因本次收录重标运行时间。[299原输出](D068-self-resource-tests.log) 和 [27扫描原输出](D068-pilot-HUB-scan-r3.log) 不证明完整opaque数据流／全部消费者SC3，不造测试或把通用非零当目标负例。原索引列出的其他历史日志在首次任务区，不冒称本run完整复制了原索引的每个文件。

这次记录不更改规格、产品政策、SP3收场、Connector延期或用户总体门；不覆盖先前 [当前 core run](../2026-09-26-tests-core-current-v3/README.md) 的旧输入。原失败和新通过各保留原文。
