# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：模块划分、依赖方向、状态与资源归属、关键机制及理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
src/index.ts ──▶ provider.ts ──▶ materials.ts ──▶ worker/schema.ts
                 │                 │
                 │                 └─ 读模块文件字节，算摘要
                 ├──▶ deadline.ts（截止时刻加法）
                 ├──▶ identifiers.ts（标识、操作键、凭证与摘要）
                 └──▶ worker/schema.ts（事实与读输出的形状、表名、操作名）
src/cordis.ts ──▶ provider.ts、materials.ts、config.ts、clock.ts
src/worker/participant.ts、migration.ts、read-*.ts ──▶ worker/schema.ts、worker/support.ts
```

| 模块             | 持有什么                                                           | 允许依赖                                                                                        |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `provider.ts`    | 一个实例的停止标志与最晚时钟读数。三项操作、资格读口、全部结果映射 | identity、legal-identity、utc-instant、scrypt（类型）、sql-contract（类型）、本包其他主线程模块 |
| `materials.ts`   | 参加者、迁移与读 handler 的描述，事务域与组合版本，各算一次        | sql-contract 的纯函数、`worker/schema.ts`                                                       |
| `config.ts`      | 配置形状、校验与常量期限源                                         | utc-instant、`deadline.ts`                                                                      |
| `clock.ts`       | 系统时钟                                                           | utc-instant                                                                                     |
| `deadline.ts`    | 86400 秒天的加法与正数判断                                         | utc-instant                                                                                     |
| `identifiers.ts` | 随机标识、操作键、请求键、登录凭证与 SHA-256                       | legal-identity、node:crypto                                                                     |
| `cordis.ts`      | 插件体与两个服务子类                                               | kernel-basis、identity `./cordis`、sql-contract `./cordis`、scrypt                              |
| `worker/*`       | 只执行 SQL。没有随机数、时间函数、跨调用状态                       | 只有 `worker/schema.ts` 与 `worker/support.ts`，包导入只有类型                                  |

Worker 模块由存储提供者在 Worker 线程里按 `file:` URL 加载，不经本包的根入口。它们只用可擦除的 TypeScript 语法，相对导入带 `.ts` 后缀，所以源码与 `dist` 两种布局都能加载。

## 关键机制与理由

**全部计算在主线程，参加者只执行 SQL。** 参加者声明 `singleton`，提供者仍要求模块纯度。标识、摘要、时刻与 scrypt 材料都在提交前算好，放进 `facts`。参加者没有随机数与时间函数，所以满足 sqlite-provider §4.5 的模块层条件。代价：事实多几个字段。

**注册是一条命令五行。** 一次 `commit` 使用一个事务域、一条 `identity` 命令。任一行失败由提供者明确回滚（sql-contract §7.6）。参加者先查同标识，已存在时回复 `conflict`，列内唯一约束是第二道保护。这样并发注册同一标识至多一个成功，而且被拒绝的注册不占用标识。

**提交结果的映射只在 `provider.ts` 一处。** `committed` 是成功，`rolled_back` 与 `rejected_before_accept` 是确定的未提交，`unknown` 先 `query` 认回，仍未知时拒绝 Promise。注册认回最多三次，签发认回一次。拒绝 Promise 表示结果未知，调用方按 ID-17 认回。

**读 handler 的输出在主线程再判断一次。** Worker 交回 JSON，`parseIssueBasis`、`parseLoginByProof`、`parseStanding` 把它解析成类型化的值。畸形输出答 `basis-unavailable` 或 `unavailable`，不答确定结果。

**假材料。** 插件体对随机秘密派生一次，只存在内存里。账号不存在时提供者仍对它调用 `verify`，再答 `uniform-auth-failure`。两种账号经过同一个 scrypt 名额与队列，所以 `queue_full` 出现的条件相同，`basis-unavailable` 不能枚举账号。

**读口的证据只由输入算出。** `not-member` 的证据是租户文本的 SHA-256 与修订号 `'0'`。它不读任何行，所以未知租户与非成员的答复相同。`member` 的修订号才来自行。

**截止时刻的加法自带。** utc-instant 没有加法，identity 的加法只在 `./testing`。产品代码不导入 `./testing`，所以本包保留一份相同的算法。它按 86400 秒天计算，不计闰秒，与契约套件的预期一致。

**时钟下界。** 一个实例记住采用过的最晚读数。识别时下界再取 `issued_at` 中较晚者。不用 `max(issued_at)` 补跨重启的下界：时刻列是编码文本，`0.5` 与 `0.500` 相等而文本不同，SQL 不能按文本求最大值。

**停止与关闭在同一个 effect 里。** 先 `stop()` 再 `await close()`。不同 effect 的撤除并发驱动，只有一个撤除函数能保证次序。

## 验证与维护

| 保证                         | 验证资源                             |
| ---------------------------- | ------------------------------------ |
| 契约套件通过（R4-1）         | `tests/operations-contract.spec.ts`  |
| 重启后记录仍在（R4-2）       | `tests/restart.spec.ts`              |
| 秘密只以派生形式保存（R4-3） | `tests/credential-storage.spec.ts`   |
| 注册单事务（R4-4）           | `tests/register-transaction.spec.ts` |
| 读口不区分（R4-5）           | `tests/standing.spec.ts`             |
| 停止后                       | `tests/stopped.spec.ts`              |
| scrypt 映射与假材料          | `tests/scrypt-mapping.spec.ts`       |
| 插件                         | `tests/cordis-entry.spec.ts`         |

设计变化时同步的消费者：改事实形状时同步参加者、`provider.ts` 与 SPEC IS-02、IS-04；改读输出时同步三个解析函数；改组合版本规则时同步 `materials.ts`、SPEC IS-01 与应用的登记；改停止语义时同步 `cordis.ts`、SPEC IS-07 与 `docs/cordis.md`。
