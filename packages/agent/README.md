# Agent 原语源码起点

`@omne-harness-lite/agent` 是本项目维护的 dsh-agent 定向 fork。目前交付 Registry、
工厂委托、事件分发和 initiator 的来源基线，接入官方 `@deepseek-ai/cordis@4.0.2`。
具体工厂、Session、Agent Loop 与模型调用尚未实现。

仅提供实验入口 `@omne-harness-lite/agent/baseline`；包为 private，没有根入口。
应用及其他产品成员暂不得消费。这里仍保留单字符串登记、原始对象查询、同步 created
否决、单 factory 槽及源 detach/initiator 行为，**没有实现 OMNE v1 的租户门禁、
实例身份和完整退出协议**。private 和作用域过滤都不是安全隔离。

目标契约见 [live-agent v1](../../spec/capabilities/live-agent/v1/contract.md)，
后续直接修订本包完成目标；本阶段不承诺上游 API 兼容，也不另立产品数据契约。
本地 `Agent` 类型只表达来源算法所读的身份、Session 身份视图与 Context。

## 开发

在仓库根按[开发指南](../../docs/development.md)安装依赖后：

```sh
pnpm --filter @omne-harness-lite/agent build
pnpm --filter @omne-harness-lite/agent test
pnpm --filter @omne-harness-lite/agent check
```

构建由 tsc 输出 ESM 和声明；严格类型检查与 Vitest 均消费构建产物。
Cordis 的声明级 const enum 由 tsc 内联，故构建不启用 verbatimModuleSyntax 或
isolatedModules，不通过源 alias 或手写枚举数字替代官方发行包。
`check` 还核对原件/锁文件、打包文件及许可，并在仓库外创建临时消费者，离线安装
已缓存依赖和本包 tarball，编译声明消费代码，验证插件、工厂委托、登记、归因与 owner 撤除。
失败现场保留并输出路径；成功后移除临时消费者。需要系统 npm（pack）及 pnpm。

这些是受信测试 fixture 下的原语组合验证，不是完整 Agent 产品闭环。
来源、许可、测试移植与差异见 [UPSTREAM](UPSTREAM.md) 和 [provenance](provenance.json)；
施工与验收见[计划](../../docs/proposals/agent-runtime/fork/plan.md)。
