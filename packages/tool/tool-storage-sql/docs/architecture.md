# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块                                   | 职责                                                                         | 持有的状态           |
| -------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| `src/options.ts`                       | 选项类型、`CHUNK_ENVELOPE_BYTES` 与构造期核对                                | 无                   |
| `src/tenant.ts`                        | 由租户形状得到合法租户文本，经目录取得事务域；构造一次 `tool` 命令的提交请求 | 无                   |
| `src/json.ts`                          | 严格 JSON 编码，拒绝 JSON 不能承载的值                                       | 无                   |
| `src/ledger-store.ts`                  | `ToolLedgerStore` 适配器                                                     | 无                   |
| `src/custody.ts`                       | `ToolOutputCustody` 适配器：分块、清单、认回                                 | 无，构造时记下块大小 |
| `src/materials.ts`                     | 静态材料描述                                                                 | 无                   |
| `src/worker/schema.ts`                 | 表、迁移身份、handler 名与读上限                                             | 无                   |
| `src/worker/facts.ts`                  | 适配器与 Worker 模块共用的事实协议及其解析                                   | 无                   |
| `src/worker/participant.ts`            | `tool` 参加者，在写事务内执行                                                | 无（数据库中的行）   |
| `src/worker/migration.ts`、`read-*.ts` | 迁移与三个读 handler                                                         | 无                   |

依赖方向：适配器依赖 `@omne-harness/tool` 根入口（`ToolLedgerStore`、`LedgerRecord`、`recordKey`、`isTenantShape`、`canonicalDigest`）、`@omne-harness/tool-contract`、`@omne-harness/sql-contract` 与 `legal-identity`。Worker 模块只依赖 `sql-contract` 的根与 `./worker` 入口。本包不导入任何 SQL 提供者、node:sqlite 或 Cordis。依赖 `tool` 根入口是有意的（评审 N8）：新增记录种类不需要改本包，因为记录仓按键保存记录，不解释记录。

## 关键机制与理由

表（全部以租户为主键第一列）：

| 表            | 主键                     | 内容                                              |
| ------------- | ------------------------ | ------------------------------------------------- |
| `tl_domain`   | 租户、种类、名           | 账本域的修订号文本                                |
| `tl_record`   | 租户、种类、名、键       | 一条记录的 JSON 文本                              |
| `tl_chunk`    | 租户、调用、操作、块序号 | 一块原件字节                                      |
| `tl_manifest` | 租户、调用、操作         | 种类、输入摘要、字节数、块数、SHA-256、封印、答复 |

- 账本域是行组，不是 SQL 事务域。一个租户的全部账本域都在该租户的 SQL 事务域里（R1-D2）。一次 `ToolLedgerStore.commit` 是一次 SQL 提交，修订号核对在参加者内、写事务内进行，所以条件在提交执行时判断，不在调用时判断。
- 每次提交用新的 SQL 操作键。理由：`ToolLedgerStore` 的提交没有操作身份，同一输入可以合法地重放并必须答 `conflict`。认回由账本按它写的操作记录完成，保管按清单完成。
- 保管不设单次上限（D2 决策记录结论第 3 条）。理由：执行事实 `final` 必须带 `raw`，保管失败要阻止释放，所以按大小拒绝会让调用永远收不了场。分块让每块各自装进一条命令。清单最后提交，并在参加者内核对块的字节与 SHA-256，所以清单存在就证明原件完整。
- 保管表不在任何账本域内，不碰 `tl_domain`。账本按 retain 之前的修订号做 CAS（评审 N2），保管若推进修订号，每次收场的首轮提交都会冲突。
- 读 handler 的输出上限取提供者 `maxReadResultBytes` 的初值 4194304。账本整域读超过它或超过 100000 行时拒绝，不截断。

## 验证与维护

保证与持续验证的对应见 [SPEC.md 的组合与验证](../SPEC.md#组合与验证)。改动 Worker 模块会改变模块摘要与清单摘要，应用要登记新组合版本。改表结构要新增迁移，不改已发布的迁移。端口形状变化时同步 `tests/` 的套件接线。
