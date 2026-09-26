# model-profile

`@omne-harness-lite/model-profile` 实施已接受的
[`data.model-profile` v1](../../../.meta_harness/design/spec/data/model-profile/v1/contract.md)。
采用与职责分配见[实现映射](../../../.meta_harness/design/realization/packages/core/model-profile/design.md)，
接受与冻结以[registry](../../../.meta_harness/design/registry/README.md) 为准。

从公开入口导入类型，以及 `judgeModelProfileDocument`、`refMatches`、`parameterNames`；
`validate` 只检查 Schema 形状，Schema 资源通过 `@omne-harness-lite/model-profile/schema` 导入。
数值成员使用 content-blocks 的 `JsonNumber`，保留超出安全整数范围的字面量；
`Modality` 类型和 Schema 都消费该包的唯一正式定义。

`refMatches` 的官方引用用二参调用。自建引用用三参调用，第三参是目录显式交出的行所在范围；
联合引用类型也必须显式交出 `scope | undefined`。返回值只说明给定行是否匹配。

本包检查与开发入口：

```sh
pnpm --filter @omne-harness-lite/model-profile run build
pnpm --filter @omne-harness-lite/model-profile run typecheck
pnpm --filter @omne-harness-lite/model-profile run test
node --experimental-strip-types tools/ts-checks/src/cli.ts packages/core/model-profile
```

测试消费构建后的公开入口。`tests/examples.spec.ts` 逐行读取冻结规范实例，
分别核对 Schema 形状和表示判定；`tests/behavior.spec.ts` 核对范围匹配、
跨字段上限、无损数值、无默认值和输入不变；`tests/types.spec-d.ts` 核对公开类型及负例。
测试前需构建 identity-values、offer-expiry 与 content-blocks 的公开产物。

目录写入、撞名、撤回与恢复、授权、传输留痕和快照复制的后续责任沿
[节点验证入口](../../../.meta_harness/design/realization/packages/core/model-profile/verification.md) 交接。
