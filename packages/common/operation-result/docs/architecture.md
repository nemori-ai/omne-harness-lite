# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

本包只有一个模块 [src/index.ts](../src/index.ts)。它导出两个类型和四个函数，没有状态、资源或配置，也不导入任何模块。

成员位置：`packages/common/operation-result`，属于 `common` 组。该组放至少有两个具名消费者、且原语义拥有者确认含义一致的纯表示，见[组说明](../../README.md)。

依赖方向：本包不依赖其他组，也不依赖 `common` 组内的其他成员，`package.json` 的 `dependencies` 为空。其他组的契约与实现可以依赖本包，反方向不允许。`@omne-harness/kernel-basis` 在 #371 之前持有这些定义，之后只留 Cordis 辅助和测试装配（`./testing`），不再导出操作结果。

## 关键机制与理由

结果是一个普通对象，成功与失败靠键区分：成功带 `ok`，失败带 `failure`。理由是：键存在即可判断，不需要判别字符串；类型可以直接收窄；调用方的 `F` 不被本包的词汇污染。`isSuccess` 要求结果是非空对象且带 `ok` 键。

零依赖是刻意的。#371 把操作结果从 `kernel-basis` 拆出来，原因是 `kernel-basis` 依赖 Cordis，纯契约包只为一个结果类型就要装 Cordis。拆开后纯契约包只依赖本成员。代价是多一个成员。如果以后结果需要携带校验、跨进程编码或调用方共同的失败词汇，要新的采用决定，不在本成员内悄悄增加。

## 验证与维护

保证与验证的对应：形状与构造函数由 [tests/outcome.spec.ts](../tests/outcome.spec.ts) 检查。运行时导出集合、`dependencies` 为空、只有 `.` 入口、产物不含 Cordis 由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。

改变形状或 `ok`、`failure` 的含义，要先改 SPEC.md，再同步四个具名消费者。新增依赖或入口需要新的采用决定。
