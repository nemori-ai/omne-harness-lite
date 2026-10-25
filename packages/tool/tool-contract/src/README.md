# Tool 源码

本目录拥有本成员的公开类型、运行时校验和内部实现。

- [index.ts](index.ts) 是根入口 `.`。它导出资产正文端口 `toolBodyContract`（实现在 [contract.ts](contract.ts)）、全部公开类型、品牌身份解码函数、默认结果政策和契约函数。
- 公开类型按主题分模块：[identity.ts](identity.ts)、[reference.ts](reference.ts)、[definitions.ts](definitions.ts)、[results.ts](results.ts)、[operations.ts](operations.ts)、[author-context.ts](author-context.ts)、[execution.ts](execution.ts)、[ports.ts](ports.ts)、[authoring.ts](authoring.ts)、[records.ts](records.ts)、[custody.ts](custody.ts)、[program.ts](program.ts)。每个模块的职责见 [public-api](../docs/public-api.md)。
- [result-policy.ts](result-policy.ts) 给出默认结果政策的规则集、采用和判定。[adoption.ts](adoption.ts) 按规则集计算可复算的采用摘要，根入口导出 `describedAdoption`，各实现与 Cordis 定义包用它给出同一摘要。
- 契约函数按领域知识分模块：[judge-definition.ts](judge-definition.ts) 判定定义与实现事实，[dynamics.ts](dynamics.ts) 给出 RFC-0012 的纯函数（定义派生、同形判据、采用点判定、Run 中刷新、常驻集合折叠、登记键比较），[judge-request.ts](judge-request.ts) 判定固定请求和普通 invoke payload，[judge-state.ts](judge-state.ts) 判定状态，[catalog.ts](catalog.ts) 给出呈现与可用性，[registration.ts](registration.ts) 构造操作与作者注册，[wait-contract.ts](wait-contract.ts) 固定等待协议，[parameter-codec.ts](parameter-codec.ts) 给出默认参数 codec 与受理时的参数判定，[result-rendering.ts](result-rendering.ts) 渲染作者返回，[result-projection.ts](result-projection.ts) 投影消费方使用的消息块。
- 内部模块不从根入口导出。[shape.ts](shape.ts) 是封闭形状检查的组合件，只读自身数据属性并返回冻结副本。[json-tree.ts](json-tree.ts) 把 json-text 的 `judgeJsonValue` 包成形状检查，并把它的结构路径换成本包的字段名；它还计算 JSON 文本的字节数。树的判定规则归 json-text，本成员不另存一份。[value-shapes.ts](value-shapes.ts) 给出采用、证据、消费位置、schema 身份和内容引用的共用形状。内容引用的规则取自 `@omne-harness/content-block`，本成员不另存一份。
- 操作句柄和作者注册把作者能力放在模块私有 symbol 下。[binding.ts](binding.ts) 是子路径入口 `./binding`，导出 `readToolOperation` 和 `readToolRegistration`，只供受信的绑定提供者（G7）读取。根入口不导出它们。句柄与注册是执行域的能力，不交给脚本。
- [judge-release.ts](judge-release.ts) 给出 releaseDelivery 的消费位置与交接证据的封闭检查 `judgeConsumerRef`、`judgeHandoff`，根入口导出。
- [testing.ts](testing.ts) 是子路径入口 `./testing`（G6）：七个端口的一致性套件（[启动围栏](testing-start-authority.ts)、[环境](testing-environment.ts)、[执行者绑定](testing-executor-binding.ts)、[输出保管](testing-output-custody.ts)、[时钟](testing-clock.ts)、[决策桥](testing-decision-bridge.ts)、[资源应答](testing-resource-responses.ts)）和各自守约的非耐久替身。决策桥与资源应答共有的用例和操作账本在 [testing-external.ts](testing-external.ts)，它不从入口导出。[testing-case.ts](testing-case.ts) 定义共用的用例类型、`NotApplicable` 与 `runConformanceCase`，[testing-values.ts](testing-values.ts) 构造合法值。夹具类型 `TwoTenantFixture`、`otherAccessOf` 与 `shapeOf`（跨租户用例比较“真实记录”与“不存在的记录”的答复）在 testing-case.ts，第二个租户的合法值 `memoryOtherAccess` 在 testing-values.ts。这些文件平铺在 `src/`，不从根入口导出。运行时依赖是 `node:assert`、`node:crypto`，以及 testing-values.ts 从 legal-identity 导入的 `accountCodec`、`organizationCodec` 与 `tenant`。
- 本包没有 Cordis 入口，也不依赖 `@deepseek-ai/cordis` 或其他 Tool 包。服务定义在 `@omne-harness/tool-cordis-contract`。

独立执行函数、账本工厂与 runtime 工厂在 `@omne-harness/tool` 实现，依据 [SPEC](../SPEC.md) 的已接受范围，不能按源码便利改变承诺；导航见 [public-api](../docs/public-api.md)。文档导航见 [index](index.md)。
