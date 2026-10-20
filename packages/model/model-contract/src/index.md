# model-contract 源码索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 根入口

[index.ts](index.ts) 是根入口，以 `export type *` 转出各章文件的全部类型（凭据章用 `export *`，同时带出 `MODEL_SEND`），并按名导出 18 个运行值。下表列出各文件对应的[公开页](../docs/public-api.md)章，公开页各章链接回这些文件：

| 文件 | 章 |
| --- | --- |
| [root.ts](root.ts)、[identity-values.ts](identity-values.ts)、[mint.ts](mint.ts) | 根入口的值与请求；身份解码与品牌铸造点 |
| [result.ts](result.ts) | 结果、失败和状态 |
| [call-surface.ts](call-surface.ts) | 普通调用面与实例观察 |
| [provider.ts](provider.ts) | 独立执行与提供者操作 |
| [consumer-owner.ts](consumer-owner.ts)、[guard-control.ts](guard-control.ts) | 消费者 owner 的装配声明；守卫派生的控制 operation |
| [profile.ts](profile.ts)、[profile-source.ts](profile-source.ts) | 档案与请求准备；档案来源与准备资源 |
| [conversion.ts](conversion.ts) | 消息转换 |
| [tokenizer.ts](tokenizer.ts) | 文本分词与完整计量依据 |
| [driver.ts](driver.ts) | 受信宿主驱动 |
| [credential.ts](credential.ts)、[credential-values.ts](credential-values.ts) | 凭据引用与解析端口 |
| [diagnostics.ts](diagnostics.ts) | 供应商尝试诊断 |

## `./testing` 入口

[testing/](testing/index.ts) 是 `./testing` 入口，对应公开页的「受控替代提供者」一章。入口文件按名导出，其余是叶子文件：

| 文件 | 内容 |
| --- | --- |
| [testing/provider.ts](testing/provider.ts) | `createScriptedModelProvider`：装配 `calls`、`consumption`、`instances`、`recover`、`quiesce` 和控制器 |
| [testing/controller.ts](testing/controller.ts) | 脚本控制器：推进调用、撤除或替换实例、撤销资格、脚本化提交未知、查询提交 |
| [testing/calls.ts](testing/calls.ts)、[testing/consumption.ts](testing/consumption.ts) | `admit`、`inspect`、`dispatches`、`cancel` 与读取、确认 |
| [testing/directory.ts](testing/directory.ts)、[testing/observation.ts](testing/observation.ts) | 实例目录与句柄；观察流 |
| [testing/core.ts](testing/core.ts)、[testing/writes.ts](testing/writes.ts)、[testing/mint.ts](testing/mint.ts) | 共享状态与资格规则；写操作与提交未知；由数字铸造修订、游标与读取 id |
| [testing/result-pages.ts](testing/result-pages.ts) | 最终项校验、规范 JSON 字节、完整项目标组页 |
| [testing/transport.ts](testing/transport.ts) | `createScriptedTransport`：脚本化的传输 |
| [testing/error.ts](testing/error.ts) | `ScriptedModelError`：脚本误用 |
| [testing/conformance.ts](testing/conformance.ts)、[testing/conformance-types.ts](testing/conformance-types.ts)、[testing/conformance-bounded.ts](testing/conformance-bounded.ts) | `checkModelProviderConformance`：入口；被测方、钩子、报告与检查的类型；把对被测方的每一次等待限时的视图 |
| [testing/conformance-kit.ts](testing/conformance-kit.ts)、[testing/conformance-defaults.ts](testing/conformance-defaults.ts)、[testing/conformance-scripted.ts](testing/conformance-scripted.ts) | 各检查共用的裁决原语与场景；套件缺省值；接好全部钩子的替代被测方 `createScriptedConformanceSubject` |
| [testing/conformance-admission.ts](testing/conformance-admission.ts)、[testing/conformance-settlement.ts](testing/conformance-settlement.ts)、[testing/conformance-control.ts](testing/conformance-control.ts)、[testing/conformance-observation.ts](testing/conformance-observation.ts)、[testing/conformance-routes.ts](testing/conformance-routes.ts)、[testing/conformance-transport.ts](testing/conformance-transport.ts) | 各组义务的检查：受理与提交未知；收场、确认与读取；取消；观察与块的归约；租户、资格、路由与 `quiesce`；传输 |
| [testing/reduce.ts](testing/reduce.ts) | 替代件的块表：把上游事实归约为可见块，拒绝契约禁止的转换 |
