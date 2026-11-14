# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

- `src/assets-protocol.ts`：全部规则字面量、`assetsProtocol` 与推出的类型 `AssetsProtocol`、`SettingView`、`SettingInput`。
- `src/index.ts`：根入口，只转出上面四个名字。

唯一的依赖是 `@omne-harness/public-contract`（[成员组织](../../../../docs/package-organization.md)「`<领域>-protocol`」）。没有状态，没有资源。设置的领域成员不依赖本包。

## 关键机制与理由

- **类型从规则推出。** 规则写成 `as const` 字面量交给 `ruleCodec`，值类型由共同契约的 `RuleValue` 推出，规则与类型只有一个来源。
- **形状对着读写面。** 消息体与视图逐字段取自租户层读写面（RFC-0015 §9「设置读写面的契约」）。JSON 值在线上是共同契约的值树（`json` 叶子），换成普通值是接入插件的事。
- **只写自己的结果。** 管道给的 `protocol-rejected`、`basis-unavailable`、`denied`、提交类的 `unknown` 由 `defineProtocol` 并进来，契约里不重复写。
- **一项三种，按 `kind` 分。** 三种视图与三种要写的值各用字面量 `kind` 区分，所以 `one-of` 的各项互斥。

## 验证与维护

条款与用例的对应见 [SPEC.md](../SPEC.md#组合与验证)。改规则时同步 `tests/operations.spec.ts` 的样本与接入插件的映射；公开名字变化时同步 [public-api.md](public-api.md)。
