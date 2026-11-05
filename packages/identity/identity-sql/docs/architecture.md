# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：模块划分、依赖方向、状态与资源归属、关键机制及理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

```text
src/index.ts ──▶ provider.ts ──▶ materials.ts ──▶ worker/schema.ts
                 │                 │
                 │                 └─ 读模块文件字节，算摘要
                 ├──▶ governance.ts（治理端口）──▶ deadline.ts、identifiers.ts、result.ts、worker/schema.ts
                 ├──▶ result.ts（basis-unavailable、读失败原因、IdentitySqlResultUnknown）
                 ├──▶ deadline.ts（截止时刻加法与时长比较）
                 ├──▶ identifiers.ts（标识、操作键、凭证与摘要）
                 └──▶ worker/schema.ts（事实与读输出的形状、表名、操作名、排序键）
src/cordis.ts ──▶ provider.ts、materials.ts、config.ts
src/worker/participant.ts、migration*.ts、read-*.ts ──▶ worker/schema.ts、worker/support.ts
```

| 模块             | 持有什么                                                                                                           | 允许依赖                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `provider.ts`    | 一个实例的停止标志与最晚时钟读数。三项操作、资格读口与它们的结果映射。把同一实例的存储、时钟与停止标志交给治理端口 | identity、legal-identity、utc-instant、scrypt（类型）、sql-contract（类型）、本包其他主线程模块 |
| `governance.ts`  | 治理端口：输入形状、新标识、邀请时长、预读、提交与读的结果映射。没有自己的状态                                     | identity、legal-identity、utc-instant、sql-contract（类型）、本包其他主线程模块                 |
| `result.ts`      | `basis-unavailable` 答复、读失败原因、`IdentitySqlResultUnknown`                                                   | sql-contract（类型）、utc-instant（类型）                                                       |
| `materials.ts`   | 参加者、迁移与读 handler 的描述，事务域与组合版本，各算一次                                                        | sql-contract 的纯函数、`worker/schema.ts`                                                       |
| `config.ts`      | 配置形状、校验、四项初值与两个常量期限源                                                                           | identity（类型）、utc-instant、`deadline.ts`                                                    |
| `deadline.ts`    | 86400 秒天的加法、正数判断与时长比较                                                                               | utc-instant                                                                                     |
| `identifiers.ts` | 随机标识、操作键、请求键、登录凭证与 SHA-256                                                                       | legal-identity、node:crypto                                                                     |
| `cordis.ts`      | 插件体与五个服务子类                                                                                               | kernel-basis、identity `./cordis`、sql-contract `./cordis`、scrypt                              |
| `worker/*`       | 执行 SQL 与同一事务里的记录核对。没有随机数、时间函数、跨调用状态                                                  | 只有 `worker/schema.ts` 与 `worker/support.ts`，包导入只有类型                                  |

Worker 模块由存储提供者在 Worker 线程里按 `file:` URL 加载，不经本包的根入口。它们只用可擦除的 TypeScript 语法，相对导入带 `.ts` 后缀，所以源码与 `dist` 两种布局都能加载。

## 关键机制与理由

**计算在主线程，核对随写入。** 参加者声明 `singleton`，提供者仍要求模块纯度。标识、摘要、时刻、排序键与 scrypt 材料都在提交前算好，放进 `facts`。参加者没有随机数与时间函数，所以满足 sqlite-provider §4.5 的模块层条件。代价：事实多几个字段。

**治理核对在提交里。** 治理写操作的三项核对（发起登录有效、行动者角色、预期状态）必须与写入同处一个事务，否则两位管理员可以都通过最后管理员核对。所以核对写在参加者里，在同一条命令里先核对、后写入。角色名由主线程从默认团队方案放进事实，治理命令的角色来自采用模型，预留参加者按固定的同一映射核对资格。拒绝照常提交并在响应里给出结果，不用 `conflict` 回滚：一次接受或过期判定要在答 `no-change` 的同时写下终结。治理读的同类核对在读 handler 里，与读对象同一个快照。

**排序键代替时间函数。** 参加者与读 handler 要比较时刻，但不能调用时间函数，编码时刻的文本也不能直接比较（`0.5` 与 `0.500` 相等而文本不同）。排序键是日历部分、一个点、去掉末尾零的小数部分，它的文本次序等于 `compareInstants` 的次序。主线程算本次读数的键，SQL 用 `substr`、`rtrim`、`iif` 算列的键，`tests/order-key.spec.ts` 核对两者一致。

**组合版本跟着参加者的导入闭包走。** 参加者的代码摘要只覆盖 `participant` 文件，而发起登录、成员资格与组织种类的核对 SQL 在 `support` 里，参加者与读 handler 共用。`materials.ts` 沿 `participant` 的相对导入找到全部模块，把它们的文件摘要与清单摘要合成版本摘要（SPEC IS-01）。改其中任一文件就登记新的组合版本。

**预读只给计算用。** 发出邀请要被邀请者的租户文本，空闲刷新要签发时冻结的空闲时长，两者都要先读才能算。提供者先做一次快照读，再提交。参加者在提交里重新核对，预读的值不决定答复。

**注册是一条命令五行。** 一次 `commit` 使用一个事务域、一条 `identity` 命令。任一行失败由提供者明确回滚（sql-contract §7.6）。参加者先查同标识，已存在时回复 `conflict`，列内唯一约束是第二道保护。这样并发注册同一标识至多一个成功，而且被拒绝的注册不占用标识。

**提交结果的映射各在一处。** 三项操作的映射在 `provider.ts`，治理的映射在 `governance.ts` 的 `write`。`committed` 是成功，`rolled_back` 与 `rejected_before_accept` 是确定的未提交，`unknown` 先 `query` 认回，仍未知时拒绝 Promise。注册与治理认回最多三次，签发认回一次。拒绝 Promise 表示结果未知，调用方按 ID-17 或 ID-18 认回。

**读 handler 的输出在主线程再判断一次。** Worker 交回 JSON，`parseIssueBasis`、`parseLoginByProof`、`parseStanding` 与 `governance.ts` 的解析函数把它解析成类型化的值。畸形输出答 `basis-unavailable` 或 `unavailable`，不答确定结果。名单的一项不能解析时，整份名单答 `basis-unavailable`。

**假材料。** 插件体对随机秘密派生一次，只存在内存里。账号不存在时提供者仍对它调用 `verify`，再答 `uniform-auth-failure`。两种账号经过同一个 scrypt 名额与队列，所以 `queue_full` 出现的条件相同，`basis-unavailable` 不能枚举账号。

**读口的证据只由输入算出。** `not-member` 的证据是租户文本的 SHA-256 与修订号 `'0'`。它不读任何行，所以未知租户与非成员的答复相同。`member` 的修订号才来自行。

**截止时刻的加法自带。** utc-instant 没有加法，identity 的加法只在 `./testing`。产品代码不导入 `./testing`，所以本包保留一份相同的算法。它按 86400 秒天计算，不计闰秒，与契约套件的预期一致。

**时钟下界。** 一个实例记住采用过的最晚读数。识别时下界再取 `issued_at` 中较晚者。不用 `max(issued_at)` 补跨重启的下界：时刻列是编码文本，`0.5` 与 `0.500` 相等而文本不同，SQL 不能按文本求最大值。

**停止与关闭在同一个 effect 里。** 先 `stop()` 再 `await close()`。不同 effect 的撤除并发驱动，只有一个撤除函数能保证次序。

## 验证与维护

| 保证                         | 验证资源                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| 契约套件通过（R4-1）         | `tests/operations-contract.spec.ts`                                                       |
| 重启后记录仍在（R4-2）       | `tests/restart.spec.ts`                                                                   |
| 秘密只以派生形式保存（R4-3） | `tests/credential-storage.spec.ts`                                                        |
| 注册单事务（R4-4）           | `tests/register-transaction.spec.ts`                                                      |
| 读口不区分（R4-5）           | `tests/standing.spec.ts`                                                                  |
| 停止后                       | `tests/stopped.spec.ts`                                                                   |
| scrypt 映射与假材料          | `tests/scrypt-mapping.spec.ts`                                                            |
| 插件                         | `tests/cordis-entry.spec.ts`                                                              |
| 治理契约套件通过（AC-1）     | `tests/governance-contract.spec.ts`                                                       |
| 四项核对的负控               | `tests/governance-negative.spec.ts`                                                       |
| 最后管理员并发（AC-2）       | `tests/last-admin-concurrent.spec.ts`                                                     |
| 撤销跨进程、从 001 升级      | `tests/governance-restart.spec.ts`                                                        |
| 名单上限、提交映射、排序键   | `tests/list-limit.spec.ts`、`tests/governance-mapping.spec.ts`、`tests/order-key.spec.ts` |

设计变化时同步的消费者：改事实形状时同步参加者、`provider.ts` 或 `governance.ts` 与 SPEC IS-02、IS-04、IS-10；改治理核对的写法时同步 `tests/fixtures/mutants.ts` 的锚点；改读输出时同步三个解析函数；改组合版本规则时同步 `materials.ts`、SPEC IS-01、`tests/combination-version.spec.ts` 与应用的登记；改停止语义时同步 `cordis.ts`、SPEC IS-07 与 `docs/cordis.md`。

## 成员协调

`coordination.ts` 执行持久预留、可信目标封口及治理恢复。`worker/standing.ts` 的共同门与成员写入同事务执行，`read-coordination.ts` 提供有界枚举。原登录和治理核对保留在 `participant.ts`；恢复没有系统授权分支。完整状态规则归 [IS-16](../SPEC.md#is-16)。
