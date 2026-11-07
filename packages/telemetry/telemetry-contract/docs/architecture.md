# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。组级位置见[遥测能力组](../../README.md)，集成规则见仓库的 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。

## 模块与依赖

| 模块                   | 拥有什么                                                                         | 依赖                                                    |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/limits.ts`        | `TELEMETRY_LIMITS`、`ValidationResult`、记号字符集检查、不调用 getter 的成员读取 | 无                                                      |
| `src/definitions.ts`   | 字段与标签规则的类型、`Fields`、三种定义及 `define*`                             | limits                                                  |
| `src/fields.ts`        | `validateFields` 与引用值检查                                                    | limits、definitions 的类型                              |
| `src/carrier.ts`       | `Carrier` 与编解码                                                               | 无                                                      |
| `src/binding.ts`       | `Binding`、`OwnedRef`、`validateBinding`                                         | `@omne-harness/legal-identity`、limits、fields、carrier |
| `src/port.ts`          | `Admission`、`Segment`、`Emitter`、`TelemetryPort`、`CloseReport`、`isSegment`   | 其他模块的类型                                          |
| `src/index.ts`         | 根入口，只做再导出                                                               | 上面全部                                                |
| `src/testing/index.ts` | 捕获替身                                                                         | 根入口、limits                                          |

依赖方向只有一条：`testing/` 依赖根入口，根入口不依赖它。本包在运行时只导入 `@omne-harness/legal-identity`，不导入 Cordis、Node 内置模块或 SDK（IC-4）；安装闭包里没有 Cordis。本包不依赖任何领域成员。Cordis 服务定义在成员 `telemetry-cordis-contract`，它依赖本包，本包不认识它。

`definitions.ts` 的 `Fields<S>` 用条件映射类型把 `optional: true` 的键变成可省略；`copyRule` 只保留值为 `true` 的 `optional`，所以冻结的定义与类型说的是同一件事。

根模块都没有可变状态。可变状态只在捕获替身的一个闭包里：捕获列表、丢弃计数和段序号。每次 `createCapturingTelemetry` 调用创建一份独立的状态。

## 关键机制与理由

- **一份规则，两个使用者。** 提供者与捕获替身都调用 `validateFields` 与 `validateBinding`。规则不在提供者里重写，所以替身上通过的领域测试与真实提供者用同一套准入规则（TC-10）。
- **先读成员，不调用 getter。** `dataMembers` 用属性描述符读取普通对象的自有成员。带 getter 的成员直接判无效，校验不执行调用方的代码。代理对象仍可能在读取时抛错，所以两个校验函数各包一层 `try`，答 `malformed`（TC-1、TC-10）。
- **铸造判定交给拥有者。** scope 是否由 legal-identity 铸造，只由 `actingScopeCodec.encode` 判定。本包不复制铸造登记，所以 legal-identity 改变铸造方式时，本包不需要同步（TC-4）。
- **字符集代替秘密识别。** 引用、名字与枚举值只允许不含空白的可打印 ASCII。遥测不尝试识别秘密，而是让自由文本没有入口（TC-3、TC-13）。代价是枚举值不能含空格。
- **定义是冻结的拷贝。** `define*` 先拷贝再校验拷贝，返回冻结的对象，所以调用方之后修改输入不影响定义（TC-8）。
- **替身先拷贝绑定，再校验拷贝。** 校验的对象就是保留的对象，调用方之后修改原绑定，不影响替身的判定与记录。拷贝保留 scope 的原对象，因为铸造判定认的是对象身份。

## 验证与维护

保证与测试的对应见 SPEC.md 的[组合与验证](../SPEC.md#组合与验证)。改动下列内容时，同步列出的消费者：

- 公开类型或 `ValidationResult` 的原因：`telemetry-node` 与 `apps/harness-server`。
- `TELEMETRY_LIMITS` 的值：SPEC.md 的 TC-12 与 `tests/definitions.spec.ts`。
- carrier 格式：`telemetry-node` 的 OTel 映射与 `tests/carrier.spec.ts`。
