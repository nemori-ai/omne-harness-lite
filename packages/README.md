# 产品包

本目录承载产品的可复用实现包，以 TypeScript 为主。每个实际成员拥有自己的
`package.json`、`src/`、依赖、导出入口与测试；按已明确的职责创建，不按未来
可能存在的插件、服务或部署节点预建空包。

应用装配见 [apps/](../apps/README.md)，开发检查器见 [tools/](../tools/README.md)。
源码布局和跨包引用规则由[workspace 规范](../docs/maintenance/workspace.md)维护。

| 成员 | 当前范围 |
|---|---|
| [agent](agent/README.md) | dsh-agent 定向 fork 的实验来源基线；可构建及验证，尚未完成目标 live-agent v1，暂不供产品应用消费 |
| [dsh-baseline](dsh-baseline/README.md) | 模型/媒体、Session/投影/持久化、prompt/工具及 Loop 的定向源机制，供后续二次开发；通过显式 baseline 子路径消费，与 agent 共用唯一 scope 实现 |
