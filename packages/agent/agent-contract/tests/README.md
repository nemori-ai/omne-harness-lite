# Agent 声明契约测试

## 运行

在本成员目录执行 `pnpm test` 和 `pnpm typecheck`。测试通过包名消费真实入口，不深层导入实现。

## 覆盖

[public-entry.spec.ts](public-entry.spec.ts) 检查合法声明、版本选择、拒绝分类、九处扩展位置与三档干预力、`needs`、`implementation`、`onError`、`unavailability` 及其合法组合、输入副作用、Schema 校验，以及不安装资产、装配和 Cordis 的依赖约束。[import-cache.spec.ts](import-cache.spec.ts) 检查导入不分配缓存、一次批次共用校验域及退出释放。

[judge-output.spec.ts](judge-output.spec.ts) 检查 `judgeExtensionOutput` 的位置输出表逐格（12 行乘三档干预力）、十种拒绝原因、七步判定顺序、`retry` 的两种触发、`ask` 在 `after_terminal` 和改写字段的限制。

[identity.spec.ts](identity.spec.ts) 检查十四个身份解码函数各自的成功与四种失败（类型、空串、过长、字符）及长度边界，`judgeAdoption`、`judgeEvidence`、`judgeAccess`、`judgeAuthority` 的成功、缺失、类型、空串、未知字段与 `identity` 拒绝，访问器不被执行、成功值被冻结，以及 `Access` 的主体判定由调用方注入、租户必须由 legal-identity 铸造。

[public-api-names.spec-d.ts](public-api-names.spec-d.ts) 是类型测试：设计页五章的每个名字都能从包入口导入，并对 `Next`、`Failure`、`Subject`、`ExecutionState`、`FinishResult`、`ExecutionControl`、`AgentEventBody`、`CallerCommit`、`AgentAccessDecision` 等判别字面量逐项断言，对 `AgentJournal` 逐一断言它可赋给五组端口接口，并断言各组端口的成员集合。

[export-set.spec.ts](export-set.spec.ts) 把包入口的运行时导出排序后与写死的清单比较，并断言包内共享的辅助函数不在入口。[dependency-direction.spec.ts](dependency-direction.spec.ts) 沿构建后 `dist/index.js` 与 `dist/index.d.ts` 的导入图断言不含 Cordis、`agent`、`agent-host-local`、`agent-cordis-contract`，并断言 `package.json` 不声明它们；导入图的遍历在 [module-graph.ts](module-graph.ts)，它读文本而不用编译器接口。

[body-contract.spec.ts](body-contract.spec.ts) 检查 `agentBodyContract` 经注册表登记与取回，以及同一组夹具在 `judge` 与 `judgeAgentDefinition` 上接受与拒绝一致、引用与声明项的提取顺序。

## 边界

这些测试只覆盖纯判断、解码、正文契约、导出面与依赖方向，不证明 AgentRuntime、Journal 提供者、外部协调者协作或动态插件已经实现。装配成员拥有通过本包调用声明判断的消费者测试。资产成员不依赖本包，它的测试不导入本包。
