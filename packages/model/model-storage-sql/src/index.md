# src 索引

本文件列出本目录的源码文件。行为见包根 [SPEC.md](../SPEC.md)。

## 内容

| 文件                         | 内容                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| [index.ts](index.ts)         | 根入口：表定义、文档类型与解析、提交循环、读 handler       |
| [schema.ts](schema.ts)       | 四张表的列声明、DDL 与迁移模块（默认导出）                 |
| [documents.ts](documents.ts) | 调用文档类型、`ModelStorageTransaction`、行编码与行解析    |
| [commit.ts](commit.ts)       | 构造期核对、暂存事务、提交循环与参加者 `model`（默认导出） |
| [reads.ts](reads.ts)         | 读 handler `model.call`、`model.pending` 与主线程的读取    |

## 阅读路径

先读 SPEC 的[冻结接口](../SPEC.md#冻结接口)与[提交循环](../SPEC.md#提交循环)，再读 `schema.ts`、`documents.ts`、`commit.ts`。
