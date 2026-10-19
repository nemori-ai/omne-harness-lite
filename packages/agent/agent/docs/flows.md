# Agent 实现流程

当前运行实现为空。公开操作顺序及失败分支见 [契约流程](../../agent-contract/docs/flows/README.md)，内部处理机制见 [架构](architecture/README.md)。

## 构造与调用

外部提供注入能力与静态配置，候选工厂构造公开服务。操作输入携带业务身份，核心通过纯端口调用依赖；宿主负责将框架服务适配为这些端口。

## 退出

退出先保留原工作和未完成责任，再交还本实现持有的资源。具体 Cordis 插件的注入撤除与换代见 [agent-host-local](../../agent-host-local/docs/cordis.md)。
