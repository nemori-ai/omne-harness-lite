# 当前 AM3 固定资源图实际编译探针

主调度在HUB9e0103a1、Node24.18.0用真实built公开`content-blocks/schema-runtime`执行。原 [脚本](AM3-resource-closure-probe.mjs)、[输出](AM3-resource-closure-probe.log)、[机器结果](AM3-resource-closure-probe.json)、[配置](configuration.json) 与13份实际Schema输入快照完整保留。没有实际领域判定、资产求值、Connector提供者或形式工具执行。

当前AM3全部25 defs：0项旧补充时22编译/3缺AM2；仅CB2仍22/3；CB2+AM2仍22/3缺TD2；补齐CB2+AM2+TD2才25/0。原失败输出逐项保留，不以最终绿覆盖。仅编译当前AM3所可达defs，不声称全旧AM2/Connector2所有defs图或任意第三方资源图闭合。

原脚本保留原相对路径以保持byteequal；复跑在单独检出恢复到`tmp/core-delivery/AM3-resource-closure-probe.mjs`，按配置恢复对应13规范字节和源9e0103a1的公开built schema-runtime，再在该检出根运行记录argv。脚本会写自己的同目录结果，使用新run目录保存，不能覆盖本原件。

采纳范围与独立架构复核归 [D-068](../../decisions/core-implementation-spec-reconciliation/decision.md) 及 [机制评审](../../proposals/message-and-stream-baseline/reviews/2026-09-26-core-representation-and-resource-review.md)。探针实际发生时八份3尚候选；之后规格接受不改变当时run身份。
