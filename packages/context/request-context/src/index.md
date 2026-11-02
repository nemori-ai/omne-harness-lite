# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，导出两个有状态工厂、三个无状态构造件与它们的配置初值
- [registry.ts](registry.ts)：来源登记表
- [accounting.ts](accounting.ts)：账目投影与恢复
- [compaction-strategy.ts](compaction-strategy.ts)：默认压缩策略、保留名单与摘要指令
- [trimmer.ts](trimmer.ts)：默认修剪器
- [representation-strategy.ts](representation-strategy.ts)：默认表示策略
- [conversion-results.ts](conversion-results.ts)：缺席的转换件结果读口
- [digest.ts](digest.ts)、[policy-input.ts](policy-input.ts)：参数摘要与构造时的参数校验

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到工厂与依据，再读[内部架构](../docs/architecture.md#模块与依赖)的模块切分，最后读源码。
