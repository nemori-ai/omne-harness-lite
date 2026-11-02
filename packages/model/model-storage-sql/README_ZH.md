# @omne-harness/model-storage-sql

[English](README.md)

Model 的 SQL 存储成员。它实现共享命令核心的存储端口 `ModelCommandStorage`，并用核心与这份存储装成耐久的 `ModelCommands`。它把一次 Model 调用的耐久事实保存为一份调用文档，按版本比较写入（CAS）。它只经 `@omne-harness/sql-contract` 的公开形状使用 SQL。

## 职责与状态

本包拥有五样东西：`md_call`、`md_dispatch`、`md_part`、`md_operation` 四张表及其迁移；从行到调用文档的解析；SQL 版 `ModelCommandStorage`，它的每次 run 读取、运行核心的工作、按 CAS 提交；参加者 `model` 与两个读 handler `model.call`、`model.pending`；把共享核心装在这份存储上的 `createSqlModelCommands`。

本包不拥有 Model 命令的规则，它们归 `@omne-harness/model` 的共享核心。本包也不拥有提交协议、回执与租户事务域目录，它们归存储契约与应用。

状态：`draft`。覆盖范围见 SPEC 的[实现现状](SPEC.md#实现现状)。

- 已实现：`createSqlModelCommands`（给出 `send` 时同时给出共用核心的发送协调器）、`createSendMirror`、`createSqlModelStorage`、表与迁移、行解析、参加者、两个 handler 模块、构造期核对。
- 未实现：`modelStorageMaterials()`。
- 已知差异：进程重启后，对重启前结论未定的写，`query` 可能回答 `not-committed`。与内存实现的全部差异见 SPEC 的[已知差异](SPEC.md#已知差异)。
- 没有 `./cordis` 子路径。应用插件 `modelCommands` 归应用。

## 使用

根入口是唯一入口。建好耐久的命令：

```ts
import { createSqlModelCommands } from '@omne-harness/model-storage-sql'

const { commands } = createSqlModelCommands({
  owners,
  authority,
  evidence,
  clock,
  limits,
  storage,
  domains,
  combination,
  maxCallBytes,
  maxCommandBytes,
})
```

`commands` 有 `ModelCommands` 的 22 个方法。共享核心用存储的 `run(work, scope)` 运行每个方法。scope 给出租户、调用，写方法还给出 operation。`work` 里核心用 `documents`、`reserved` 读取，用 `commit` 或 `publish` 写入一次。CAS 冲突后，run 重新读取并再次运行工作。`scanPending` 用存储的 `pending` 端口，不运行尝试。

## 契约

公开类型与运行时校验在 [src/](src/index.md)。行为在 [SPEC](SPEC.md)。SPEC 还记录本包怎样兑现共享核心的存储端口，以及不变量 N1、N2、N3、N5、N6、N7。存储端口的类型归 `@omne-harness/model/commands`，根入口原样转导。

## 设计

主线程计算，参加者核版本并写入。一次提交只含给参加者 `model` 的一条事实命令。参加者不运行命令的规则，也不调用回调。读到的旧值只会造成 CAS 冲突，循环随后在下一代重新读取。步骤见 [SPEC](SPEC.md#一次-run)。

每一列只在 `src/schema.ts` 的 `TABLES` 里声明一次。迁移、解析与参加者都使用这份声明。

## 配置与运行

| 选项              | 含义                                                       |
| ----------------- | ---------------------------------------------------------- |
| `owners`          | 共享核心的消费者 owner 声明                                |
| `authority`       | 共享核心的资格端口                                         |
| `evidence`        | 共享核心的证据适配器                                       |
| `clock`           | 共享核心的时钟                                             |
| `limits`          | 共享核心的限额。`limits.capacity` 是每租户份额             |
| `storage`         | 应用的 `SqlStorage`                                        |
| `domains`         | 应用的 `TenantDomainLookup`                                |
| `combination`     | 应用登记的组合版本与清单摘要                               |
| `maxCallBytes`    | 单个调用材料的上界                                         |
| `maxCommandBytes` | 提供者的 `maxCommandBytes`                                 |
| `attemptLimit`    | 一个 operation 的尝试代数，默认 8                          |
| `unresolvedLimit` | 本进程为一个租户保存的结论未定的 operation 个数，默认 1024 |

`maxCallBytes` 加 64 KiB 命令预留超过 `maxCommandBytes` 时，或 `limits.scanPageCalls` 超过 1000 时，构造失败。`capacity.bytes` 超过 `maxCallBytes` 的调用在受理时被拒绝。

## 验证

[tests/](tests/index.md) 的用例在 `node:sqlite` 内存库上运行真实的参加者、迁移与读 handler，多数经共享核心运行 22 个方法，并对内存实现与本实现对拍账目套件。它们不覆盖真实提供者的 Worker、耐久性、队列与关闭。

## 维护

新增列时，先改 `src/schema.ts` 的 `TABLES`，再改 `src/documents.ts` 的解析与编码。已发布的表结构用新的迁移改变。存储端口归共享核心。核心改变它时，本包随之调整。

## 目录结构与文档职责

| 路径                 | 职责                                      |
| -------------------- | ----------------------------------------- |
| `SPEC.md`            | 行为、不变量、失败与已知限制              |
| `src/`               | 源码，见 [src/index.md](src/index.md)     |
| `tests/`             | 用例，见 [tests/index.md](tests/index.md) |
| `documentation.json` | 本包的文档登记                            |
