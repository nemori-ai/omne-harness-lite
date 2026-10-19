# Agent 声明契约测试

## 运行

在本成员目录执行 `pnpm test` 和 `pnpm typecheck`。测试通过包名消费真实入口，不深层导入实现。

## 覆盖

[public-entry.spec.ts](public-entry.spec.ts) 检查合法声明、版本选择、拒绝分类、扩展位置和权力上界、输入副作用、Schema 校验，以及不安装资产、装配和 Cordis 的依赖约束。[import-cache.spec.ts](import-cache.spec.ts) 检查导入不分配缓存、一次批次共用校验域及退出释放。

[body-contract.spec.ts](body-contract.spec.ts) 检查 `agentBodyContract` 经注册表登记与取回，以及同一组夹具在 `judge` 与 `judgeAgentDefinition` 上接受与拒绝一致、引用与声明项的提取顺序。

## 边界

这些测试只覆盖已实现的声明判断，不证明 AgentRuntime、外部协调者协作或动态插件已经实现。资产和装配成员各自拥有通过本包调用声明判断的消费者测试。
