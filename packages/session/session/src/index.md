# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，导出工厂、调度策略初值与公开类型
- [instance.ts](instance.ts)：工厂 `createSessionInstance` 与实例，接线下列模块
- [dependencies.ts](dependencies.ts)：`SessionDependencies` 与启动条件核对
- [policy.ts](policy.ts)：`SchedulingPolicy`、初值与配置核对（SR-3）
- [command.ts](command.ts)：命令处理器流水线（CP-01）
- [qualify.ts](qualify.ts)：一次面操作的一次访问裁定与委派视图，权威快照读取
- [reads.ts](reads.ts)：读路径（CP-03）
- [faces.ts](faces.ts)：按调用方类给出四个面
- [callers.ts](callers.ts)：各操作允许的调用方类
- [failures.ts](failures.ts)：本成员自己产生的失败与端口服务键
- [advance.ts](advance.ts)：S1 与 C2 的开 Run 顺序
- [slot-reference.ts](slot-reference.ts)：会话槽引用（XC-AGINST 第 2.1 节）
- [resolution.ts](resolution.ts)：S4 待决认回
- [scan.ts](scan.ts)：S3 恢复扫描与维护句柄
- [scheduling.ts](scheduling.ts)：协调器与调度器共用的主体、时钟等待与每会话串行
- [lifecycle.ts](lifecycle.ts)：关闭状态、在途工作与后台工作

## 阅读路径

先读[公开入口页](../docs/public-api.md)找到工厂与依据，再读[内部架构](../docs/architecture/README.md#模块与状态责任)的模块切分，最后读源码。
