# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，导出工厂、配置解析与公开类型
- [mechanism.ts](mechanism.ts)：工厂 `createRuntimeContext`，组装各模块并给出八个操作与 `close`
- [config.ts](config.ts)：七个上限的初值与唯一判定
- [world.ts](world.ts)：共享状态、端口核对、等待与取消、投影版本、声明目录、变化出口与关闭五步
- [producer.ts](producer.ts)：生产者面：槽、代际、发布、失效、供值回调与撤销登记
- [holder.ts](holder.ts)：持有者面：注册核对、提交应用、步提交、作用域结束、签发与撤销
- [replay.ts](replay.ts)：恢复会话：开始、暂存、原子安装与待刷新标记
- [reader.ts](reader.ts)：读者面：六步核对、快照、变化、需要读取、恢复后供值与读取缓存
- [read-cache.ts](read-cache.ts)：有上限的最近使用缓存
- [validation.ts](validation.ts)：同步执行块声明的 Schema
- [diagnostics.ts](diagnostics.ts)：诊断事件的封闭集合

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到工厂与依据，再读[内部架构](../docs/architecture.md#模块与依赖)的模块切分，最后从 `mechanism.ts` 读源码。
