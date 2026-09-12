# 产品包

本目录承载产品的可复用实现包，以 TypeScript 为主。每个实际成员拥有自己的
`package.json`、`src/`、依赖、导出入口与测试；按已明确的职责创建，不按未来
可能存在的插件、服务或部署节点预建空包。

应用装配见 [apps/](../apps/README.md)，开发检查器见 [tools/](../tools/README.md)。
源码布局和跨包引用规则由[workspace 规范](../docs/maintenance/workspace.md)维护。

目前尚无产品实现包，具体模块随架构设计与实现任务落地后再登记于此。
