# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

- `src/session-protocol.ts`：全部规则字面量、`sessionProtocol` 与推出的类型 `SessionProtocol`、`ObserveSessionOpen`、`ObserveSessionFrame`。
- `src/index.ts`：根入口，只转出上面四个名字。

唯一的依赖是 `@omne-harness/public-contract`（[成员组织](../../../../docs/package-organization.md)「`<领域>-protocol`」）。没有状态，没有资源。会话的领域核心不依赖本包（RFC-0015 I-17）。

## 关键机制与理由

- **类型从规则推出。** 规则写成 `as const` 字面量交给 `ruleCodec`，值类型由共同契约的 `RuleValue` 推出。这样规则与类型只有一个来源，改了规则类型跟着变。代价是推出的类型是平铺的对象，和旧的手写类型（交叉类型、`EmptyBody`）写法不同；用例按语义比较。
- **规则复制，不导入。** 旧家族的规则是共同契约里模块私有的常量。复制让归属落到会话，又不改共同契约；两份并存期间由 `tests/wire.spec.ts` 逐个操作核对读出的值相同。
- **只写自己的结果。** 管道给的 `protocol-rejected`、`basis-unavailable`、`denied`、提交类的 `unknown` 由 `defineProtocol` 并进来，契约里不重复写；只读却可能答不出结局的两个查询手写 `unknown`。

## 验证与维护

条款与用例的对应见 [SPEC.md](../SPEC.md#组合与验证)。改规则时同步 `tests/wire.spec.ts` 的样本与 `tests/shapes.spec-d.ts` 的断言；公开名字变化时同步 `api/` 快照（`pnpm run contract:api --write`）与 [public-api.md](public-api.md)。
