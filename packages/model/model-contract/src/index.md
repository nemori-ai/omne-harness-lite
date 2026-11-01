# model-contract 源码索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 根入口与 `./provider` 入口

[index.ts](index.ts) 是根入口，[provider/index.ts](provider/index.ts) 是 `./provider` 入口。两个入口从同一批源文件按名再导出，一个名字只从一个入口导出，规则见[提供者协议入口](../docs/public-api.md#提供者协议入口)。根入口以 `export type *` 或具名导出公开类型，并导出运行值。凭据章在根入口只导出 `CredentialId` 类型，`MODEL_SEND` 与凭据解码函数在 `./provider`。精确归属以两个入口文件为准，完整导出清单见[公开页](../docs/public-api.md)。下表列出公开声明文件、对应的章和导出它的入口：

| 文件 | 章 | 入口 |
| --- | --- | --- |
| [root.ts](root.ts)、[identity-values.ts](identity-values.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；身份与解码 | 根入口；`ActorRef`、`decodeReadId` 与 `compareRevisions` 在 `./provider` |
| [reference.ts](reference.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；可保存引用的编码、解码与解析 | 调用引用在根入口，操作引用在 `./provider` |
| [judge-request.ts](judge-request.ts) | [根入口的值与请求](../docs/public-api.md#根入口的值与请求)；`judgeFixedModelRequest`、`judgeAdmit`、输入拒绝与限额 | `./provider` |
| [result.ts](result.ts) | 结果、失败和状态 | 根入口 |
| [result-delivery-values.ts](result-delivery-values.ts) | 结果交付键与冻结载荷声明 | 根入口 |
| [result-delivery.ts](result-delivery.ts)、[result-delivery-judge.ts](result-delivery-judge.ts) | [结果、失败和状态](../docs/public-api.md#结果失败和状态)；接收端口、回执与交付载荷核对 | 根入口 |
| [model-stream-values.ts](model-stream-values.ts) | [Model 显示投影纯值](../docs/public-api.md#model-显示投影纯值)；diff/apply | 根入口 |
| [model-stream.ts](model-stream.ts) | [Model 当前目标与公共观察](../docs/public-api.md#model-当前目标与公共观察)；Model 观察与 current 端口 | 根入口 |
| [call-surface.ts](call-surface.ts) | 普通调用面与实例观察 | 根入口 |
| [provider-protocol.ts](provider-protocol.ts) | 独立执行与提供者操作 | 两个入口各有一部分 |
| [consumer-owner.ts](consumer-owner.ts)、[guard-control.ts](guard-control.ts) | 消费者 owner 的装配声明；守卫派生的控制 operation | 装配声明在 `./provider`，守卫派生在根入口 |
| [profile.ts](profile.ts)、[profile-source.ts](profile-source.ts) | 档案与请求准备；档案来源与准备资源 | 两个入口各有一部分 |
| [conversion.ts](conversion.ts) | 消息转换 | 两个入口各有一部分 |
| [tokenizer.ts](tokenizer.ts) | 文本分词与完整计量依据 | 两个入口各有一部分 |
| [driver.ts](driver.ts) | 受信宿主驱动 | `./provider` |
| [replay-values.ts](replay-values.ts) | 推理回放的声明与投影 | `./provider` |
| [credential.ts](credential.ts)、[credential-values.ts](credential-values.ts) | 凭据引用与解析端口 | `CredentialId` 在根入口，其余在 `./provider` |
| [diagnostics.ts](diagnostics.ts) | 供应商尝试诊断 | 根入口 |

## 两个入口的内部实现

下列文件协作实现两个入口的公开能力。公开导出以 [index.ts](index.ts) 与 [provider/index.ts](provider/index.ts) 为准。

| 文件 | 内容 |
| --- | --- |
| [mint.ts](mint.ts) | 内部品牌铸造点 |
| [input-tree.ts](input-tree.ts) | 输入树快照、资源限制与拒绝；`MODEL_INPUT_LIMITS` 经 `judge-request.ts` 从 `./provider` 导出 |
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
| [testing/conformance-scripted.ts](testing/conformance-scripted.ts) | 接好全部钩子的替代被测方 `createScriptedConformanceSubject` 与 `ScriptedPrincipal` |
| [testing/reduce.ts](testing/reduce.ts) | 替代件的块表：把上游事实归约为可见块，拒绝契约禁止的转换 |
| [testing/pusher.ts](testing/pusher.ts) | `createScriptedResultPusher`：推送生产者替身 |
| [testing/stream-references.ts](testing/stream-references.ts) | `createScriptedStreamReferences`：`current` 替身 |
| [testing/stream-observation.ts](testing/stream-observation.ts) | `createScriptedStreamObservation`：观察替身 |
| [testing/profiles.ts](testing/profiles.ts) | `createScriptedModelProfiles`：档案替身 |
| [testing/preparation.ts](testing/preparation.ts) | `createScriptedModelRequestPreparation`：请求准备替身 |
| [testing/profile-values.ts](testing/profile-values.ts) | 档案与准备替身共用的档案复制与范围核对，保留合法范围身份的原引用，不从入口导出 |
| [testing/access.ts](testing/access.ts) | `current`、观察、档案与准备替身共用的测试控制面 `ScriptedAccessDecision` |
| [testing/stream-codec.ts](testing/stream-codec.ts)、[testing/values.ts](testing/values.ts) | 替身判断 `StreamRef` 用的 Model 引用 codec；替身共用的值辅助函数，不从入口导出 |

## `./conformance` 入口

[conformance/](conformance/index.ts) 是 `./conformance` 入口，对应公开页的「符合性断言」一章，只导出义务套件，不导出替身。公开名字以入口文件的具名导出为准。

| 文件 | 内容 |
| --- | --- |
| [conformance/conformance.ts](conformance/conformance.ts)、[conformance/conformance-types.ts](conformance/conformance-types.ts)、[conformance/conformance-bounded.ts](conformance/conformance-bounded.ts) | `checkModelProviderConformance`：入口；被测方、钩子、报告与检查的类型；把对被测方的每一次等待限时的视图 |
| [conformance/conformance-kit.ts](conformance/conformance-kit.ts)、[conformance/conformance-defaults.ts](conformance/conformance-defaults.ts) | 各检查共用的裁决原语与场景；套件缺省值 |
| [conformance/conformance-admission.ts](conformance/conformance-admission.ts)、[conformance/conformance-settlement.ts](conformance/conformance-settlement.ts)、[conformance/conformance-control.ts](conformance/conformance-control.ts)、[conformance/conformance-observation.ts](conformance/conformance-observation.ts)、[conformance/conformance-routes.ts](conformance/conformance-routes.ts)、[conformance/conformance-transport.ts](conformance/conformance-transport.ts) | 各组义务的检查：受理与提交未知；收场、确认与读取；取消；观察与块的归约；租户、资格、路由与 `quiesce`；传输 |
