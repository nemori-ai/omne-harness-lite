# src 索引

本文件列出本目录的源码文件。行为见包根 [SPEC.md](../SPEC.md)。

## 内容

| 文件                         | 内容                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| [index.ts](index.ts)         | 根入口：耐久的 ModelCommands、表定义、文档解析、SQL 存储端口、读 handler、发送协调器，并原样转导核心的端口类型 |
| [commands.ts](commands.ts)   | `createSqlModelCommands`：共享核心装在 SQL 存储上，核对跨两者的选项                                |
| [schema.ts](schema.ts)       | 四张表的列声明、DDL 与迁移模块（默认导出）                                                         |
| [documents.ts](documents.ts) | 存储形状、行编码、行解析与分片折叠；`assembly` 在此收窄为 null                                     |
| [commit.ts](commit.ts)       | 构造期核对、一次尝试的读写面、块到分片、run、`pending` 与参加者 `model`（默认导出）                |
| [reads.ts](reads.ts)         | 读 handler `model.call`、`model.pending`、份额汇总 SQL 与主线程的读取                              |
| [coordinator.ts](coordinator.ts) | 发送协调器：存储端口装饰层上的进程内镜像、同步围栏、钉住与认领表 |

## 阅读路径

先读 SPEC 的[耐久的 ModelCommands](../SPEC.md#耐久的-modelcommands)、[存储端口](../SPEC.md#存储端口)与[一次 run](../SPEC.md#一次-run)，再读 `commands.ts`、`schema.ts`、`documents.ts`、`commit.ts`。
