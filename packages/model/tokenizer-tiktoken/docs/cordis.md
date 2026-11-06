# Cordis 集成

根入口可独立使用，不导入 Cordis。`@omne-harness/tokenizer-tiktoken/cordis` 单独拥有服务定义，源码在 `src/cordis/service.ts`。

## 适用性

本包提供 `ModelTokenizersService`、服务键 `modelTokenizersKey` 和类型 `ModelTokenizers`。服务键值是 `modelTokenizers`。服务只借出 executor 的 acquire 与 snapshot，不暴露 close。

宿主 owner 创建真实 executor，将借用方法提供给消费者，并在其生命周期结束时等待 executor.close。卸载一个家族或一条 row 不关闭其他消费者共用的池。每个家族 binding 释放它自己的 lease。

服务定义消费本包公开 executor 类型，不复制计数形状，不建立模块全局单例。应用中的 provider、注册键和完整宿主卸载验证归实际宿主拥有者。本包 worker 测试只证明独立执行器的生命周期。
