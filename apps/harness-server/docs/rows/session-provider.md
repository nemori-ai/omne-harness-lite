# `session-provider` 行

本页是 `session-provider` 行的行规格。行的代码在 `src/rows/session-provider/`。两种模式共同的规则归 [real-mode.md](../real-mode.md)。Session 面的行为归 [`@omne-harness/session-contract` 的 SPEC](../../../../packages/session/session-contract/SPEC.md)。

行目录里有两份实现，发行配置指向真件：

| 项               | 真件（`real.ts`）                                                                                  | 契约替身（`index.ts` 的 `createSessionProviderRow`） |
| ---------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 导出名           | `sessionProviderRow`（`src/rows/session-provider/index.ts`，发行配置的 `plugin`）                  | 只经工厂取得，不在 `./cordis` 里                     |
| 实现种类         | `real`：`@omne-harness/session-cordis` 的 `SessionProvider`                                        | `contract-double`                                    |
| 提供             | `session`                                                                                          | `session`                                            |
| 必需（`inject`） | `sessionAccessCheck`、`sessionDelegatedTransactions`、`sessionPrincipals`、`sessionWorkPrincipals` | 同左                                                 |
| 阶段             | `business`，行体承载：行体在隔离的 `s0.assemblyLifecycle` 下装插件，取插件登记的句柄作为行句柄     | 无                                                   |
| 配置             | `SessionProvider.Config`；发行给 `admission: 'none'`                                               | 无                                                   |

真件的清单与 `src/s0/stubs.ts` 的同一行相同，含阶段；替身的清单除阶段外相同。`tests/rows/session-provider/manifest.spec.ts` 与 `real.spec.ts` 比较两者。

真件按调用现取 `sessionIdentity`、`sessionEvidence`、`sessionContextInput`、`sessionIdleInput`、`sessionAgentDrive`、`sessionScopeRelease`、`sessionClock`、`sessionNotifier` 与 `sessionTransactions`（session-cordis 的端口接线）。某个端口缺席或是 S0 替身时，需要它的操作答 `unavailable`，`owner` 是该端口的服务键。发行树里 `create` 经过的端口都是真件：`session-ad09`、`session-ad10`（采用来源是 `adoption-sources` 行，它对 `create` 出具 Session 的初始化守卫，内容来自部署映射条目）、`session-ad12`（接在真件 `runtime-context` 与入口对象 `runtimeContextTrust` 上）。新租户经发行树的首个 `create` 成功，见 `tests/r9/` 与 `create-release.spec.ts`；`create.spec.ts` 的替身用例保留 S0 替身换回 `session-ad12` 时点名 `sessionContextInput` 的答法。

新租户的第一次 `create`：Session 核心先经委派视图 `queryOperation` 再提交，`session-storage` 行对放行的 `create` 所绑定的视图在第一次解析租户域时登记该租户（`tests/rows/session-provider/create-storage.spec.ts`）。

## 契约替身

**替身没有业务持久性。** 会话只存在进程内存里。进程重启或行重载之后，会话与游标全部消失。它留给观察到达主体的用例与 R9 进程内一层（`tests/r9/arrival.spec.ts`）。

替身在服务键 `session` 下提供 Session 的四个面。它不运行 Agent，不写存储，不推进 Run。

替身只读 `sessionAccessCheck`。另外三个名字替身不读，因为它不接存储也不签发主体。它们留在清单里，让行的可见范围与启动次序和真实提供者一致。

## 实现的操作

替身实现 `server-entry` 调用的七个方法。其余方法答 `unavailable`，`owner` 是 `session-provider`，诊断文字固定，不抛出。

| 方法                              | 行为                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `management.create`               | 按（租户，会话）登记会话，记下创建的 operation。同一 operation 与同一创建输入重放，答原回执，`recovered` 为真。同一 operation 异创建输入答 `conflict`。会话已存在而 operation 不同答 `invalid`                 |
| `work.accept`                     | 只对本租户已登记的会话追加一条输入。普通输入写一条 `message.user` 条目，其他输入写一条 `intake.routed` 条目。operation 重放答原回执。同一 operation 异输入答 `conflict`。同一输入身份换 operation 答 `invalid` |
| `work.queryOperation`             | 答 operation 的已知结果 `committed`。没见过的 operation 答 `unknown`。属于控制记录的身份答 `conflict`                                                                                                          |
| `work.cancelRun`、`work.stopCall` | 会话从未有过 Run 或调用，所以答成功回执，答案是 `not-found`。回执只保存操作答案，不增加条目与修订。Tool 目标的 `stopCall` 答 `unsupported`，先于会话核对                                                       |
| `history.begin`、`history.next`   | 按本会话已接受的输入给出条目，按字节分页。游标由替身签发，绑定租户与会话。伪造的或别的会话的游标答 `invalid`                                                                                                   |

选择说明：

- `not-committed` 需要存储提供者给出排除证明，替身给不出，所以没见过的 operation 答 `unknown`。
- `cancelRun` 与 `stopCall` 的 `not-found` 依据是 Session SPEC「控制与模型选择」：替身拥有全部状态，目标的缺席已被覆盖，答 `not-found` 而不是 `unavailable`。
- 会话已存在而 operation 不同时，Session SPEC 的 `create` 行写 `invalid`，替身照此答。

## 访问检查与租户

每个方法先调用注入的 `sessionAccessCheck`，请求与真实提供者发出的相同：变更用命令构造，读取用读取请求。

- `denied` 与 `unavailable` 原样转成面的失败，替身状态不变。检查抛出时答 `unavailable`，错误文字不进失败。
- 重放与原操作查询也先过检查。检查拒绝时不答已存结果。
- 检查放行后，替身用（租户，会话）判断会话是否登记。对另一租户的会话与对没人登记的会话，答同一个 `denied`，字节相同，`action` 是方法名。存在性不披露。
- `authorization` 行的会话政策只比较主体的租户与访问的租户。会话归属由替身自己判断。
- 租户 B 用租户 A 用过的会话 id 创建会话时，得到租户 B 自己的新会话。租户 A 的会话不受影响。

## 到达的主体

替身把每次到达的调用报告给装配者交来的观察者。一条报告只含分类与结论：

| 字段             | 内容                                                 |
| ---------------- | ---------------------------------------------------- |
| `method`         | 七个方法之一                                         |
| `principalKind`  | `system`、`acting-for-tenant` 或 `unrecognized`      |
| `actorComponent` | 主体背后系统部分的组件名，没有时为 `null`            |
| `access`         | 访问检查的结论：`allowed`、`denied` 或 `unavailable` |
| `outcome`        | `ok`，或面答出的失败种类                             |

报告不含主体对象、登录证明、凭据或签发者。观察者抛出的错误不改变面的答案。

取出证据的办法：

```ts
const arrivals: SessionProviderArrival[] = []
const row = createSessionProviderRow({ observe: arrival => arrivals.push(arrival) })
// 把 row 放进 serveOnce 的 plugins，发行配置里用它的键。
```

`createSessionProviderRow` 不进 `src/cordis.ts`，因为 `./cordis` 的每个导出都必须是已声明的行。`./cordis` 只导出 `sessionProviderRow`，它没有观察者。

## 已知限制

- 没有持久性。重启与行重载清空会话、操作记录与游标。
- 游标只在内存里认。游标表满 1024 项时丢弃最旧的游标，被丢弃的游标答 `invalid`。
- 只有 `message.user`、`intake.routed` 与 `session.created` 三种条目。没有助手消息，因为替身不运行 Agent。
- 其余方法答 `unavailable`，包括 `readWork`、`reconciliation` 的全部方法与 `since`。
- 替身不核对主体的租户与访问的租户是否相同。这条规则归 `authorization` 行。

## 测试

用例在 `tests/rows/session-provider/`。`support.ts` 用 `startTree` 装替身、访问检查替身、委派入口替身与真实的主体入口对象，按调用方类取出 Session 面。`serve.spec.ts` 用 `serveOnce` 装替身与真实 `server-entry` 行。

| 文件                     | 覆盖                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.spec.ts`       | `./cordis` 的导出是真件；替身的清单与 `stubs.ts` 的同一行相同，无关闭阶段                                                                    |
| `real.spec.ts`           | 真件在真实存储行上 ACTIVE、经真实面作答、登记一个 `business` 句柄且先于存储行停止、缺 `sessionWorkPrincipals` 时 PENDING                     |
| `create.spec.ts`         | 真件加真实 `session-ad12` 在契约替身（内存事务、身份桥、证据桥、`runtimeContext`）上 `create` 成功；换回 S0 替身则点名 `sessionContextInput` |
| `create-storage.spec.ts` | 真件在真实存储行上：新租户第一次 `create` 得到回执并登记进目录；同一存储上重开的树读回会话                                                   |
| `create-release.spec.ts` | 发行路径的真实行（真实存储、发行映射的 `agent-adoptions`、`adoption-sources`、`session-ad10`、`runtime-context`、`session-ad12`、真件）加真实入口对象：按 `server-entry` 的方式构造的首个 `create` 成功，重开的树读回会话；映射没有的定义或别的候选答 `invalid`，不创建 |
| `faces.spec.ts`          | 七个方法经 `session` 服务键调用：重放幂等、冲突、历史给出已接受的输入、分页、游标、控制答案、其余方法不可用                                  |
| `tenancy.spec.ts`        | 另一租户的会话、未登记的会话与外租户主体，对六个会话方法答同一个 `denied`                                                                    |
| `access-check.spec.ts`   | 每个方法先问检查、`denied` 与 `unavailable` 原样转出且状态不变、检查抛出、到达报告                                                           |
| `serve.spec.ts`          | 行 ACTIVE、经回环 HTTP 建会话并发输入、输入到达替身、历史读回、输出不含登录证明与凭据                                                        |
