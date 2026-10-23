# model-contract 源码索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 根入口

[index.ts](index.ts) 是根入口，以 `export type *` 或具名导出公开类型，并导出运行值。凭据章用 `export *`，同时带出 `MODEL_SEND`。完整导出清单见[公开页](../docs/public-api.md)。下表列出公开声明文件及其对应章节：

| 文件 | 章 |
| --- | --- |
| [root.ts](root.ts)、[identity-values.ts](identity-values.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；身份与解码 |
| [reference.ts](reference.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；可保存引用的编码、解码与解析 |
| [judge-request.ts](judge-request.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；`judgeFixedModelRequest`、`judgeAdmit`、输入拒绝与限额 |
| [result.ts](result.ts) | 结果、失败和状态 |
| [result-delivery-values.ts](result-delivery-values.ts) | 结果交付键与冻结载荷声明 |
| [model-stream-values.ts](model-stream-values.ts) | [Model 显示投影纯值](../docs/public-api.md#model-显示投影纯值)；diff/apply |
| [call-surface.ts](call-surface.ts) | 普通调用面与实例观察 |
| [provider.ts](provider.ts) | 独立执行与提供者操作 |
| [consumer-owner.ts](consumer-owner.ts)、[guard-control.ts](guard-control.ts) | 消费者 owner 的装配声明；守卫派生的控制 operation |
| [profile.ts](profile.ts)、[profile-source.ts](profile-source.ts) | 档案与请求准备；档案来源与准备资源 |
| [conversion.ts](conversion.ts) | 消息转换 |
| [tokenizer.ts](tokenizer.ts) | 文本分词与完整计量依据 |
| [driver.ts](driver.ts) | 受信宿主驱动 |
| [replay-values.ts](replay-values.ts) | 推理回放的声明与投影 |
| [credential.ts](credential.ts)、[credential-values.ts](credential-values.ts) | 凭据引用与解析端口 |
| [diagnostics.ts](diagnostics.ts) | 供应商尝试诊断 |

## 根入口的内部实现

下列文件协作实现根入口的公开能力。公开导出以 [index.ts](index.ts) 为准。

| 文件 | 内容 |
| --- | --- |
| [mint.ts](mint.ts) | 内部品牌铸造点 |
| [input-tree.ts](input-tree.ts) | 输入树快照、资源限制与拒绝；`MODEL_INPUT_LIMITS` 经 `judge-request.ts` 从根入口导出 |
| [request-shape.ts](request-shape.ts) | 固定请求的内部封闭字段判断 |

## `./testing` 入口

[testing/](testing/index.ts) 是 `./testing` 入口，对应公开页的「受控替代提供者」一章。公开名字以入口文件的具名导出为准。下表同时列出内部协作文件：

| 文件 | 内容 |
| --- | --- |
| [testing/provider.ts](testing/provider.ts) | `createScriptedModelProvider`：装配 `calls`、`consumption`、`instances`、`recover`、`quiesce` 和控制器 |
| [testing/controller.ts](testing/controller.ts) | 脚本控制器：推进调用、撤除或替换实例、撤销资格、脚本化提交未知、查询提交 |
| [testing/calls.ts](testing/calls.ts)、[testing/consumption.ts](testing/consumption.ts) | `admit`、`inspect`、`dispatches`、`cancel` 与读取、确认 |
| [testing/reference.ts](testing/reference.ts)、[testing/reference-input.ts](testing/reference-input.ts) | 内部引用失败映射；脚本夹具的引用构造与保留值负例 |
| [testing/directory.ts](testing/directory.ts)、[testing/observation.ts](testing/observation.ts) | 实例目录与句柄；观察流 |
| [testing/core.ts](testing/core.ts)、[testing/writes.ts](testing/writes.ts)、[testing/mint.ts](testing/mint.ts) | 共享状态与资格规则；写操作与提交未知；由数字铸造修订、游标与读取 id |
| [testing/result-pages.ts](testing/result-pages.ts) | 最终项校验、规范 JSON 字节、完整项目标组页 |
| [testing/transport.ts](testing/transport.ts) | `createScriptedTransport`：脚本化的传输 |
| [testing/error.ts](testing/error.ts) | `ScriptedModelError`：脚本误用 |
| [testing/conformance.ts](testing/conformance.ts)、[testing/conformance-types.ts](testing/conformance-types.ts)、[testing/conformance-bounded.ts](testing/conformance-bounded.ts) | `checkModelProviderConformance`：入口；被测方、钩子、报告与检查的类型；把对被测方的每一次等待限时的视图 |
| [testing/conformance-kit.ts](testing/conformance-kit.ts)、[testing/conformance-defaults.ts](testing/conformance-defaults.ts)、[testing/conformance-scripted.ts](testing/conformance-scripted.ts) | 各检查共用的裁决原语与场景；套件缺省值；接好全部钩子的替代被测方 `createScriptedConformanceSubject` |
| [testing/conformance-admission.ts](testing/conformance-admission.ts)、[testing/conformance-settlement.ts](testing/conformance-settlement.ts)、[testing/conformance-control.ts](testing/conformance-control.ts)、[testing/conformance-observation.ts](testing/conformance-observation.ts)、[testing/conformance-routes.ts](testing/conformance-routes.ts)、[testing/conformance-transport.ts](testing/conformance-transport.ts) | 各组义务的检查：受理与提交未知；收场、确认与读取；取消；观察与块的归约；租户、资格、路由与 `quiesce`；传输 |
| [testing/reduce.ts](testing/reduce.ts) | 替代件的块表：把上游事实归约为可见块，拒绝契约禁止的转换 |
