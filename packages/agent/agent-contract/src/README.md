# Agent 声明契约源码

## 公开入口

[index.ts](index.ts) 导出声明类型和 `judgeAgentDefinition`、`judgeLoopExtensions`、`agentBodyContract`。公开形状以源码为准，边界行为见 [SPEC](../SPEC.md#声明判断)。运行接口尚未实现。

## 模块

[types.ts](types.ts) 拥有声明与判断结果；[agent-definition.ts](agent-definition.ts) 判断 AgentDefinition；[loop-extension.ts](loop-extension.ts) 判断有序扩展声明；[body-contract.ts](body-contract.ts) 向资产包的类别注册表提供 `AgentDefinition` 的正文契约，同步读 json-text 读树，规则与 `judgeAgentDefinition` 同源；[check.ts](check.ts) 保留安全输入复制、JSON 限额和 schema 校验的内部机制。外部通过包入口消费，不深层导入这些模块。

## 依赖与资源

输入校验使用 json-text、schema-provider 和 zod。导入不创建 schema 缓存；一次判断持有并释放自己的校验执行域。源码不导入 Cordis、资产实现或装配实现。
