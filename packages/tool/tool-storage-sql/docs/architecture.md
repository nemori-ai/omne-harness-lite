# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块                                   | 职责                                                                         | 持有的状态           |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| `src/options.ts`                       | 选项类型与 `TOOL_STORAGE_OWNER`                                              | 无                   |
| `src/tenant.ts`                        | 由租户形状得到合法租户文本，经目录取得事务域；构造一次 `tool` 命令的提交请求 | 无                   |
| `src/json.ts`                          | 严格 JSON 编码，拒绝 JSON 不能承载的值                                       | 无                   |
| `src/ledger-store.ts`、`src/ledger-wire.ts` | `ToolLedgerStore` 适配器（含 `due`）；共用的地址、写入、断言编码与结果映射 | 无                   |
| `src/body-store.ts`                    | `ToolBodyStore` 适配器：在本进程校验许可，再发出分块、封存与删除命令；按范围分次读取 | 无，构造时记下密钥与时钟 |
| `src/materials.ts`                     | 静态材料描述                                                                 | 无                   |
| `src/worker/schema.ts`                 | 表、迁移身份、handler 名与读上限                                             | 无                   |
| `src/worker/facts.ts`                  | 适配器与 Worker 模块共用的事实协议及其解析                                   | 无                   |
| `src/worker/participant.ts`、`participant-body.ts` | `tool` 参加者，在写事务内执行账本写入、到期索引与正文命令      | 无（数据库中的行）   |
| `src/worker/migration.ts`、`read-*.ts` | 迁移与三个读 handler（`read-ledger`、`read-body`、`read-due`）               | 无                   |

依赖方向：适配器依赖 `@omne-harness/tool` 根入口（`ToolLedgerStore`、`LedgerRecord`、`recordKey`、`isTenantShape`）、`@omne-harness/tool-contract`、`@omne-harness/sql-contract` 与 `legal-identity`。Worker 模块只依赖 `sql-contract` 的根与 `./worker` 入口。本包不导入任何 SQL 提供者、node:sqlite 或 Cordis。依赖 `tool` 根入口是有意的（评审 N8）：新增记录种类不需要改本包，因为记录仓按键保存记录，不解释记录。

## 关键机制与理由

表（全部以租户为主键第一列）：

| 表            | 主键                     | 内容                                              |
| ------------- | ------------------------ | ------------------------------------------------- |
| `tl_domain`   | 租户、种类、名           | 账本域的修订号文本                                |
| `tl_record`   | 租户、种类、名、键       | 一条记录的 JSON 文本                              |
| `tl_body_chunk` | 租户、调用、正文、序号 | 正文的一块不可变字节 |
| `tl_body_manifest` | 租户、调用、正文 | 封存清单：块数、字节数、SHA-256 |
| `tl_due` | 租户、域种类、域名、键 | 到期索引条目的时刻 `due_at`；另有索引 `(tenant, due_at)` |

- 账本域是行组，不是 SQL 事务域。一个租户的全部账本域都在该租户的 SQL 事务域里（R1-D2）。一次 `ToolLedgerStore.commit` 是一次 SQL 提交，修订号核对在参加者内、写事务内进行，所以条件在提交执行时判断，不在调用时判断。
- 每次提交用新的 SQL 操作键。理由：`ToolLedgerStore` 的提交没有操作身份，同一输入可以合法地重放并必须答 `conflict`。认回由账本按它写的操作记录完成，正文存储按分块与清单的现状完成。
- 正文表不在任何账本域内，不碰 `tl_domain`（TS-06）。正文的写入、封存与删除不推进修订号，账本按写入前的修订号做的 CAS 不因此冲突。
- 许可在适配器内、用存储自己的时钟校验（TS-13）。参加者不接收时钟，只保持对象不可变：同序号只写一次，清单只封存它声明的分块，删除不留行。
- 读 handler 的输出上限取提供者 `maxReadResultBytes` 的初值 4194304。账本整域读超过它或超过 100000 行时拒绝，不截断。

## 验证与维护

保证与持续验证的对应见 [SPEC.md 的组合与验证](../SPEC.md#组合与验证)。改动 Worker 模块会改变模块摘要与清单摘要，应用要登记新组合版本。改表结构要新增迁移，不改已发布的迁移。端口形状变化时同步 `tests/` 的套件接线。

